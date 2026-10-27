import type { Terrain } from "../spec/schema";
import { SETTINGS, type Setting } from "./palette";

/**
 * Where things go. The built-up settings share a street grid; the terrain
 * colours it and the props stand on it, so both read the same functions in
 * world coordinates. Everything here is pure.
 */

export interface Grid {
  /** Distance between road centrelines. */
  period: number;
  /** Road width (kerb to kerb). */
  road: number;
  /** Sidewalk width on each side of a road. */
  walk: number;
  /** Lot width inside a block. The block interior holds two lots per axis. */
  lot: number;
  /** Offsets so the origin lands on a lot centre, a road, or a plaza centre. */
  ox: number;
  oz: number;
}

const SUBURB_BASE = { period: 18, road: 2.6, walk: 0.7, lot: 7 };
const CITY_BASE = { period: 20, road: 3.6, walk: 1.2, lot: 7 };

/** First lot centre inside a block, measured from the block origin. */
export function lotCentre(g: Grid, index: 0 | 1): number {
  return g.walk + g.lot * (index + 0.5);
}

export function gridFor(terrain: Terrain): Grid | null {
  const s = SETTINGS[terrain];
  if (s.layout === "suburb") {
    const base = SUBURB_BASE;
    const centre = base.walk + base.lot / 2;
    const roadCentre = base.period - base.road / 2;
    return { ...base, ox: centre, oz: s.onStreet ? roadCentre : centre };
  }
  if (s.layout === "city") {
    const base = CITY_BASE;
    const centre = base.walk + base.lot;
    return { ...base, ox: centre, oz: centre };
  }
  return null;
}

export type Surface = "road" | "walk" | "lot";

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** What the ground is at world (x, z). `minRoad` widens roads for coarse cells. */
export function surfaceAt(g: Grid, x: number, z: number, minRoad = 0): Surface {
  const road = Math.max(g.road, minRoad);
  const fu = mod(x + g.ox, g.period);
  const fv = mod(z + g.oz, g.period);
  const roadStart = g.period - road;
  if (fu >= roadStart || fv >= roadStart) return "road";
  const walkStart = roadStart - g.walk;
  if (fu >= walkStart || fv >= walkStart || fu < g.walk || fv < g.walk) return "walk";
  return "lot";
}

/** Radius around the subject kept free of props. */
export const CLEAR_RADIUS = 3;

export interface Point {
  x: number;
  z: number;
}

const ORIGIN: readonly Point[] = [{ x: 0, z: 0 }];

/**
 * Tallest anything may be at (x, z) so it never comes between the camera and
 * the subject, wherever the subject stands along its path (`points`, the
 * origin by default). The camera always sits on the +z side of the subject,
 * so only that half is capped: the line of sight from the camera to the
 * subject's feet climbs at roughly 0.6 units per unit of distance at every
 * scale.
 */
export function heightCap(x: number, z: number, points: readonly Point[] = ORIGIN): number {
  let cap = Number.POSITIVE_INFINITY;
  for (const p of points) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dz <= -4) continue;
    const r = Math.sqrt(dx * dx + dz * dz);
    const c = 0.55 * Math.max(0, r - 0.5);
    if (c < cap) cap = c;
  }
  return cap;
}

/**
 * Every place the subject stands or walks through: the origin plus its
 * keyframes, with long moves sampled so nothing tall is left standing in
 * front of the middle of a walk.
 */
export function focusPoints(keyframes: readonly Point[]): Point[] {
  const points: Point[] = [{ x: 0, z: 0 }];
  let prev: Point | null = null;
  for (const k of keyframes) {
    if (prev) {
      const steps = Math.ceil(Math.hypot(k.x - prev.x, k.z - prev.z) / 1.5);
      for (let i = 1; i < steps; i++) {
        points.push({ x: prev.x + ((k.x - prev.x) * i) / steps, z: prev.z + ((k.z - prev.z) * i) / steps });
      }
    }
    points.push({ x: k.x, z: k.z });
    prev = k;
  }
  return points;
}

/** Whether a prop is near enough to warrant detail (doors, windows, cars). */
export function isDetailed(x: number, z: number): boolean {
  return Math.max(Math.abs(x), Math.abs(z)) < 100;
}

export function settingFor(terrain: Terrain): Setting {
  return SETTINGS[terrain];
}
