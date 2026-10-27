import * as THREE from "three";
import type { ScenarioSpec, Style } from "../spec/schema";
import {
  CLEAR_RADIUS,
  focusPoints,
  gridFor,
  heightCap,
  isDetailed,
  lotCentre,
  surfaceAt,
  type Grid,
  type Point,
} from "./layout";
import { fbm, makeRng } from "./noise";
import { SETTINGS, type Setting } from "./palette";
import { groundHeightAt, isParkPath, isWaterAt, toonGradient, type TerrainData } from "./terrain";

/**
 * Everything that stands on the ground and makes a place look like itself:
 * houses, trees and parked cars on a suburban block, towers and street lamps
 * downtown, benches and woodland in a park, and the furniture of a cut-away
 * room around the subject. All of it is boxes, pyramids and balls drawn with
 * three instanced meshes, so even a whole neighbourhood is three draw calls.
 *
 * Sizes are in world units where a person is about 0.6 tall (a terrain cell
 * is 1 unit, roughly 3 m). Anything on the camera side of the subject is
 * capped to the line of sight (heightCap) so nothing ever covers the subject.
 */

type Kind = "box" | "roof" | "ball";

interface Instance {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  color: string;
}

interface Placement {
  /** Extra lift above the ground (for things stacked on other things). */
  y?: number;
  /** Rotation about the vertical axis, radians. */
  ry?: number;
}

class PropSet {
  readonly lists: Record<Kind, Instance[]> = { box: [], roof: [], ball: [] };
  constructor(
    readonly ground: (x: number, z: number) => number,
    /** Everywhere the subject stands; nothing may block the view of any of it. */
    readonly focus: readonly Point[] = [{ x: 0, z: 0 }],
  ) {}

  add(kind: Kind, x: number, z: number, sx: number, sy: number, sz: number, color: string, p: Placement = {}): void {
    this.lists[kind].push({ x, y: this.ground(x, z) + (p.y ?? 0), z, sx, sy, sz, ry: p.ry ?? 0, color });
  }

  /**
   * Height allowed for a footprint so it stays under the line of sight; the
   * nearest point of the footprint to each place the subject stands is what
   * matters.
   */
  cap(x: number, z: number, sx: number, sz: number): number {
    let cap = Number.POSITIVE_INFINITY;
    for (const f of this.focus) {
      const nx = Math.min(Math.max(f.x, x - sx / 2), x + sx / 2);
      const nz = Math.min(Math.max(f.z, z - sz / 2), z + sz / 2);
      cap = Math.min(cap, heightCap(nx, nz, [f]));
    }
    return cap;
  }
}

const HOUSE_WALLS = [
  "#f1ebdd",
  "#e8e2d2",
  "#d9d2c0",
  "#cfd8dc",
  "#b9c6cf",
  "#e3cdb8",
  "#c9a98a",
  "#f4f0e6",
  "#a8b4a0",
  "#e9d8c4",
];
const HOUSE_ROOFS = ["#5a5450", "#6e5a4c", "#8a4a3c", "#4f5d6b", "#7a6b5a", "#3f3f44", "#6b4f3f"];
const CANOPIES = ["#4f8f3a", "#5f9f45", "#3f7f30", "#6aa84f", "#78a33b", "#4a8a52"];
const CARS = ["#d9d9d9", "#3b3b3b", "#b03a2e", "#2f5f9f", "#e0e0e0", "#6b6b6b", "#8a8f96", "#1f3a5f", "#c8b560"];
const FACADES = [
  "#c9c4b9",
  "#aeb6bd",
  "#8e98a4",
  "#d7d0c3",
  "#7e7f85",
  "#b89c7e",
  "#6f8fa8",
  "#e1dcd2",
  "#9b8f82",
  "#a9a39a",
];
const TRUNK = "#6b4a2e";
const DOOR = "#5a3d2b";
const WINDOW = "#9fc5de";
const LAMP_POST = "#44464a";
const LAMP_HEAD = "#f3e7bf";

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length]!;
}

