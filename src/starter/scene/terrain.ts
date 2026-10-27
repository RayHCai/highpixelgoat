import * as THREE from "three";
import type { ScenarioSpec, Style } from "../spec/schema";
import { focusPoints, gridFor, heightCap, surfaceAt, type Grid } from "./layout";
import { cellId, fbm, makeRng } from "./noise";
import { SETTINGS, STYLE_LOOKS, TERRAIN_PALETTES, type TerrainPalette } from "./palette";

/**
 * Procedural ground. A height field is generated from the spec seed, then
 * turned into a style-specific mesh: voxel columns for "pixels", a jittered
 * flat-shaded triangle mesh for "lowpoly" and "drawing".
 *
 * Two levels of detail share the same noise functions in world coordinates:
 * a fine inner square under the subject, and a coarse outer ring that carries
 * the landscape to the horizon when the camera is far away.
 *
 * The ground under and in front of the subject is always flat and low: the
 * camera sits on the +z side, so relief there is capped to the line of sight
 * (see heightCap) and nothing can hide the subject.
 */

export interface TerrainLod {
  /** Grid size in cells. */
  size: number;
  /** World units per cell. */
  cell: number;
  /** Half-extent of a central square to leave empty (covered by a finer LOD). */
  hole: number;
}

/** Fine detail: 200 x 200 world units at one unit per cell. */
export const INNER_LOD: TerrainLod = { size: 200, cell: 1, hole: 0 };
/** Coarse ring: 720 x 720 world units at four units per cell, hollow centre. */
export const OUTER_LOD: TerrainLod = { size: 180, cell: 4, hole: 100 };
/** World extent of the fine terrain, used by clouds and the camera. */
export const TERRAIN_SIZE = INNER_LOD.size * INNER_LOD.cell;
/** Shifts the noise so roughly three quarters of a neutral map is land. */
const LAND_BIAS = 0.16;
/** Flat ground under the subject sits this far above sea level (a voxel quarter-step multiple). */
export const PLATEAU_ABOVE_SEA = 1.5;
/** Radius of perfectly flat ground around the subject, and where the blend to full relief ends. */
const FLAT_RADIUS = 14;
const BLEND_RADIUS = 26;

export interface TerrainData {
  lod: TerrainLod;
  /** Column height per cell in world units (0 = sea floor). */
  heights: Float32Array;
  /** RGB per cell, already style-adjusted. */
  colors: Float32Array;
  /** 1 where the cell is inside the hole and must not be drawn. */
  skip: Uint8Array;
  /** Cells at or below this height are water. */
  seaLevel: number;
  palette: TerrainPalette;
}

function idx(x: number, z: number, size: number): number {
  return z * size + x;
}

function adjustColor(hex: string, saturation: number): THREE.Color {
  const c = new THREE.Color(hex);
  if (saturation !== 1) {
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * saturation), hsl.l);
  }
  return c;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Park pond: a soft blob off to the back-right of the subject. */
const POND = { x: 17, z: -19, r: 7.5 };

/** Winding gravel paths through a park: the ridges of a slow noise field. */
export function isParkPath(x: number, z: number, seed: number): boolean {
  return Math.abs(fbm(x / 22, z / 22, seed + 31, 3) - 0.5) < 0.018;
}

