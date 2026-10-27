import type { Actor, Beat, Keyframe, ScenarioSpec } from "./schema";

/**
 * Pure timeline math. Everything the player shows at time t is derived from
 * the spec through these functions, so seeking is exact and rendering is
 * deterministic frame to frame (required for video capture).
 */

/** Seconds reserved after the last beat so the payoff can breathe. */
const OUTRO_SECONDS = 3;
/** Latest the first beat may start, so the hook lands immediately. */
const HOOK_SECONDS = 0.4;
/** Minimum gap between beats so two never land on the same frame. */
const MIN_GAP_SECONDS = 0.75;
/** How long the subject takes to grow from one beat scale to the next. */
const GROW_SECONDS = 1.1;
/**
 * The camera reaches the new framing slightly before the subject's overshoot
 * peaks, and never overshoots itself, so the pop reads as the subject growing
 * rather than the camera lurching.
 */
const CAMERA_SECONDS = 0.9;
/** How long the weather takes to change intensity after a beat lands. */
const FALL_SECONDS = 0.8;
/**
 * How long what has fallen takes to reach a beat's depth after the beat
 * lands, so the picture matches the number on screen while it is read.
 */
const SETTLE_SECONDS = 1.8;
/**
 * Largest size the subject may reach in world units. The terrain is 200
 * units across, so this keeps the final subject reading as "mountain on a
 * continent" rather than swallowing the map.
 */
export const MAX_VISUAL_SIZE = 70;
/** Widest shot the camera frames for, in world units (about 200 metres: a district). */
export const MAX_SHOT = MAX_VISUAL_SIZE;
/** Default framing of a "story" beat with shot 0: a room and the people in it. */
export const STORY_SHOT = 1.4;
/** Default framing of an "overview" beat with shot 0: a block. */
export const OVERVIEW_SHOT = 24;

/** Pause after a narration line ends before the next beat lands. */
export const BREATH_SECONDS = 0.55;
/** Shortest a beat may hold the screen, narrated or not. */
export const MIN_SLOT_SECONDS = 2.2;
/** Reading speed used to estimate a line's length before (or without) audio. */
const WORDS_PER_SECOND = 2.6;

/**
 * Normalise beat times: sorted, strictly increasing, first beat inside the
 * hook window, last beat leaving an outro. Timings that overflow the duration
 * are rescaled proportionally; timings that already fit are left alone.
 */
export function fitBeats(spec: ScenarioSpec): ScenarioSpec {
  const { duration } = spec.format;
  const sorted = [...spec.beats].sort((a, b) => a.at - b.at);
  if (sorted.length === 0) return spec;

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const availableEnd = Math.max(duration - OUTRO_SECONDS, HOOK_SECONDS + 1);
  const span = last.at - first.at;

  let beats: Beat[];
  if (span > 0 && (first.at > HOOK_SECONDS || last.at > availableEnd)) {
    const start = Math.min(first.at, HOOK_SECONDS);
    const scale = (availableEnd - start) / span;
    beats = sorted.map((b) => ({ ...b, at: start + (b.at - first.at) * scale }));
  } else {
    beats = sorted.map((b) => ({ ...b }));
  }

  for (let i = 1; i < beats.length; i++) {
    const prev = beats[i - 1]!;
    const cur = beats[i]!;
    if (cur.at < prev.at + MIN_GAP_SECONDS) cur.at = prev.at + MIN_GAP_SECONDS;
  }
  const lastAt = beats[beats.length - 1]!.at;
  if (lastAt > availableEnd && beats.length > 1) {
    const start = beats[0]!.at;
    const total = lastAt - start;
    for (const b of beats) b.at = start + ((b.at - start) / total) * (availableEnd - start);
  }
  return { ...spec, beats };
}

/** Rough spoken length of a line, for silent builds and pre-voice planning. */
export function estimateNarrationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words === 0 ? 0 : 0.35 + words / WORDS_PER_SECOND;
}

/** What the narration timing reads from a beat. */
export type NarratedBeat = Pick<Beat, "narration" | "narrationSeconds">;

/**
 * The part of a spec the narration timing reads and writes. Each take owns
 * its schema, so anything else in the spec passes through untouched.
 */
export interface NarratedSpec {
  format: { duration: number };
  beats: (NarratedBeat & { at?: number })[];
}

/** Seconds a beat holds the screen: its narration plus a breath, never too short. */
export function beatSlot(beat: NarratedBeat): number {
  const spoken = beat.narrationSeconds ?? estimateNarrationSeconds(beat.narration);
  return Math.max(MIN_SLOT_SECONDS, spoken + BREATH_SECONDS);
}