function shade(hex: string, k: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
}

// ---------- pieces ----------

function tree(set: PropSet, rng: () => number, x: number, z: number, scale = 1): void {
  const trunk = (0.5 + rng() * 0.4) * scale;
  const canopy = (1.1 + rng() * 0.9) * scale;
  const total = trunk + canopy * 0.85;
  const cap = set.cap(x, z, canopy, canopy);
  if (total > cap) {
    if (cap < total * 0.6) return;
    const k = cap / total;
    return tree(set, () => 0.5, x, z, scale * k);
  }
  set.add("box", x, z, 0.16 * scale, trunk, 0.16 * scale, TRUNK);
  set.add("ball", x, z, canopy, canopy * 0.85, canopy, pick(rng, CANOPIES), { y: trunk - canopy * 0.15 });
}

function car(set: PropSet, rng: () => number, x: number, z: number, alongX: boolean): void {
  if (set.cap(x, z, 1.6, 1.6) < 0.8) return;
  const ry = alongX ? 0 : Math.PI / 2;
  const color = pick(rng, CARS);
  set.add("box", x, z, 1.6, 0.42, 0.72, color, { ry });
  const dx = alongX ? -0.12 : 0;
  const dz = alongX ? 0 : -0.12;
  set.add("box", x + dx, z + dz, 0.85, 0.34, 0.64, shade(color, 0.8), { y: 0.42, ry });
}

function lamp(set: PropSet, x: number, z: number): void {
  if (set.cap(x, z, 0.3, 0.3) < 2.3) return;
  set.add("box", x, z, 0.08, 2.2, 0.08, LAMP_POST);
  set.add("box", x, z, 0.34, 0.1, 0.18, LAMP_HEAD, { y: 2.2 });
}

function bench(set: PropSet, x: number, z: number, ry = 0): void {
  set.add("box", x, z, 0.9, 0.06, 0.32, "#8a6a4a", { y: 0.28, ry });
  set.add("box", x, z, 0.9, 0.06, 0.08, "#8a6a4a", { y: 0.5, ry });
  set.add("box", x, z, 0.06, 0.5, 0.3, "#3a3a3a", { ry });
}

interface HouseOptions {
  facing: "x" | "z";
  /** Sign of the facing direction. */
  dir: 1 | -1;
  detailed: boolean;
}

function house(set: PropSet, rng: () => number, cx: number, cz: number, o: HouseOptions): void {
  const w = 3.2 + rng() * 0.9;
  const d = 2.4 + rng() * 0.6;
  const sx = o.facing === "x" ? d : w;
  const sz = o.facing === "x" ? w : d;
  const height = 1.0;
  const cap = set.cap(cx, cz, sx, sz);
  if (cap < 1.3) return;
  const roofH = Math.min(0.55, cap - height);
  const wall = pick(rng, HOUSE_WALLS);
  const roof = pick(rng, HOUSE_ROOFS);
  set.add("box", cx, cz, sx, height, sz, wall);
  set.add("roof", cx, cz, sx + 0.35, roofH, sz + 0.35, roof, { y: height });
  if (!o.detailed) return;
  set.add("box", cx + sx * 0.28, cz - sz * 0.2, 0.2, 0.32, 0.2, "#8a6d5a", { y: height + roofH * 0.45 });
  // Door on the facing side, two windows beside it, windows on the other faces.
  const faces: { fx: number; fz: number; along: "x" | "z"; front: boolean }[] = [
    { fx: cx, fz: cz + sz / 2 + 0.03, along: "x", front: o.facing === "z" && o.dir === 1 },
    { fx: cx, fz: cz - sz / 2 - 0.03, along: "x", front: o.facing === "z" && o.dir === -1 },
    { fx: cx + sx / 2 + 0.03, fz: cz, along: "z", front: o.facing === "x" && o.dir === 1 },
    { fx: cx - sx / 2 - 0.03, fz: cz, along: "z", front: o.facing === "x" && o.dir === -1 },
  ];
  for (const f of faces) {
    const span = f.along === "x" ? sx : sz;
    const offs = f.front ? [-0.3, 0.3] : [-0.28, 0.28];
    for (const k of offs) {
      const x = f.along === "x" ? f.fx + k * span : f.fx;
      const z = f.along === "x" ? f.fz : f.fz + k * span;
      const win = f.along === "x" ? [0.36, 0.3, 0.06] : [0.06, 0.3, 0.36];
      set.add("box", x, z, win[0]!, win[1]!, win[2]!, WINDOW, { y: 0.45 });
    }
    if (f.front) {
      const door = f.along === "x" ? [0.32, 0.62, 0.06] : [0.06, 0.62, 0.32];
      set.add("box", f.fx, f.fz, door[0]!, door[1]!, door[2]!, DOOR);
    }
  }
}

