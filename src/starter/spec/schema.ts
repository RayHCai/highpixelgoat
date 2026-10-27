import { z } from "zod";

/**
 * ScenarioSpec is the single contract between the generator (LLM output), the
 * voice step (narration audio) and the player (three.js renderer). Everything
 * the renderer needs to draw a complete, timed short is in here; nothing is
 * decided at render time.
 */

export const STYLES = ["pixels", "lowpoly", "drawing"] as const;
export type Style = (typeof STYLES)[number];

/**
 * Where the scenario plays out. The first group are everyday places built
 * from props (rooms are cut-away interiors inside a house on a suburban
 * block); the second group are natural landscapes.
 */
export const TERRAINS = [
  "bedroom",
  "livingroom",
  "kitchen",
  "office",
  "street",
  "city",
  "park",
  "plains",
  "mountains",
  "island",
  "desert",
  "snow",
  "ocean",
] as const;
export type Terrain = (typeof TERRAINS)[number];

export const SHAPES = ["blob", "cube", "sphere", "cylinder", "pyramid", "humanoid", "coin"] as const;
export type Shape = (typeof SHAPES)[number];

export const TEXTURES = ["checker", "solid", "stripes", "noise"] as const;
export type Texture = (typeof TEXTURES)[number];

export const PART_KINDS = ["box", "sphere", "cylinder", "cone"] as const;
export type PartKind = (typeof PART_KINDS)[number];
export const PATTERNS = ["solid", "checker", "stripes"] as const;
export type Pattern = (typeof PATTERNS)[number];

export const EFFECTS = ["debris", "shake", "dust", "flash"] as const;
export type Effect = (typeof EFFECTS)[number];

/**
 * The format of the video: how the camera is driven and what changes over
 * the beats. "scale" is the subject changing size with the camera pulling
 * back; "story" is a life-sized subject living through the scenario while
 * time passes, the camera following it; "overview" is a wide held shot of
 * the whole place while something piles up over it and the extras animate.
 */
export const MODES = ["scale", "story", "overview"] as const;
export type Mode = (typeof MODES)[number];

/** Something falling from the sky over the whole set and settling on the ground. */
export const WEATHER_KINDS = ["none", "snow", "rain", "ash", "confetti"] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** Narrator personas; each voice provider maps them onto its own voices. */
export const PERSONAS = ["narrator", "buddy", "bright", "cheerful", "dry", "posh", "hype", "storyteller"] as const;
export type Persona = (typeof PERSONAS)[number];

export const PACES = ["relaxed", "brisk", "fast"] as const;
export type Pace = (typeof PACES)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected a #rrggbb color");

/**
 * One primitive of the subject model, in a unit space: x and z run from -0.5
 * to 0.5, y runs up from 0 at the ground. The model is normalised so its
 * largest dimension is 1 and its lowest point sits on the ground.
 */
export const PartSchema = z.object({
  kind: z.enum(PART_KINDS),
  /** Centre. */
  x: z.number(),
  y: z.number(),
  z: z.number(),
  /** Full extents. */
  w: z.number().positive(),
  h: z.number().positive(),
  d: z.number().positive(),
  /** Rotation about each axis in degrees, applied about the centre. */
  rx: z.number().default(0),
  ry: z.number().default(0),
  rz: z.number().default(0),
  color: hexColor,
  pattern: z.enum(PATTERNS).default("solid"),
  /** Second colour for checker and stripes. */
  color2: hexColor.optional(),
});
export type Part = z.infer<typeof PartSchema>;