/**
 * Lay the beats out so each one holds the screen for exactly as long as its
 * narration needs, and derive the video length from that. This replaces
 * fitBeats for narrated scenarios: the voice is the clock.
 */
export function fitNarration<S extends NarratedSpec>(spec: S): S {
  let at = HOOK_SECONDS;
  const beats = spec.beats.map((b) => {
    const placed = { ...b, at: Math.round(at * 100) / 100 };
    at += beatSlot(b);
    return placed;
  });
  const last = beats[beats.length - 1]!;
  const lastSpoken = last.narrationSeconds ?? estimateNarrationSeconds(last.narration);
  const tail = Math.max(OUTRO_SECONDS, lastSpoken + 1.6);
  const duration = Math.min(90, Math.max(5, Math.ceil((last.at + tail) * 10) / 10));
  return { ...spec, format: { ...spec.format, duration }, beats };
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Map a narrative scale multiplier to a size in world units. True scaling is
 * preserved while the final size fits under MAX_VISUAL_SIZE; beyond that the
 * growth curve is compressed in log space so every step still reads as the
 * same ratio and the camera never has to frame a kilometre-tall object.
 */
export function visualSize(spec: ScenarioSpec, subjectScale: number): number {
  const base = spec.subject.baseSize;
  const maxScale = Math.max(1, ...spec.beats.map((b) => b.subjectScale));
  const natural = base * maxScale;
  const k = natural > MAX_VISUAL_SIZE && maxScale > 1 ? Math.log(MAX_VISUAL_SIZE / base) / Math.log(maxScale) : 1;
  return base * Math.pow(subjectScale, k);
}

/**
 * The height the camera frames for at a beat, in world units. A beat's own
 * shot wins; a shot of 0 means "by the mode": the subject's size in "scale"
 * mode, a room in "story" mode, a block in "overview" mode. The subject is
 * never framed out, so a shot smaller than the subject grows to fit it.
 */
export function shotFor(spec: ScenarioSpec, beat: Beat): number {
  const subject = visualSize(spec, beat.subjectScale);
  const byMode = spec.mode === "story" ? STORY_SHOT : spec.mode === "overview" ? OVERVIEW_SHOT : subject;
  const wanted = beat.shot > 0 ? beat.shot : byMode;
  return Math.min(MAX_SHOT, Math.max(wanted, subject));
}

export interface WeatherState {
  /** 0..1 intensity of what is falling right now. */
  fall: number;
  /** Depth of what has settled on the ground, in world units. */
  depth: number;
}

export interface TimelineState {
  /** Current time in seconds. */
  t: number;
  /** Index of the active beat (last beat with at <= t), or -1 before the first. */
  beatIndex: number;
  beat: Beat | null;
  /** Seconds since the active beat started. */
  since: number;
  /** Seconds until the next beat (Infinity after the last). */
  untilNext: number;
  /** Interpolated narrative scale multiplier (with overshoot). */
  subjectScale: number;
  /** Subject height in world units for this frame. */
  subjectSize: number;
  /** Height the camera frames for: eased slower and without overshoot. */
  cameraSize: number;
  /** Where the subject is and which way it faces, along its keyframes. */
  subjectAt: ActorState;
  /** What is falling and how deep it lies. */
  weather: WeatherState;
  /** 0..1 progress through the whole video. */
  progress: number;
  /** Effects fired by the active beat with the seconds since they fired. */
  effects: { name: Beat["effects"][number]; age: number }[];
}

function interpolateScale(from: number, to: number, p: number): number {
  // Log space so a 2x step looks the same at any absolute size.
  return Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * p);
}

/**
 * Resolve everything time-dependent for time t. Pure: same spec + t always
 * yields the same state.
 */