function tower(
  set: PropSet,
  rng: () => number,
  cx: number,
  cz: number,
  w: number,
  d: number,
  wanted: number,
  detailed: boolean,
): void {
  const cap = set.cap(cx, cz, w, d);
  const h = Math.min(wanted, cap);
  if (h < 1.2) return;
  const facade = pick(rng, FACADES);
  const split = h > 8 && rng() < 0.55;
  if (split) {
    set.add("box", cx, cz, w, 2.2, d, facade);
    set.add("box", cx, cz, w * 0.72, h - 2.2, d * 0.72, shade(facade, 0.92), { y: 2.2 });
  } else {
    set.add("box", cx, cz, w, h, d, facade);
  }
  const topW = split ? w * 0.72 : w;
  const topD = split ? d * 0.72 : d;
  set.add("box", cx + topW * 0.2, cz - topD * 0.15, topW * 0.25, 0.45, topD * 0.25, shade(facade, 0.7), { y: h });
  if (!detailed) return;
  // Floor lines read as storeys without drawing every window.
  const band = shade(facade, 0.62);
  for (let y = 0.6; y < h - 0.3; y += 0.6) {
    const onPodium = split && y < 2.2;
    const bw = (onPodium ? w : topW) + 0.04;
    const bd = (onPodium ? d : topD) + 0.04;
    set.add("box", cx, cz, bw, 0.05, bd, band, { y });
  }
}

// ---------- settings ----------

