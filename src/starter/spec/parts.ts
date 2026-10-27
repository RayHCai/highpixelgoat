import { makeRng } from "../scene/noise";
import type { Part, ScenarioSpec, Shape, Texture } from "./schema";

/**
 * The subject model as a list of primitives. Pure helpers shared by the
 * generator (normalising what Claude wrote) and the renderer (turning legacy
 * fixed shapes into the same part list).
 */

export const MAX_PARTS = 40;

/** Axis-aligned bounds of a part list, ignoring rotation. */
export function partsBounds(parts: Part[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    // A rotated part can reach as far as its longest half-extent in any direction.
    const rotated = p.rx || p.ry || p.rz;
    const reach = rotated ? Math.max(p.w, p.h, p.d) / 2 : 0;
    const half = rotated ? [reach, reach, reach] : [p.w / 2, p.h / 2, p.d / 2];
    const c = [p.x, p.y, p.z];
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, c[i]! - half[i]!);
      max[i] = Math.max(max[i]!, c[i]! + half[i]!);
    }
  }
  return { min, max };
}

/**
 * Fit a model into the unit space: largest dimension 1, feet on the ground,
 * centred on the vertical axis. Sizes are forced positive, and anything past
 * MAX_PARTS is dropped.
 */
export function normaliseParts(parts: Part[]): Part[] {
  const clean = parts.slice(0, MAX_PARTS).map((p) => ({
    ...p,
    w: Math.max(0.01, Math.abs(p.w)),
    h: Math.max(0.01, Math.abs(p.h)),
    d: Math.max(0.01, Math.abs(p.d)),
  }));
  if (clean.length === 0) return clean;
  const { min, max } = partsBounds(clean);
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const k = extent > 0 ? 1 / extent : 1;
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  const size = (v: number) => Math.max(0.002, round(v * k));
  return clean.map((p) => ({
    ...p,
    x: round((p.x - cx) * k),
    y: round((p.y - min[1]) * k),
    z: round((p.z - cz) * k),
    w: size(p.w),
    h: size(p.h),
    d: size(p.d),
  }));
}

/** Highest point of the model, for the callout anchor. */
export function partsTop(parts: Part[]): number {
  return partsBounds(parts).max[1];
}

function part(
  kind: Part["kind"],
  pos: [number, number, number],
  size: [number, number, number],
  color: string,
  extra: Partial<Part> = {},
): Part {
  return {
    kind,
    x: pos[0],
    y: pos[1],
    z: pos[2],
    w: size[0],
    h: size[1],
    d: size[2],
    rx: 0,
    ry: 0,
    rz: 0,
    color,
    pattern: "solid",
    ...extra,
  };
}

/** The old fixed shapes, expressed as parts in the subject colours. */
export function legacyParts(shape: Shape, texture: Texture, colors: [string, string], seed: number): Part[] {
  const [a, b] = colors;
  const pattern: Part["pattern"] = texture === "checker" ? "checker" : texture === "stripes" ? "stripes" : "solid";
  const skin: Partial<Part> = pattern === "solid" ? {} : { pattern, color2: b };
  switch (shape) {
    case "blob": {
      const rng = makeRng(seed + 77);
      const prims = [
        part("sphere", [-0.26, 0.42, 0.05], [0.74, 0.74, 0.74], a, skin),
        part("sphere", [0.26, 0.42, 0.05], [0.74, 0.74, 0.74], a, skin),
        part("sphere", [0, 0.5, -0.28], [0.66, 0.66, 0.66], a, skin),
        part("sphere", [0.02, 0.78, -0.05], [0.46, 0.46, 0.46], a, skin),
      ];
      for (let i = 0; i < 3; i++) {
        const ang = rng() * Math.PI * 2;
        prims.push(
          part("sphere", [Math.cos(ang) * 0.3, 0.3 + rng() * 0.3, Math.sin(ang) * 0.3], [0.4, 0.4, 0.4], a, skin),
        );
      }
      return prims;
    }
    case "cube":
      return [part("box", [0, 0.5, 0], [1, 1, 1], a, skin)];
    case "sphere":
      return [part("sphere", [0, 0.5, 0], [1, 1, 1], a, skin)];
    case "cylinder":
      return [part("cylinder", [0, 0.5, 0], [0.8, 1, 0.8], a, skin)];
    case "pyramid":
      return [part("cone", [0, 0.5, 0], [1.1, 1, 1.1], a, skin)];
    case "coin":
      return [part("cylinder", [0, 0.08, 0], [1, 0.16, 1], a, skin)];
    case "humanoid":
      return [
        part("box", [-0.12, 0.2, 0], [0.16, 0.4, 0.2], b),
        part("box", [0.12, 0.2, 0], [0.16, 0.4, 0.2], b),
        part("box", [0, 0.6, 0], [0.46, 0.42, 0.24], a, skin),
        part("box", [-0.3, 0.6, 0], [0.12, 0.4, 0.14], a),
        part("box", [0.3, 0.6, 0], [0.12, 0.4, 0.14], a),
        part("box", [0, 0.9, 0], [0.3, 0.26, 0.28], a),
      ];
  }
}

/** The spec with every part model fitted to the unit space, so a hand-written model can use any scale. */
export function normaliseModels(spec: ScenarioSpec): ScenarioSpec {
  const parts = spec.subject.parts;
  return {
    ...spec,
    subject: { ...spec.subject, ...(parts && parts.length ? { parts: normaliseParts(parts) } : {}) },
    actors: spec.actors.map((a) => ({ ...a, parts: normaliseParts(a.parts) })),
  };
}

/** The parts to draw for a spec: its own model, or the legacy shape converted. */
export function subjectParts(spec: ScenarioSpec): Part[] {
  const s = spec.subject;
  if (s.parts && s.parts.length) return s.parts;
  return normaliseParts(
    legacyParts(s.shape ?? "blob", s.texture ?? "solid", s.colors ?? ["#6b4a2e", "#8f6a45"], spec.world.seed),
  );
}