export function resolveState(spec: ScenarioSpec, t: number): TimelineState {
  const beats = spec.beats;
  let beatIndex = -1;
  for (let i = 0; i < beats.length; i++) {
    if (beats[i]!.at <= t) beatIndex = i;
    else break;
  }
  const beat = beatIndex >= 0 ? beats[beatIndex]! : null;
  const next = beats[beatIndex + 1] ?? null;
  const since = beat ? t - beat.at : t;
  const untilNext = next ? next.at - t : Number.POSITIVE_INFINITY;

  let subjectScale: number;
  let cameraSize: number;
  let weather: WeatherState;
  if (!beat) {
    const first = beats[0]!;
    subjectScale = first.subjectScale;
    cameraSize = shotFor(spec, first);
    weather = { fall: first.fall, depth: first.depth };
  } else {
    const prev = beatIndex > 0 ? beats[beatIndex - 1]! : beat;
    const from = prev.subjectScale;
    const to = beat.subjectScale;
    subjectScale = from === to ? to : interpolateScale(from, to, easeOutBack(clamp01(since / GROW_SECONDS)));
    const shotFrom = shotFor(spec, prev);
    const shotTo = shotFor(spec, beat);
    cameraSize =
      shotFrom === shotTo ? shotTo : interpolateScale(shotFrom, shotTo, easeOutCubic(clamp01(since / CAMERA_SECONDS)));
    // Whatever is falling piles up to the beat's depth as the beat lands, so
    // the city is as buried as the stat line says while the line is read.
    const settled = easeInOutCubic(clamp01(since / SETTLE_SECONDS));
    weather = {
      fall: prev.fall + (beat.fall - prev.fall) * clamp01(since / FALL_SECONDS),
      depth: prev.depth + (beat.depth - prev.depth) * settled,
    };
  }

  const effects = beat ? beat.effects.map((name) => ({ name, age: since })) : [];
  const subjectSize = visualSize(spec, subjectScale);

  return {
    t,
    beatIndex,
    beat,
    since,
    untilNext,
    subjectScale,
    subjectSize,
    cameraSize,
    subjectAt: resolveSubject(spec, t, subjectSize),
    weather,
    progress: clamp01(t / spec.format.duration),
    effects,
  };
}

export interface ActorState {
  x: number;
  z: number;
  /** Lift above the ground (a walking bob). */
  y: number;
  /** Heading in radians about the vertical axis. */
  ry: number;
  visible: boolean;
  moving: boolean;
}

interface TimedKeyframe {
  time: number;
  x: number;
  z: number;
  face: number;
  visible: boolean;
}

function keyframeTimes(spec: ScenarioSpec, keyframes: Keyframe[]): TimedKeyframe[] {
  const beats = spec.beats;
  return keyframes
    .map((k) => {
      const beat = beats[Math.min(Math.max(0, k.beat), beats.length - 1)]!;
      return { time: beat.at + k.offset, x: k.x, z: k.z, face: k.face, visible: k.visible };
    })
    .sort((a, b) => a.time - b.time);
}

/**
 * Where something is at time t along its keyframes. Between keyframes it
 * glides with an ease in and out and faces the way it moves; standing still
 * it faces its keyframe's direction; before its first keyframe it holds the
 * first one and after the last it holds the last. Walkers bob as they move.
 */
function alongKeyframes(keys: TimedKeyframe[], t: number, walks: boolean, size: number): ActorState {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1]!.time <= t) i++;
  const a = keys[i]!;
  const b = t >= a.time ? keys[i + 1] : undefined;
  let x = a.x;
  let z = a.z;
  let moving = false;
  let ry = (a.face * Math.PI) / 180;
  if (b) {
    const span = b.time - a.time;
    const p = span < 0.01 ? 1 : easeInOutCubic(clamp01((t - a.time) / span));
    x = a.x + (b.x - a.x) * p;
    z = a.z + (b.z - a.z) * p;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.hypot(dx, dz) > 1e-3) {
      ry = Math.atan2(dx, dz);
      moving = p > 0 && p < 1;
    }
  }
  const y = moving && walks ? Math.abs(Math.sin(t * 9)) * size * 0.04 : 0;
  return { x, z, y, ry, visible: a.visible, moving };
}

const AT_ORIGIN: ActorState = { x: 0, z: 0, y: 0, ry: 0, visible: true, moving: false };

/** Where the subject is at time t: along its keyframes, or at the origin facing the camera. */
export function resolveSubject(spec: ScenarioSpec, t: number, size = spec.subject.baseSize): ActorState {
  const keyframes = spec.subject.keyframes;
  if (keyframes.length === 0) return AT_ORIGIN;
  return alongKeyframes(keyframeTimes(spec, keyframes), t, true, size);
}

/** Where every extra is at time t. Pure, like resolveState. */
export function resolveActors(spec: ScenarioSpec, t: number): ActorState[] {
  return spec.actors.map((actor: Actor) => {
    const walks = actor.kind === "person" || actor.kind === "animal";
    return alongKeyframes(keyframeTimes(spec, actor.keyframes), t, walks, actor.size);
  });
}

/** Total frame count for capture. */
export function frameCount(spec: { format: { duration: number; fps: number } }): number {
  return Math.round(spec.format.duration * spec.format.fps);
}