function suburb(set: PropSet, grid: Grid, seed: number, setting: Setting, lift: number): void {
  const P = grid.period;
  const blocks = Math.ceil(360 / P);
  for (let bz = -blocks; bz <= blocks; bz++) {
    for (let bx = -blocks; bx <= blocks; bx++) {
      for (const lz of [0, 1] as const) {
        for (const lx of [0, 1] as const) {
          const rng = makeRng(seed * 7 + (bx * 1000 + bz) * 4 + lz * 2 + lx + 100000);
          const x = bx * P + lotCentre(grid, lx) - grid.ox;
          const z = bz * P + lotCentre(grid, lz) - grid.oz;
          if (Math.abs(x) > 360 || Math.abs(z) > 360) continue;
          const detailed = isDetailed(x, z);
          const hero = setting.room !== null && bx === 0 && bz === 0 && lx === 0 && lz === 0;
          if (hero) {
            room(set, setting.room!, seed, lift);
            tree(set, rng, -2.3, -3.1);
            continue;
          }
          const r = Math.hypot(x, z);
          if (!detailed && rng() < 0.15) continue;
          // Face the nearer road: lot 0 looks toward the previous block's road, lot 1 toward this one's.
          const facing = rng() < 0.5 ? "x" : "z";
          const dir: 1 | -1 = (facing === "x" ? lx : lz) === 1 ? 1 : -1;
          const push = 0.9;
          const hx = x + (rng() - 0.5) * 0.8 + (facing === "x" ? dir * push : 0);
          const hz = z + (rng() - 0.5) * 0.8 + (facing === "z" ? dir * push : 0);
          if (r > CLEAR_RADIUS + 1.5) house(set, rng, hx, hz, { facing, dir, detailed });
          const trees = detailed ? 1 + Math.floor(rng() * 2) : rng() < 0.6 ? 1 : 0;
          for (let i = 0; i < trees; i++) {
            const tx = x + (rng() - 0.5) * (grid.lot - 1.2);
            const tz = z + (rng() - 0.5) * (grid.lot - 1.2);
            if (Math.abs(tx - hx) < 2.3 && Math.abs(tz - hz) < 2) continue;
            if (Math.hypot(tx, tz) < CLEAR_RADIUS + 1) continue;
            tree(set, rng, tx, tz);
          }
        }
      }
    }
  }
  // Parked cars along the roads of the detailed area.
  const rng = makeRng(seed + 909);
  const roads = Math.ceil(110 / P);
  for (let b = -roads; b <= roads; b++) {
    const centre = b * P + P - grid.road / 2;
    for (let u = -110; u <= 110; u += 2.6) {
      if (rng() > 0.28) continue;
      const side = rng() < 0.5 ? -1 : 1;
      // Road along x at z = centre - oz, and along z at x = centre - ox.
      const cx = u - grid.ox + (rng() - 0.5) * 0.6;
      const cz = centre - grid.oz + side * (grid.road / 2 - 0.45);
      if (
        surfaceAt(grid, cx, cz) === "road" &&
        surfaceAt(grid, cx, cz - side * grid.road) !== "road" &&
        Math.hypot(cx, cz) > 7
      ) {
        car(set, rng, cx, cz, true);
      }
      const zx = centre - grid.ox + side * (grid.road / 2 - 0.45);
      const zz = u - grid.oz + (rng() - 0.5) * 0.6;
      if (
        rng() < 0.5 &&
        surfaceAt(grid, zx, zz) === "road" &&
        surfaceAt(grid, zx - side * grid.road, zz) !== "road" &&
        Math.hypot(zx, zz) > 7
      ) {
        car(set, rng, zx, zz, false);
      }
    }
  }
}

