import { normaliseParts, partsTop, subjectParts } from "../starter/spec/parts";
import {
  parseSpec,
  type Actor,
  type Keyframe,
  type Part,
  type ScenarioSpec,
  type ScenarioSpecInput,
} from "../starter/spec/schema";
import { fitNarration, MAX_SHOT } from "../starter/spec/timing";
import type { GeneratedActor, GeneratedKeyframe, GeneratedPart, GeneratedSpec } from "./schema";

/** World units per metre: a terrain cell is roughly three metres. */
export const UNITS_PER_METRE = 1 / 2.83;
/** Deepest anything may pile up, in world units (about 400 metres: well over the tallest tower). */
export const MAX_DEPTH = 150;
/** Tightest shot the camera frames for, in world units (about a metre). */
const MIN_SHOT = 0.3;

/**
 * Lift the flat model output into the renderer's spec shape, normalising the
 * things a model gets slightly wrong (colour formats, casing, lengths, model
 * bounds) so the strict schema accepts the result. Timing is provisional here
 * (estimated from the line lengths); the voice step refits it from the
 * measured audio.
 */
export function toScenarioSpec(g: GeneratedSpec, o: { id: string; seed: number | null }): ScenarioSpec {
  const beats = g.beats.slice(0, 16);
  if (beats.length < 2) throw new Error("the script needs at least two beats");
  if (g.subjectParts.length < 1) throw new Error("the subject needs at least one part");
  const parts = normaliseParts(g.subjectParts.map(toPart));
  const mode = g.mode ?? "scale";
  const weatherKind = g.weatherKind ?? "none";
  const input: ScenarioSpecInput = {
    id: o.id,
    title: g.title.trim().slice(0, 80) || "Untitled",
    style: g.style,
    mode,
    weather: { kind: weatherKind, color: normaliseHex(g.weatherColor ?? "", "#ffffff") },
    world: { terrain: g.terrain, seed: o.seed ?? Math.trunc(g.seed) },
    subject: {
      label: g.subjectLabel.trim().slice(0, 16),
      parts,
      baseSize: baseSizeFor(parts),
      // The subject only walks in a story; the other formats keep it put.
      keyframes:
        mode === "story" ? (g.subjectKeyframes ?? []).slice(0, 12).map((k) => toKeyframe(k, beats.length, false)) : [],
    },
    rule: g.rule.trim() ? g.rule.trim().toUpperCase().slice(0, 48) : null,
    voice: { persona: g.voicePersona, pace: g.voicePace },
    beats: beats.map((b) => ({
      heading: b.heading.trim().slice(0, 40) || "...",
      stats: b.stats.slice(0, 3).map((s) => s.toUpperCase().slice(0, 40)),
      narration: b.narration.trim().slice(0, 240),
      subjectScale: b.subjectScale > 0 ? b.subjectScale : 1,
      shot: toShot(b.shot),
      fall: weatherKind === "none" ? 0 : Math.min(1, Math.max(0, finite(b.fall))),
      depth: weatherKind === "none" ? 0 : Math.min(MAX_DEPTH, Math.max(0, finite(b.depth) * UNITS_PER_METRE)),
      effects: Array.from(new Set(b.effects)),
    })),
    actors: g.extras
      .slice(0, 8)
      .map((e) => toActor(e, beats.length))
      .filter((a): a is Actor => a !== null),
  };
  return fitNarration(parseSpec(input));
}

/** A shot written in metres as world units; 0 (frame by the mode) stays 0. */
function toShot(metres: number | undefined): number {
  const units = finite(metres ?? 0) * UNITS_PER_METRE;
  return units <= 0 ? 0 : Math.round(Math.min(MAX_SHOT, Math.max(MIN_SHOT, units)) * 1000) / 1000;
}

/**
 * A model-written keyframe made safe: clamped to the beats and the set. With
 * `keepClear`, nothing is parked between the camera and the subject (the
 * front-left), where it would hide the subject.
 */
export function toKeyframe(k: GeneratedKeyframe, beatCount: number, keepClear: boolean): Keyframe {
  let x = Math.min(60, Math.max(-60, finite(k.x)));
  const z = Math.min(60, Math.max(-60, finite(k.z)));
  if (keepClear && z > 0.3 && Math.abs(x) < 1.5) x = x < 0 ? -1.6 : 1.6;
  return {
    beat: Math.min(beatCount - 1, Math.max(0, Math.round(finite(k.beat)))),
    offset: Math.min(8, Math.max(0, finite(k.offset))),
    x: Math.round(x * 100) / 100,
    z: Math.round(z * 100) / 100,
    face: finite(k.face) % 360,
    visible: k.visible !== false,
  };
}