export const ACTOR_KINDS = ["person", "animal", "vehicle", "object"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

/** Where an extra is at a moment of the video, timed relative to a beat. */
export const KeyframeSchema = z.object({
  /** Index of the beat this keyframe hangs off (0 = the first beat). */
  beat: z.number().int().min(0),
  /** Seconds after that beat starts. */
  offset: z.number().min(0).default(0),
  /** World position, in terrain units, with the subject at the origin. */
  x: z.number(),
  z: z.number(),
  /** Facing while standing still, degrees: 0 faces the camera (+z), 90 faces +x. */
  face: z.number().default(0),
  visible: z.boolean().default(true),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

/** An extra: another person, animal, vehicle or object taking part in the scene. */
export const ActorSchema = z.object({
  name: z.string().max(40),
  kind: z.enum(ACTOR_KINDS),
  /** Its model, in the same unit space as the subject. */
  parts: z.array(PartSchema).min(1).max(24),
  /** Largest dimension in world units (a person is 0.6). Extras stay life-sized. */
  size: z.number().positive(),
  keyframes: z.array(KeyframeSchema).min(1).max(12),
});
export type Actor = z.infer<typeof ActorSchema>;

/** One spoken word of a narration line, timed in seconds from the beat start. */
export const WordSchema = z.object({
  text: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
});
export type Word = z.infer<typeof WordSchema>;

export const BeatSchema = z.object({
  /**
   * Absolute time in seconds from the start of the video. Derived from the
   * narration lengths by fitNarration for generated scenarios; hand-written
   * scenarios set it directly.
   */
  at: z.number().min(0).default(0),
  /** Big serif heading, e.g. "Hour 45". Keep under ~14 characters. */
  heading: z.string().min(1).max(40),
  /** Bold uppercase stat lines under the heading, e.g. "176 BILLION TONNES". */
  stats: z.array(z.string().max(40)).max(3),
  /**
   * The spoken line for this beat. It is read aloud by the narrator and shown
   * as the subtitle, word by word. Empty for a silent beat.
   */
  narration: z.string().max(240).default(""),
  /** Measured length of the narration audio in seconds (set by the voice step). */
  narrationSeconds: z.number().min(0).optional(),
  /** Word timings for the subtitle highlight (set by the voice step when known). */
  words: z.array(WordSchema).optional(),
  /**
   * Target subject scale (multiplier of subject.baseSize) reached at this
   * beat. Non-decreasing for a growth scenario; the reverse for a shrink.
   */
  subjectScale: z.number().positive(),
  /**
   * How tall a thing the camera frames for at this beat, in world units.
   * 0 frames by the mode's rule: the subject's own size in "scale" mode, a
   * room-sized shot in "story" mode, a block in "overview" mode.
   */
  shot: z.number().min(0).default(0),
  /** How heavily the weather falls during this beat, 0 to 1. */
  fall: z.number().min(0).max(1).default(0),
  /** How deep what has fallen lies on the ground by the end of this beat, in world units. */
  depth: z.number().min(0).default(0),
  /** One-shot effects fired at this beat. */
  effects: z.array(z.enum(EFFECTS)).default([]),
});
export type Beat = z.infer<typeof BeatSchema>;

export const ScenarioSpecSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be a lowercase slug"),
  title: z.string().min(1).max(80),
  style: z.enum(STYLES),
  /** How the camera is driven and what changes over the beats. */
  mode: z.enum(MODES).default("scale"),
  /** What falls over the set and piles up on the ground (depth per beat); nothing by default. */
  weather: z
    .object({
      kind: z.enum(WEATHER_KINDS).default("none"),
      color: hexColor.default("#ffffff"),
    })
    .default({ kind: "none", color: "#ffffff" }),
  format: z
    .object({
      width: z.number().int().positive().default(1080),
      height: z.number().int().positive().default(1920),
      fps: z.number().int().min(12).max(60).default(30),
      /** Total length in seconds. Short-form sweet spot is 20-45s. */
      duration: z.number().min(5).max(90).default(35),
    })
    .default({ width: 1080, height: 1920, fps: 30, duration: 35 }),
  world: z.object({
    terrain: z.enum(TERRAINS),
    /** Deterministic seed for terrain, clouds and debris. */
    seed: z.number().int().default(1),
    /** Optional palette overrides; renderer has defaults per terrain. */
    sky: hexColor.optional(),
    fog: hexColor.optional(),
  }),
  subject: z
    .object({
      /** Callout label drawn next to the subject, e.g. "YOU". */
      label: z.string().max(16),
      /** The model: what the scenario is about, built from primitives (a dog, a penny, a person). */
      parts: z.array(PartSchema).min(1).max(40).optional(),
      /** Legacy fixed shapes, still accepted so older specs render. */
      shape: z.enum(SHAPES).optional(),
      texture: z.enum(TEXTURES).optional(),
      colors: z.tuple([hexColor, hexColor]).optional(),
      /** Size in world units at scale 1. One terrain cell is 1 unit. */
      baseSize: z.number().positive().default(1),
      /** Where the subject goes over the video; the camera follows. Empty when it stays at the origin. */
      keyframes: z.array(KeyframeSchema).max(12).default([]),
    })
    .refine((s) => (s.parts && s.parts.length > 0) || s.shape, { message: "subject needs parts or a shape" }),
  /** Persistent red pill under the heading, e.g. "CHEEKS DOUBLE EVERY HOUR". */
  rule: z.string().max(48).nullable(),
  /** Which narrator reads the lines and how quickly. */
  voice: z
    .object({
      persona: z.enum(PERSONAS).default("narrator"),
      pace: z.enum(PACES).default("brisk"),
    })
    .default({ persona: "narrator", pace: "brisk" }),
  /** The soundtrack the page and the video play, relative to the site folder. Absent when silent. */
  audio: z
    .object({
      /** Narration with the background track mixed under it (or the narration alone when there is no music). */
      src: z.string(),
      provider: z.string(),
      voice: z.string(),
      /** The narration alone. */
      narrationSrc: z.string().optional(),
      /** Name of the background track, null when none. */
      music: z.string().nullable().optional(),
    })
    .optional(),
  beats: z.array(BeatSchema).min(2).max(16),
  /** The other characters and things in the scene, moving along their keyframes. */
  actors: z.array(ActorSchema).max(8).default([]),
});
export type ScenarioSpec = z.infer<typeof ScenarioSpecSchema>;

/** Input type for the parsed shape (defaults not yet applied). */
export type ScenarioSpecInput = z.input<typeof ScenarioSpecSchema>;

/**
 * Parse unknown JSON into a ScenarioSpec, applying defaults. Throws a ZodError
 * with a readable path list on failure.
 */
export function parseSpec(input: unknown): ScenarioSpec {
  return ScenarioSpecSchema.parse(input);
}