function city(set: PropSet, grid: Grid, seed: number, setting: Setting, lift: number): void {
  const P = grid.period;
  const blocks = Math.ceil(360 / P);
  for (let bz = -blocks; bz <= blocks; bz++) {
    for (let bx = -blocks; bx <= blocks; bx++) {
      const plazaBlock = bx === 0 && bz === 0;
      if (plazaBlock) {
        if (setting.room) room(set, setting.room, seed, lift);
        const rng = makeRng(seed + 4242);
        for (const [tx, tz] of [
          [-6.2, -6.2],
          [6.2, -6.2],
          [-6.2, 6.2],
          [6.2, 6.2],
        ] as const) {
          tree(set, rng, tx, tz, 1.2);
        }
        for (const [lx, lz] of [
          [-4.6, 4.6],
          [4.6, 4.6],
          [-4.6, -4.6],
          [4.6, -4.6],
        ] as const) {
          lamp(set, lx, lz);
        }
        bench(set, -3, -5.6);
        bench(set, 3, -5.6);
        // Planters mark the edge of the plaza.
        for (const [px, pz] of [
          [0, -6.4],
          [-6.4, 0],
          [6.4, 0],
          [0, 6.4],
        ] as const) {
          set.add("box", px, pz, 1.4, 0.3, 0.6, "#8d8780", { ry: px === 0 ? 0 : Math.PI / 2 });
          set.add("box", px, pz, 1.2, 0.2, 0.42, "#4f8f3a", { y: 0.3, ry: px === 0 ? 0 : Math.PI / 2 });
        }
        if (!setting.room) {
          bench(set, -5.6, 2.2, Math.PI / 2);
          bench(set, 5.6, 2.2, Math.PI / 2);
        }
        continue;
      }
      for (const pz of [0, 1] as const) {
        for (const px of [0, 1] as const) {
          const rng = makeRng(seed * 11 + (bx * 1000 + bz) * 4 + pz * 2 + px + 200000);
          const x = bx * P + lotCentre(grid, px) - grid.ox;
          const z = bz * P + lotCentre(grid, pz) - grid.oz;
          if (Math.abs(x) > 360 || Math.abs(z) > 360) continue;
          const detailed = isDetailed(x, z);
          if (!detailed && rng() < 0.2) continue;
          const w = 4.2 + rng() * 2.4;
          const d = 4.2 + rng() * 2.4;
          const ring = Math.max(Math.abs(bx), Math.abs(bz));
          // Mid-rise around the plaza, a skyline behind it, lower again further out.
          const base = ring === 1 ? 4 + rng() * 6 : ring <= 4 ? 5 + Math.pow(rng(), 1.3) * 16 : 3 + rng() * 8;
          tower(set, rng, x + (rng() - 0.5) * 0.6, z + (rng() - 0.5) * 0.6, w, d, base, detailed);
        }
      }
    }
  }
  // Street trees and lamps along the detailed sidewalks, cars on the roads.
  const rng = makeRng(seed + 707);
  const roads = Math.ceil(110 / P);
  for (let b = -roads; b <= roads; b++) {
    const centre = b * P + P - grid.road / 2;
    for (let u = -110; u <= 110; u += 3.1) {
      const side = rng() < 0.5 ? -1 : 1;
      const walkOff = grid.road / 2 + grid.walk / 2;
      // Along x.
      const ax = u - grid.ox;
      const az = centre - grid.oz + side * walkOff;
      if (surfaceAt(grid, ax, az) === "walk" && Math.hypot(ax, az) > 9) {
        if (rng() < 0.3) tree(set, rng, ax, az, 0.8);
        else if (rng() < 0.25) lamp(set, ax, az);
      }
      const cz = centre - grid.oz + side * (grid.road / 2 - 0.5);
      if (
        rng() < 0.3 &&
        surfaceAt(grid, ax, cz) === "road" &&
        surfaceAt(grid, ax, cz - side * grid.road) !== "road" &&
        Math.hypot(ax, cz) > 9
      ) {
        car(set, rng, ax, cz, true);
      }
      // Along z.
      const bx = centre - grid.ox + side * walkOff;
      const bz = u - grid.oz;
      if (surfaceAt(grid, bx, bz) === "walk" && Math.hypot(bx, bz) > 9) {
        if (rng() < 0.3) tree(set, rng, bx, bz, 0.8);
        else if (rng() < 0.25) lamp(set, bx, bz);
      }
      const cx = centre - grid.ox + side * (grid.road / 2 - 0.5);
      if (
        rng() < 0.3 &&
        surfaceAt(grid, cx, bz) === "road" &&
        surfaceAt(grid, cx - side * grid.road, bz) !== "road" &&
        Math.hypot(cx, bz) > 9
      ) {
        car(set, rng, cx, bz, false);
      }
    }
  }
}

function park(set: PropSet, inner: TerrainData, outer: TerrainData, seed: number): void {
  const rng = makeRng(seed + 515);
  const water = (x: number, z: number) => (isDetailed(x, z) ? isWaterAt(inner, x, z) : isWaterAt(outer, x, z));
  for (let z = -356; z <= 356; z += 3.3) {
    for (let x = -356; x <= 356; x += 3.3) {
      const detailed = isDetailed(x, z);
      if (!detailed && (Math.abs(x) % 9.9 > 0.1 || Math.abs(z) % 9.9 > 0.1)) continue;
      const px = x + (rng() - 0.5) * 2.6;
      const pz = z + (rng() - 0.5) * 2.6;
      const r = Math.hypot(px, pz);
      if (r < 7) continue;
      const wood = fbm(px / 26, pz / 26, seed + 41, 3);
      const onPath = isParkPath(px, pz, seed);
      if (onPath) {
        if (detailed && rng() < 0.1) bench(set, px, pz, rng() < 0.5 ? 0 : Math.PI / 2);
        else if (detailed && rng() < 0.08) lamp(set, px, pz);
        continue;
      }
      if (water(px, pz)) continue;
      if (wood > 0.56 || rng() < 0.07) tree(set, rng, px, pz, 1.1 + rng() * 0.7);
    }
  }
}