export function buildTerrainData(spec: ScenarioSpec, lod: TerrainLod = INNER_LOD): TerrainData {
  const { size, cell, hole } = lod;
  const palette = TERRAIN_PALETTES[spec.world.terrain];
  const setting = SETTINGS[spec.world.terrain];
  const grid: Grid | null = gridFor(spec.world.terrain);
  const look = STYLE_LOOKS[spec.style];
  const seed = spec.world.seed;
  const heights = new Float32Array(size * size);
  const colors = new Float32Array(size * size * 3);
  const skip = new Uint8Array(size * size);
  const half = size / 2;
  const seaLevel = palette.seaLevel;
  const plateau = seaLevel + PLATEAU_ABOVE_SEA;
  const terrain = spec.world.terrain;
  const isIsland = terrain === "island";
  const isOcean = terrain === "ocean";
  const isPark = setting.layout === "park";
  /** Radius at which island terrain has fallen back to sea, in world units. */
  const islandRadius = (INNER_LOD.size * INNER_LOD.cell) / 2;
  const focus = focusPoints(spec.subject.keyframes);

  const ground = palette.ground.map((g) => adjustColor(g, look.saturation));
  const water = adjustColor(palette.water, look.saturation);
  const deepWater = adjustColor(palette.deepWater, look.saturation);
  const sand = adjustColor(palette.sand, look.saturation);
  const forest = adjustColor(palette.forest, look.saturation);
  const rock = adjustColor(palette.rock, look.saturation);
  const snow = adjustColor(palette.snow, look.saturation);
  const asphalt = adjustColor(setting.layout === "city" ? "#55575c" : "#6b6c70", look.saturation);
  const pavement = adjustColor("#bcb8b0", look.saturation);
  const concrete = adjustColor("#b5b2aa", look.saturation);
  const plaza = adjustColor("#cdc6b8", look.saturation);
  const path = adjustColor("#cdb98f", look.saturation);
  const scratch = new THREE.Color();

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = idx(x, z, size);
      const wx = (x - half + 0.5) * cell;
      const wz = (z - half + 0.5) * cell;
      if (hole > 0 && Math.abs(wx) < hole && Math.abs(wz) < hole) skip[i] = 1;
      const d0 = Math.sqrt(wx * wx + wz * wz);

      // Large-scale continent shape + medium relief + fine detail.
      const cont = fbm(wx / 90, wz / 90, seed + 3, 3);
      const relief = fbm(wx / 28, wz / 28, seed, 5);
      let e = (cont * 0.45 + relief * 0.55 - 0.5 + LAND_BIAS - palette.waterBias * 0.5) * 2;

      if (isIsland) {
        const r = d0 / islandRadius;
        e -= Math.pow(r, 2.2) * 1.4;
      } else if (isOcean) {
        e -= 0.1;
      }

      let h = seaLevel + e * 9 * palette.relief;

      if (isPark) {
        const pd = Math.hypot(wx - POND.x, wz - POND.z);
        h -= 2.5 * (1 - smoothstep(POND.r * 0.7, POND.r, pd));
      }

      // Flat ground under the subject, blending out to the natural relief.
      const flat = 1 - smoothstep(FLAT_RADIUS, BLEND_RADIUS, d0);
      h = h + (plateau - h) * flat;
      // Nothing on the camera side rises above the line of sight.
      const cap = plateau + heightCap(wx, wz, focus);
      if (h > cap) h = cap;
      // Built-up settings never flood.
      if (grid && h < seaLevel + 0.6) h = seaLevel + 0.6;

      h = Math.max(0, h);
      heights[i] = h;

      // Surface colour.
      const surface = grid ? surfaceAt(grid, wx, wz, cell) : null;
      let c: THREE.Color;
      if (h <= seaLevel) {
        const depth = (seaLevel - h) / 4;
        c = scratch.copy(water).lerp(deepWater, Math.min(1, depth));
      } else if (surface === "road") {
        c = scratch.copy(asphalt).offsetHSL(0, 0, (fbm(wx * 0.7, wz * 0.7, seed + 23, 2) - 0.5) * 0.05);
      } else if (surface === "walk") {
        c = pavement;
      } else if (surface === "lot" && setting.layout === "city") {
        const onPlaza = Math.max(Math.abs(wx), Math.abs(wz)) < 9;
        c = scratch
          .copy(onPlaza ? plaza : concrete)
          .offsetHSL(0, 0, (fbm(wx * 0.5, wz * 0.5, seed + 29, 2) - 0.5) * 0.06);
      } else if (isPark && d0 > 4 && isParkPath(wx, wz, seed)) {
        c = path;
      } else if (!grid && !isPark && h < seaLevel + 0.55) {
        c = sand;
      } else if (h > palette.snowLine) {
        c = snow;
      } else if (h > palette.rockLine) {
        c = scratch
          .copy(rock)
          .lerp(snow, Math.max(0, (h - palette.rockLine) / (palette.snowLine - palette.rockLine)) * 0.5);
      } else {
        const patch = cellId(wx, wz, seed + 5, grid ? 3 : 7);
        const moisture = fbm(wx / 16, wz / 16, seed + 11, 4);
        const g = ground[Math.floor(patch * ground.length) % ground.length]!;
        c = !grid && moisture > 0.6 ? scratch.copy(g).lerp(forest, 0.75) : scratch.copy(g);
        // Subtle per-cell variation keeps large fields from looking flat.
        const v = (fbm(wx * 0.9, wz * 0.9, seed + 17, 2) - 0.5) * 0.08;
        c.offsetHSL(0, 0, v);
      }
      const o = i * 3;
      colors[o] = c.r;
      colors[o + 1] = c.g;
      colors[o + 2] = c.b;
    }
  }

  return { lod, heights, colors, skip, seaLevel, palette };
}

