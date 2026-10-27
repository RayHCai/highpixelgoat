import path from "node:path";
import { readJson, writeJson } from "../shared/json";
import { resolveMusic } from "../voice/music";
import { listSfx } from "../voice/sfx";
import type { TtsProvider } from "../voice/tts";
import { CoreSpecSchema, describeIssues, TakeMetaSchema, type CoreSpec, type TakeMeta } from "./core";
import { narrate } from "./narrate";

/**
 * Reading and voicing one take folder: its spec.json (only the core the
 * server understands), its take.json, and the narration recorded from them.
 */

export interface TakeContext {
  dir: string;
  projectId: string;
  /** Index of the take in its project, for the seeded music pick. */
  take: number;
  provider: () => Promise<TtsProvider>;
  /** What is happening to this take right now, for the dashboard. */
  onActivity: (text: string) => void;
}

export const SPEC_FILE = "spec.json";
export const META_FILE = "take.json";

export function readTakeSpec(dir: string): CoreSpec {
  const raw = readJson<unknown>(path.join(dir, SPEC_FILE));
  if (raw === null) throw new Error(`${SPEC_FILE} does not exist yet: write it first`);
  const parsed = CoreSpecSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${SPEC_FILE} is missing what the narration needs:\n${describeIssues(parsed.error)}`);
  }
  return parsed.data;
}

export function readTakeMeta(dir: string): TakeMeta {
  const parsed = TakeMetaSchema.safeParse(readJson<unknown>(path.join(dir, META_FILE)) ?? {});
  if (!parsed.success) throw new Error(`${META_FILE} is invalid:\n${describeIssues(parsed.error)}`);
  return parsed.data;
}

/** Record the narration (cached per line), lay out the beats and mix the soundtrack (music cues, effects) into spec.json. */
export async function voiceTake(ctx: TakeContext): Promise<CoreSpec> {
  const spec = readTakeSpec(ctx.dir);
  const track = resolveMusic(readTakeMeta(ctx.dir).music, { project: ctx.projectId, take: ctx.take });
  const voiced = await narrate(spec, ctx.dir, await ctx.provider(), track, listSfx());
  writeJson(path.join(ctx.dir, SPEC_FILE), voiced);
  return voiced;
}