// ---------- rooms ----------

type RoomKind = NonNullable<Setting["room"]>;

/** Half-width of the cut-away room. */
const ROOM = 1.5;
const WALL_H = 0.95;

function room(set: PropSet, kind: RoomKind, seed: number, lift: number): void {
  const rng = makeRng(seed + 61);
  const b = (x: number, z: number, sx: number, sy: number, sz: number, color: string, y = 0, ry = 0) =>
    set.add("box", x, z, sx, sy, sz, color, { y: lift + y, ry });
  const ball = (x: number, z: number, s: number, color: string, y = 0) =>
    set.add("ball", x, z, s, s, s, color, { y: lift + y });

  const floors: Record<RoomKind, string> = {
    bedroom: "#b48a5a",
    livingroom: "#a97f52",
    kitchen: "#d9d5cc",
    office: "#8d98a3",
  };
  const walls: Record<RoomKind, string> = {
    bedroom: "#ece6da",
    livingroom: "#e6dfd0",
    kitchen: "#f2eee4",
    office: "#e3e6ea",
  };
  const wall = walls[kind];

  // Floor slab, back wall, and the rest of the house as a closed block to the
  // right (its left face is the room's right wall). The front and left walls
  // are cut away toward the camera.
  b(0, 0, 2 * ROOM + 0.2, 0.06, 2 * ROOM + 0.2, floors[kind], -0.06);
  b(0, -ROOM - 0.04, 2 * ROOM + 0.2, WALL_H, 0.08, wall);
  b(ROOM + 0.95, 0, 1.9, WALL_H, 2 * ROOM + 0.2, shade(wall, 0.96));
  b(ROOM + 0.95, 0, 2.0, 0.1, 2 * ROOM + 0.3, kind === "office" ? "#5e6166" : "#5a5450", WALL_H);
  b(ROOM + 1.3, -0.6, 0.3, 0.28, 0.3, "#8a6d5a", WALL_H + 0.1);
  // Window on the back wall, door on the right wall.
  b(-0.55, -ROOM - 0.02, 0.78, 0.5, 0.04, "#ffffff", 0.42);
  b(-0.55, -ROOM + 0.015, 0.66, 0.4, 0.03, "#a8d1ea", 0.47);
  b(ROOM - 0.03, 0.75, 0.05, 0.72, 0.4, DOOR);

  switch (kind) {
    case "bedroom": {
      // Bed against the back wall on the left, nightstand, wardrobe by the door, desk, rug, plant.
      b(-0.85, -0.95, 0.76, 0.14, 1.06, "#e9e7e1");
      b(-0.85, -0.82, 0.74, 0.08, 0.74, "#7d9ec9", 0.14);
      b(-0.85, -1.3, 0.5, 0.07, 0.22, "#ffffff", 0.14);
      b(-0.85, -1.46, 0.8, 0.42, 0.05, "#8a6a4a");
      b(-0.3, -1.32, 0.3, 0.24, 0.3, "#9c7b58");
      b(-0.3, -1.32, 0.05, 0.1, 0.05, "#333333", 0.24);
      b(-0.3, -1.32, 0.18, 0.13, 0.18, "#f5e6c8", 0.34);
      b(1.3, 0.1, 0.32, 0.74, 0.62, "#a98762");
      b(0.78, -1.32, 0.62, 0.26, 0.26, "#c9a77a");
      b(0.78, -1.38, 0.3, 0.19, 0.03, "#2b2b2b", 0.26);
      b(0.78, -1.02, 0.18, 0.3, 0.18, "#555555");
      b(0.1, 0.15, 1.4, 0.015, 1.0, "#c86a5a");
      b(1.36, -0.75, 0.22, 0.7, 0.5, "#8a6a4a");
      b(1.36, -0.75, 0.16, 0.12, 0.42, "#c94d3b", 0.1);
      b(1.36, -0.75, 0.16, 0.12, 0.42, "#3b6fc9", 0.36);
      b(-1.36, -0.15, 0.16, 0.16, 0.16, "#b05a40");
      ball(-1.36, -0.15, 0.34, "#4f8f3a", 0.16);
      b(0.3, -ROOM + 0.02, 0.3, 0.4, 0.04, "#e0b04c", 0.45);
      return;
    }
    case "livingroom": {
      b(0.1, -1.2, 1.0, 0.2, 0.42, "#6b7f9b");
      b(0.1, -1.38, 1.0, 0.24, 0.12, "#5f7390", 0.2);
      b(-0.46, -1.2, 0.12, 0.3, 0.42, "#5f7390");
      b(0.66, -1.2, 0.12, 0.3, 0.42, "#5f7390");
      b(0.1, -0.55, 0.56, 0.16, 0.3, "#8a6a4a");
      b(0.1, -0.55, 0.14, 0.05, 0.14, "#d9c9a8", 0.16);
      b(1.34, -0.3, 0.28, 0.2, 0.84, "#3c3c3c");
      b(1.4, -0.3, 0.03, 0.44, 0.76, "#111111", 0.25);
      b(-1.2, -1.38, 0.52, 0.82, 0.2, "#8a6a4a");
      for (let i = 0; i < 3; i++) {
        b(-1.2, -1.38, 0.42, 0.14, 0.14, pick(rng, ["#c94d3b", "#3b6fc9", "#e0b04c", "#4f8f3a"]), 0.1 + i * 0.25);
      }
      b(-1.3, -0.85, 0.04, 0.72, 0.04, "#333333");
      b(-1.3, -0.85, 0.24, 0.14, 0.24, "#f5e6c8", 0.72);
      b(1.32, 1.1, 0.16, 0.16, 0.16, "#b05a40");
      ball(1.32, 1.1, 0.36, "#4f8f3a", 0.16);
      b(0.05, 0.2, 1.5, 0.015, 1.1, "#c9b48e");
      b(0.6, -ROOM + 0.02, 0.36, 0.26, 0.04, "#5a8fb3", 0.55);
      return;
    }
    case "kitchen": {
      b(0.25, -1.36, 2.3, 0.32, 0.26, "#d9d9d4");
      b(0.25, -1.36, 2.3, 0.02, 0.27, "#6a6a6a", 0.32);
      b(1.37, -0.1, 0.25, 0.32, 1.5, "#d9d9d4");
      b(1.37, -0.1, 0.26, 0.02, 1.5, "#6a6a6a", 0.32);
      b(1.32, -1.32, 0.32, 0.68, 0.32, "#e8e8ea");
      b(1.32, -1.32, 0.3, 0.01, 0.3, "#c8c8cc", 0.4);
      b(-0.55, -1.36, 0.32, 0.33, 0.27, "#3a3a3a");
      b(-0.55, -1.42, 0.34, 0.1, 0.18, "#b0b0b0", 0.66);
      b(0.1, -1.42, 1.9, 0.3, 0.14, "#e2dccd", 0.58);
      b(0.5, -1.36, 0.26, 0.03, 0.18, "#9aa0a6", 0.33);
      b(0.5, -1.47, 0.03, 0.14, 0.03, "#9aa0a6", 0.34);
      b(-0.75, 0.15, 0.6, 0.24, 0.6, "#b48a5a");
      b(-1.08, 0.15, 0.16, 0.28, 0.16, "#6b4e32");
      b(-0.42, 0.15, 0.16, 0.28, 0.16, "#6b4e32");
      b(-0.75, 0.15, 0.18, 0.05, 0.18, "#e9a23b", 0.24);
      b(0.0, 0.4, 0.9, 0.012, 0.5, "#9c7b58");
      b(1.3, 0.62, 0.12, 0.12, 0.12, "#b05a40", 0.34);
      ball(1.3, 0.62, 0.22, "#4f8f3a", 0.46);
      return;
    }
    case "office": {
      for (const x of [-0.9, 0.0, 0.9]) {
        b(x, -1.1, 0.72, 0.26, 0.36, "#d8d3c8");
        b(x, -1.18, 0.3, 0.2, 0.03, "#222222", 0.3);
        b(x, -0.72, 0.2, 0.3, 0.2, "#333333");
        b(x, -0.81, 0.2, 0.2, 0.03, "#333333", 0.3);
      }
      for (const z of [-0.2, 0.65]) {
        b(1.2, z, 0.36, 0.26, 0.72, "#d8d3c8");
        b(1.3, z, 0.03, 0.2, 0.3, "#222222", 0.3);
        b(0.85, z, 0.2, 0.3, 0.2, "#333333");
      }
      b(-0.4, -ROOM + 0.025, 0.9, 0.5, 0.03, "#fafafa", 0.4);
      b(-0.4, -ROOM + 0.01, 0.94, 0.54, 0.02, "#9a9a9a", 0.38);
      b(1.33, -1.28, 0.26, 0.5, 0.26, "#9a9a9a");
      b(1.33, -1.28, 0.22, 0.12, 0.2, "#d0d0d0", 0.5);
      b(-1.36, -1.3, 0.16, 0.16, 0.16, "#b05a40");
      ball(-1.36, -1.3, 0.34, "#4f8f3a", 0.16);
      b(-1.36, -0.5, 0.16, 0.5, 0.16, "#d0e8f5");
      b(-1.36, -0.5, 0.14, 0.14, 0.14, "#b8dced", 0.5);
      return;
    }
  }
}

