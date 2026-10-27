import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { offlineMode } from "../agent/config";
import { agentSystemPrompt, generationTask } from "../agent/prompt";
import { runSceneAgent } from "../agent/run";
import { TakeSession } from "../agent/session";
import { toGenerated } from "../script/lift";
import { offlineScript } from "../script/offline";
import { describeError } from "../shared/errors";
import { parseSpec } from "../starter/spec/schema";
import { seedScene } from "../take/site";
import { listMusic, musicPrompt } from "../voice/music";
import { listSfx, sfxPrompt } from "../voice/sfx";
import { realiseScript, publishTake, saveAgentSession, takeContext } from "./pipeline";
import type { ProjectRecord, VariantId } from "./records";
import { createProjectRecord, readProject, updateVariant, variantDir } from "./store";

/**
 * Making a take: a prompt goes to the scene agent (or, offline, a bundled
 * script stands in), and the take must pass verifyTake before it is shown.
 * One video at a time: projects queue up and build one after another.
 */

let generationQueue: Promise<void> = Promise.resolve();

/** Start a project. Returns at once; `done` settles when its take has finished or failed. */
export function createProject(prompt: string): { project: ProjectRecord; done: Promise<void> } {
  const project = createProjectRecord(prompt, prompt, "Choosing the angle");
  const done = (generationQueue = generationQueue.then(() =>
    buildVariant(project.id, "a").catch((err: unknown) => {
      console.error(`[${project.id}/a]`, err);
      updateVariant(project.id, "a", { status: "error", error: describeError(err), activity: null });
    }),
  ));
  return { project, done };
}

/** A stable per-take seed for the parts of the scene that need one. */
function generationSeed(projectId: string, variantId: VariantId): number {
  return (createHash("sha1").update(`${projectId}/${variantId}`).digest().readUInt32BE(0) % 900000) + 1;
}

async function buildVariant(projectId: string, variantId: VariantId): Promise<void> {
  const project = readProject(projectId);
  if (!project) throw new Error(`no such project ${projectId}`);
  const dir = variantDir(projectId, variantId);
  mkdirSync(dir, { recursive: true });
  seedScene(dir);
  updateVariant(projectId, variantId, { status: "scripting", error: null });
  if (offlineMode()) {
    await realiseScript(projectId, variantId, offlineScript(projectId));
    return;
  }
  const session = new TakeSession(takeContext(projectId, variantId));
  const task = generationTask(project.prompt, generationSeed(projectId, variantId));
  const system = agentSystemPrompt(musicPrompt(listMusic()), sfxPrompt(listSfx()));
  const run = await runSceneAgent(session, system, task, { verify: "always" });
  saveAgentSession(dir, run);
  publishTake(projectId, variantId);
}

/** Bring a hand-written scenario JSON into the out/ layout as a one-take project. */
export async function importScenario(file: string): Promise<ProjectRecord> {
  const spec = parseSpec(JSON.parse(readFileSync(file, "utf8")));
  const project = createProjectRecord(spec.id, spec.title, "Imported");
  await realiseScript(project.id, "a", toGenerated(spec));
  updateVariant(project.id, "a", { angle: "Imported" });
  const imported = readProject(project.id);
  if (!imported) throw new Error(`project ${project.id} disappeared while importing`);
  return imported;
}