/** Height of the ground surface at world (x, z). */
export function groundHeightAt(data: TerrainData, x: number, z: number): number {
  const { size, cell } = data.lod;
  const half = size / 2;
  const gx = Math.min(size - 1, Math.max(0, Math.round(x / cell + half - 0.5)));
  const gz = Math.min(size - 1, Math.max(0, Math.round(z / cell + half - 0.5)));
  return Math.max(data.seaLevel, data.heights[idx(gx, gz, size)]!);
}

/** True when the ground at (x, z) is under water. */
export function isWaterAt(data: TerrainData, x: number, z: number): boolean {
  const { size, cell } = data.lod;
  const half = size / 2;
  const gx = Math.min(size - 1, Math.max(0, Math.round(x / cell + half - 0.5)));
  const gz = Math.min(size - 1, Math.max(0, Math.round(z / cell + half - 0.5)));
  return data.heights[idx(gx, gz, size)]! <= data.seaLevel;
}

export interface TerrainMeshes {
  group: THREE.Group;
  /** Average land colour, used for the far plane and fog blending. */
  horizonColor: THREE.Color;
  outer: TerrainData;
}

/** Build both LODs plus a far disc that hides the outer edge in the fog. */
export function buildTerrainMesh(spec: ScenarioSpec, inner: TerrainData): TerrainMeshes {
  const group = new THREE.Group();
  const outer = buildTerrainData(spec, OUTER_LOD);
  const horizon = borderColor(outer);

  for (const data of [inner, outer]) {
    group.add(spec.style === "pixels" ? buildVoxelTerrain(data) : buildPolyTerrain(data, spec.style));
  }

  const far = new THREE.Mesh(
    new THREE.CircleGeometry(OUTER_LOD.size * OUTER_LOD.cell * 4, 48),
    new THREE.MeshLambertMaterial({ color: horizon }),
  );
  far.rotation.x = -Math.PI / 2;
  far.position.y = inner.seaLevel - 0.05;
  far.receiveShadow = true;
  group.add(far);

  return { group, horizonColor: horizon, outer };
}

/**
 * Average colour of the outermost ring of cells: whatever the terrain looks
 * like at its edge is what the far disc should continue (sea for islands,
 * fields for plains).
 */
function borderColor(data: TerrainData): THREE.Color {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const { size } = data.lod;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (x !== 0 && z !== 0 && x !== size - 1 && z !== size - 1) continue;
      const i = idx(x, z, size);
      r += data.colors[i * 3]!;
      g += data.colors[i * 3 + 1]!;
      b += data.colors[i * 3 + 2]!;
      n++;
    }
  }
  if (n === 0) return new THREE.Color(data.palette.water);
  return new THREE.Color(r / n, g / n, b / n);
}

