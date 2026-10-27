import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AgentRun } from "../agent/run";
import { toScenarioSpec } from "../script/lift";
import type { GeneratedSpec } from "../script/schema";
import { readJson, writeJson } from "../shared/json";
import { capitalise } from "../shared/text";
import { cleanCaption, cleanHashtags, instagramText } from "../take/caption";
import { specLabel, type TakeMeta } from "../take/core";
import { META_FILE, readTakeMeta, readTakeSpec, SPEC_FILE, voiceTake, type TakeContext } from "../take/folder";
import { buildSite, seedScene } from "../take/site";
import { getProvider } from "../voice/tts";
import { idleVideo, VARIANT_IDS, type VariantId } from "./records";
import { updateVariant, variantDir } from "./store";

/**
 * The steps every path through the pipeline shares: binding a take folder to
 * its project, remembering the Claude Code session a take lives in, turning a
 * starter-shaped script into a take without Claude, and publishing a checked
 * take to the dashboard.
 */

export const SCRIPT_FILE = "script.json";
/** The Claude Code session a take was made (and last edited) in, so chat continues that conversation. */
const AGENT_FILE = "agent.json";

export function takeContext(projectId: string, variantId: VariantId): TakeContext {
  return {
    dir: variantDir(projectId, variantId),
    projectId,
    take: VARIANT_IDS.indexOf(variantId),
    provider: getProvider,
    onActivity: (text) => updateVariant(projectId, variantId, { activity: text }),
  };
}

export function saveAgentSession(dir: string, run: AgentRun): void {
  if (run.sessionId) writeJson(path.join(dir, AGENT_FILE), { sessionId: run.sessionId });
}

export function loadAgentSession(dir: string): string | null {
  return readJson<{ sessionId?: string }>(path.join(dir, AGENT_FILE))?.sessionId ?? null;
}

export function metaFromScript(script: GeneratedSpec | null): TakeMeta {
  return {
    angle: script?.angle ?? "",
    music: script?.music ?? "",
    caption: script?.caption ?? "",
    hashtags: script?.hashtags ?? [],
  };
}

/**
 * Show a checked take on the dashboard: the labels from its spec, its
 * Instagram text from take.json, and a fresh builtAt so the player reloads.
 */
export function publishTake(projectId: string, variantId: VariantId): void {
  const dir = variantDir(projectId, variantId);
  const spec = readTakeSpec(dir);
  const meta = readTakeMeta(dir);
  const instagram = instagramText(meta.caption, meta.hashtags);
  writeFileSync(path.join(dir, "caption.txt"), `${instagram}\n`);
  // A video of the previous version is no longer this take.
  rmSync(path.join(dir, "video.mp4"), { force: true });
  const mode = specLabel(spec, "mode");
  updateVariant(projectId, variantId, {
    status: "ready",
    error: null,
    activity: null,
    ...(meta.angle ? { angle: capitalise(meta.angle) } : {}),
    title: spec.title,
    mode: mode ? capitalise(mode) : null,
    style: specLabel(spec, "style"),
    terrain: specLabel(spec, "world", "terrain"),
    duration: spec.format.duration,
    voice: `${spec.voice.persona} / ${spec.voice.pace}`,
    music: spec.audio?.music ?? null,
    caption: cleanCaption(meta.caption),
    hashtags: cleanHashtags(meta.hashtags),
    instagram,
    builtAt: new Date().toISOString(),
    video: idleVideo(),
  });
}

/** Make a take from a starter-shaped script without Claude: offline takes, offline edits and imports. */
export async function realiseScript(projectId: string, variantId: VariantId, script: GeneratedSpec): Promise<void> {
  const ctx = takeContext(projectId, variantId);
  seedScene(ctx.dir);
  writeJson(path.join(ctx.dir, SCRIPT_FILE), script);
  writeJson(path.join(ctx.dir, META_FILE), metaFromScript(script));
  writeJson(path.join(ctx.dir, SPEC_FILE), toScenarioSpec(script, { id: `${projectId}-${variantId}`, seed: null }));
  updateVariant(projectId, variantId, { status: "voicing", error: null });
  await voiceTake(ctx);
  updateVariant(projectId, variantId, { status: "building" });
  const report = await buildSite(ctx.dir);
  if (!report.ok) throw new Error(report.errors.join("\n"));
  publishTake(projectId, variantId);
}
