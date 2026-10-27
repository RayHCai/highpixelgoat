import { z } from "zod";
import { PACES, PERSONAS, WordSchema } from "../starter/spec/schema";
import { MUSIC_CUES } from "../voice/music";

/**
 * The part of a take's spec.json the server reads: what the narrator says,
 * who says it, the music cues and sound effects on each beat, and the frame
 * the video is captured at. Every take owns its
 * renderer and its schema (src/spec/schema.ts inside the take), so anything
 * else in the spec passes through untouched. The take.json beside it holds
 * what is not on screen: the angle, the music and the Instagram post.
 */

export const STAGE = { width: 1080, height: 1920 } as const;

export const CoreBeatSchema = z.looseObject({
  at: z.number().min(0).optional(),
  narration: z.string().max(240).default(""),
  narrationSeconds: z.number().min(0).optional(),
  words: z.array(WordSchema).optional(),
  /** What the music does from the start of this beat until a later cue. */
  musicCue: z.enum(MUSIC_CUES).optional(),
  /** Sound effects from the library, placed relative to the start of this beat. */
  sfx: z
    .array(
      z.object({
        name: z.string().min(1),
        offset: z.number().min(0).default(0),
        volume: z.number().min(0).max(1).default(0.8),
      }),
    )
    .optional(),
});

export const CoreSpecSchema = z.looseObject({
  title: z.string().min(1).max(80),
  voice: z
    .object({ persona: z.enum(PERSONAS).default("narrator"), pace: z.enum(PACES).default("brisk") })
    .default({ persona: "narrator", pace: "brisk" }),
  format: z
    .looseObject({
      width: z.literal(STAGE.width).default(STAGE.width),
      height: z.literal(STAGE.height).default(STAGE.height),
      fps: z.number().int().min(12).max(60).default(30),
      duration: z.number().min(5).max(90).default(35),
    })
    .default({ width: STAGE.width, height: STAGE.height, fps: 30, duration: 35 }),
  beats: z.array(CoreBeatSchema).min(1).max(40),
  audio: z
    .looseObject({
      src: z.string(),
      provider: z.string(),
      voice: z.string(),
      narrationSrc: z.string().optional(),
      music: z.string().nullable().optional(),
    })
    .optional(),
});
export type CoreSpec = z.infer<typeof CoreSpecSchema>;

export const TakeMetaSchema = z.object({
  /** The creative angle, shown on the dashboard: "Deadpan", "Relatable", "Unhinged" or anything else. */
  angle: z.string().max(40).default(""),
  /** Exact name of a track in the music library, "none", or empty for a seeded pick. */
  music: z.string().default(""),
  caption: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
});
export type TakeMeta = z.infer<typeof TakeMetaSchema>;

/** A readable one-line-per-issue description of a zod failure. */
export function describeIssues(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}

/** A field of the take's spec the dashboard shows, when the take kept it and it is a string. */
export function specLabel(spec: Record<string, unknown>, ...keys: string[]): string | null {
  let v: unknown = spec;
  for (const k of keys) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  return typeof v === "string" && v ? v : null;
}