// ---------- assembly ----------

function materialFor(style: Style): THREE.Material {
  return style === "drawing"
    ? new THREE.MeshToonMaterial({ gradientMap: toonGradient() })
    : new THREE.MeshLambertMaterial({ flatShading: style === "lowpoly" });
}

function geometryFor(kind: Kind, style: Style): THREE.BufferGeometry {
  if (kind === "box" || (kind === "ball" && style === "pixels")) {
    return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  }
  if (kind === "roof") return new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  return new THREE.IcosahedronGeometry(0.5, style === "lowpoly" ? 1 : 2).translate(0, 0.5, 0);
}

function toMesh(kind: Kind, list: Instance[], style: Style): THREE.InstancedMesh | null {
  if (list.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometryFor(kind, style), materialFor(style), list.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  list.forEach((it, i) => {
    e.set(0, it.ry, 0);
    q.setFromEuler(e);
    p.set(it.x, it.y, it.z);
    s.set(it.sx, it.sy, it.sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export interface PropsResult {
  group: THREE.Group;
  /** How far above the ground the subject stands (the room floor, when there is one). */
  lift: number;
  count: number;
}

export function buildProps(spec: ScenarioSpec, inner: TerrainData, outer: TerrainData): PropsResult {
  const setting = SETTINGS[spec.world.terrain];
  const seed = spec.world.seed;
  const lift = setting.room ? 0.02 : 0;
  const set = new PropSet(
    (x, z) => (isDetailed(x, z) ? groundHeightAt(inner, x, z) : groundHeightAt(outer, x, z)),
    focusPoints(spec.subject.keyframes),
  );
  const grid = gridFor(spec.world.terrain);

  if (setting.layout === "suburb" && grid) suburb(set, grid, seed, setting, lift);
  else if (setting.layout === "city" && grid) city(set, grid, seed, setting, lift);
  else if (setting.layout === "park") park(set, inner, outer, seed);

  const group = new THREE.Group();
  let count = 0;
  for (const kind of ["box", "roof", "ball"] as const) {
    const mesh = toMesh(kind, set.lists[kind], spec.style);
    if (mesh) {
      group.add(mesh);
      count += set.lists[kind].length;
    }
  }
  return { group, lift, count };
}