function buildVoxelTerrain(data: TerrainData): THREE.Object3D {
  const { heights, colors, skip, seaLevel } = data;
  const { size, cell } = data.lod;
  const half = size / 2;
  let count = 0;
  for (let i = 0; i < size * size; i++) if (!skip[i]) count++;

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  let n = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = idx(x, z, size);
      if (skip[i]) continue;
      const h = Math.max(heights[i]!, seaLevel);
      // Columns are quantised to quarter cells so steps read as voxels.
      const q = Math.max(0.25, Math.round(h * 4) / 4);
      m.makeScale(cell, q, cell);
      m.setPosition((x - half + 0.5) * cell, q / 2, (z - half + 0.5) * cell);
      mesh.setMatrixAt(n, m);
      color.setRGB(colors[i * 3]!, colors[i * 3 + 1]!, colors[i * 3 + 2]!);
      mesh.setColorAt(n, color);
      n++;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildPolyTerrain(data: TerrainData, style: Style): THREE.Object3D {
  const { heights, colors, skip, seaLevel } = data;
  const { size, cell } = data.lod;
  const half = size / 2;
  const rng = makeRng(99 + size);
  const group = new THREE.Group();

  // Jittered vertex grid so triangles are irregular. Each quad becomes two
  // triangles with their own flat colour (non-indexed geometry).
  const vx = new Float32Array((size + 1) * (size + 1));
  const vz = new Float32Array((size + 1) * (size + 1));
  const vy = new Float32Array((size + 1) * (size + 1));
  for (let z = 0; z <= size; z++) {
    for (let x = 0; x <= size; x++) {
      const i = z * (size + 1) + x;
      const j = 0.32;
      vx[i] = (x - half + (x > 0 && x < size ? (rng() - 0.5) * j : 0)) * cell;
      vz[i] = (z - half + (z > 0 && z < size ? (rng() - 0.5) * j : 0)) * cell;
      // Vertex height = mean of the surrounding cells for a continuous surface.
      let sum = 0;
      let n = 0;
      for (let dz = -1; dz <= 0; dz++) {
        for (let dx = -1; dx <= 0; dx++) {
          const cx = x + dx;
          const cz = z + dz;
          if (cx < 0 || cz < 0 || cx >= size || cz >= size) continue;
          sum += heights[idx(cx, cz, size)]!;
          n++;
        }
      }
      vy[i] = n ? sum / n : 0;
    }
  }

  let drawn = 0;
  for (let i = 0; i < size * size; i++) if (!skip[i]) drawn++;
  const positions = new Float32Array(drawn * 6 * 3);
  const cols = new Float32Array(drawn * 6 * 3);
  let p = 0;
  const push = (i: number, r: number, g: number, b: number) => {
    positions[p] = vx[i]!;
    positions[p + 1] = vy[i]!;
    positions[p + 2] = vz[i]!;
    cols[p] = r;
    cols[p + 1] = g;
    cols[p + 2] = b;
    p += 3;
  };
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = idx(x, z, size);
      if (skip[i]) continue;
      const a = z * (size + 1) + x;
      const b = a + 1;
      const c = a + size + 1;
      const d = c + 1;
      const r = colors[i * 3]!;
      const g = colors[i * 3 + 1]!;
      const bl = colors[i * 3 + 2]!;
      // Slightly darker second triangle gives the faceted look.
      const k = 0.94;
      push(a, r, g, bl);
      push(c, r, g, bl);
      push(b, r, g, bl);
      push(b, r * k, g * k, bl * k);
      push(c, r * k, g * k, bl * k);
      push(d, r * k, g * k, bl * k);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geometry.computeVertexNormals();

  const material =
    style === "drawing"
      ? new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })
      : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const land = new THREE.Mesh(geometry, material);
  land.castShadow = true;
  land.receiveShadow = true;
  group.add(land);

  // Flat water plane just under sea level, spanning this LOD.
  const extent = size * cell;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(extent, extent),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(data.palette.water), transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = seaLevel + 0.02 - (data.lod.hole > 0 ? 0.01 : 0);
  water.receiveShadow = true;
  group.add(water);
  return group;
}

let gradientTexture: THREE.DataTexture | null = null;
/** Three-step gradient for toon shading, shared by all drawing materials. */
export function toonGradient(): THREE.DataTexture {
  if (gradientTexture) return gradientTexture;
  const data = new Uint8Array([90, 160, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  gradientTexture = tex;
  return tex;
}
