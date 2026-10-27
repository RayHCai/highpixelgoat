import * as THREE from "three";
import { partsTop, subjectParts } from "../spec/parts";
import type { Part, Pattern, ScenarioSpec, Style } from "../spec/schema";
import { toonGradient } from "./terrain";

/**
 * The subject is whatever the scenario is about: a dog, a penny, a person, a
 * pair of cheeks. It arrives as a list of primitives in a unit space (bottom
 * at y=0, largest dimension 1), each with its own colour and rotation.
 * "pixels" voxelises the primitives so every shape reads as blocks; the other
 * styles build smooth or faceted primitives.
 */

function localFrame(p: Part): THREE.Matrix4 {
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(p.rx),
    THREE.MathUtils.degToRad(p.ry),
    THREE.MathUtils.degToRad(p.rz),
    "XYZ",
  );
  return new THREE.Matrix4().makeRotationFromEuler(e);
}

interface Tester {
  part: Part;
  /** World-to-local rotation. */
  inverse: THREE.Matrix4;
  rotated: boolean;
}

function inside(t: Tester, x: number, y: number, z: number, v: THREE.Vector3): boolean {
  const p = t.part;
  v.set(x - p.x, y - p.y, z - p.z);
  if (t.rotated) v.applyMatrix4(t.inverse);
  const dx = v.x / (p.w / 2);
  const dy = v.y / (p.h / 2);
  const dz = v.z / (p.d / 2);
  switch (p.kind) {
    case "sphere":
      return dx * dx + dy * dy + dz * dz <= 1;
    case "box":
      return Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && Math.abs(dz) <= 1;
    case "cylinder":
      return dx * dx + dz * dz <= 1 && Math.abs(dy) <= 1;
    case "cone": {
      const r = (1 - dy) / 2; // radius shrinks from 1 at the base to 0 at the top
      return Math.abs(dy) <= 1 && dx * dx + dz * dz <= r * r;
    }
  }
}

/** Pattern colour for a point in unit space. */
function patternColor(
  pattern: Pattern,
  a: THREE.Color,
  b: THREE.Color,
  x: number,
  y: number,
  z: number,
  cells: number,
): THREE.Color {
  switch (pattern) {
    case "solid":
      return a;
    case "checker": {
      const k = Math.floor(x * cells) + Math.floor(y * cells) + Math.floor(z * cells);
      return (k & 1) === 0 ? a : b;
    }
    case "stripes":
      return Math.floor(y * cells) % 2 === 0 ? a : b;
  }
}

function makePatternTexture(pattern: Pattern, a: string, b: string): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = b;
  const n = 8;
  const s = size / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const on = pattern === "checker" ? (i + j) % 2 === 1 : j % 2 === 1;
      if (on) ctx.fillRect(i * s, j * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface SubjectRig {
  /** Scale this group to size the subject; its bottom sits at local y=0. */
  group: THREE.Group;
  /** Top of the subject in local unit space (for the callout anchor). */
  topLocal: THREE.Vector3;
}

export function buildSubject(spec: ScenarioSpec, style: Style): SubjectRig {
  const parts = subjectParts(spec);
  const group = new THREE.Group();
  group.add(buildModel(parts, style));
  return { group, topLocal: new THREE.Vector3(0, partsTop(parts), 0) };
}

/** A part model in the given style, bottom at y=0, largest dimension 1. Used for the subject and every extra. */
export function buildModel(parts: Part[], style: Style): THREE.Object3D {
  return style === "pixels" ? buildVoxelSubject(parts) : buildPrimitiveSubject(parts, style);
}

/** Voxel resolution of the unit cube. */
const VOXELS = 22;

function buildVoxelSubject(parts: Part[]): THREE.Object3D {
  const n = VOXELS;
  const cell = 1 / n;
  const testers: Tester[] = parts.map((part) => {
    const rotated = Boolean(part.rx || part.ry || part.rz);
    return { part, rotated, inverse: rotated ? localFrame(part).invert() : new THREE.Matrix4() };
  });
  const colors = parts.map((p) => [new THREE.Color(p.color), new THREE.Color(p.color2 ?? p.color)] as const);
  const v = new THREE.Vector3();
  const cells: { x: number; y: number; z: number; color: THREE.Color }[] = [];
  // Y extends above the unit cube so a tall thin model is not clipped.
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n + 2; j++) {
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * cell - 0.5;
        const y = (j + 0.5) * cell;
        const z = (k + 0.5) * cell - 0.5;
        // Later parts are drawn on top of earlier ones (eyes over a head).
        for (let t = testers.length - 1; t >= 0; t--) {
          if (inside(testers[t]!, x, y, z, v)) {
            const [a, b] = colors[t]!;
            // Checker cells are about three voxels wide so the pattern reads at a distance.
            cells.push({ x, y, z, color: patternColor(testers[t]!.part.pattern, a, b, x + 0.5, y, z + 0.5, n / 3) });
            break;
          }
        }
      }
    }
  }
  const geometry = new THREE.BoxGeometry(cell, cell, cell);
  const material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, cells.length));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  cells.forEach((c, i) => {
    m.makeTranslation(c.x, c.y, c.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildPrimitiveSubject(parts: Part[], style: Style): THREE.Object3D {
  const group = new THREE.Group();
  const materials = new Map<string, THREE.Material>();
  const materialFor = (p: Part): THREE.Material => {
    const key = `${p.pattern}|${p.color}|${p.color2 ?? ""}`;
    let mat = materials.get(key);
    if (mat) return mat;
    const map = p.pattern === "solid" ? null : makePatternTexture(p.pattern, p.color, p.color2 ?? p.color);
    mat =
      style === "drawing"
        ? new THREE.MeshToonMaterial({ color: map ? "#ffffff" : p.color, map, gradientMap: toonGradient() })
        : new THREE.MeshLambertMaterial({ color: map ? "#ffffff" : p.color, map, flatShading: true });
    materials.set(key, mat);
    return mat;
  };

  for (const p of parts) {
    let geometry: THREE.BufferGeometry;
    switch (p.kind) {
      case "sphere":
        geometry = new THREE.IcosahedronGeometry(0.5, style === "lowpoly" ? 1 : 2);
        break;
      case "box":
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case "cylinder":
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
        break;
      case "cone":
        geometry = new THREE.ConeGeometry(0.5, 1, 4);
        break;
    }
    const mesh = new THREE.Mesh(geometry, materialFor(p));
    mesh.position.set(p.x, p.y, p.z);
    mesh.scale.set(p.w, p.h, p.d);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(p.rx),
      THREE.MathUtils.degToRad(p.ry),
      THREE.MathUtils.degToRad(p.rz),
      "XYZ",
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