/**
 * A model-written extra made safe: parts normalised, size in world units,
 * keyframes clamped to the beats and kept out of the camera line.
 */
export function toActor(e: GeneratedActor, beatCount: number): Actor | null {
  if (e.parts.length === 0 || e.keyframes.length === 0) return null;
  const size = Math.min(6, Math.max(0.05, finite(e.sizeMetres, 1.7) * UNITS_PER_METRE));
  return {
    name: e.name.trim().slice(0, 40) || "extra",
    kind: e.kind,
    parts: normaliseParts(e.parts.map(toPart)),
    size: Math.round(size * 1000) / 1000,
    keyframes: e.keyframes.slice(0, 12).map((k) => toKeyframe(k, beatCount, true)),
  };
}

/**
 * World size of the model at scale 1. A person-shaped model (about 1 tall) is
 * 0.6 units; a long or flat one (a dog, a coin) normalises to a lower height,
 * so it gets up to half as much again to stay readable in frame.
 */
export function baseSizeFor(parts: Part[]): number {
  const top = Math.max(0.05, partsTop(parts));
  return Math.round(0.6 * Math.min(1.5, Math.max(1, 0.75 / top)) * 1000) / 1000;
}

function finite(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

/** A model-written part made safe for the schema: finite numbers, valid colours. */
export function toPart(p: GeneratedPart): Part {
  const color = normaliseHex(p.color, "#888888");
  const pattern = p.pattern === "checker" || p.pattern === "stripes" ? p.pattern : "solid";
  const color2 = pattern === "solid" ? undefined : normaliseHex(p.color2, color);
  return {
    kind: p.kind,
    x: finite(p.x),
    y: finite(p.y, 0.5),
    z: finite(p.z),
    w: finite(p.w, 0.5),
    h: finite(p.h, 0.5),
    d: finite(p.d, 0.5),
    rx: finite(p.rx) % 360,
    ry: finite(p.ry) % 360,
    rz: finite(p.rz) % 360,
    color,
    pattern,
    ...(color2 ? { color2 } : {}),
  };
}

/** The reverse mapping: a spec in the model-facing shape, for editing imported scenarios. */
export function toGenerated(
  spec: ScenarioSpec,
  social: { caption: string; hashtags: string[] } = { caption: "", hashtags: [] },
): GeneratedSpec {
  const partOut = (p: Part): GeneratedPart => ({
    kind: p.kind,
    x: p.x,
    y: p.y,
    z: p.z,
    w: p.w,
    h: p.h,
    d: p.d,
    rx: p.rx,
    ry: p.ry,
    rz: p.rz,
    color: p.color,
    pattern: p.pattern,
    color2: p.color2 ?? p.color,
  });
  const keyframeOut = (k: Keyframe): GeneratedKeyframe => ({
    beat: k.beat,
    offset: k.offset,
    x: k.x,
    z: k.z,
    face: k.face,
    visible: k.visible,
  });
  const metres = (units: number) => Math.round((units / UNITS_PER_METRE) * 100) / 100;
  return {
    mode: spec.mode,
    angle: "deadpan",
    music: spec.audio?.music ?? "",
    extras: spec.actors.map((a) => ({
      name: a.name,
      kind: a.kind,
      sizeMetres: metres(a.size),
      parts: a.parts.map(partOut),
      keyframes: a.keyframes.map(keyframeOut),
    })),
    title: spec.title,
    style: spec.style,
    terrain: spec.world.terrain,
    seed: spec.world.seed,
    subjectLabel: spec.subject.label,
    subjectParts: subjectParts(spec).map(partOut),
    subjectKeyframes: spec.subject.keyframes.map(keyframeOut),
    weatherKind: spec.weather.kind,
    weatherColor: spec.weather.color,
    rule: spec.rule ?? "",
    voicePersona: spec.voice.persona,
    voicePace: spec.voice.pace,
    beats: spec.beats.map((b) => ({
      heading: b.heading,
      stats: b.stats,
      narration: b.narration,
      subjectScale: b.subjectScale,
      shot: b.shot > 0 ? metres(b.shot) : 0,
      fall: b.fall,
      depth: metres(b.depth),
      effects: b.effects,
    })),
    caption: social.caption,
    hashtags: social.hashtags,
  };
}

export function normaliseHex(value: string, fallback: string): string {
  const m = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1]!.toLowerCase()}` : fallback;
}
