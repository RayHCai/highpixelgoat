import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { offlineMode } from "../agent/config";
import { agentSystemPrompt, editTask } from "../agent/prompt";
import { runSceneAgent, type AgentRun } from "../agent/run";
import { TakeSession } from "../agent/session";
import { offlineEdit } from "../script/offline";
import type { GeneratedSpec } from "../script/schema";
import { describeError } from "../shared/errors";
import { readJson, writeJson } from "../shared/json";
import { assetsPrompt, listAssets } from "../take/assets";
import { META_FILE, SPEC_FILE, voiceTake, type TakeContext } from "../take/folder";
import { buildSite, seedScene } from "../take/site";
import { listMusic, musicPrompt } from "../voice/music";
import { listSfx, sfxPrompt } from "../voice/sfx";
import {
  loadAgentSession,
  metaFromScript,
  publishTake,
  realiseScript,
  saveAgentSession,
  SCRIPT_FILE,
  takeContext,
} from "./pipeline";
import type { ChatMessage, VariantId } from "./records";
import { readChat, readVariant, updateVariant, variantDir, writeChat } from "./store";

/**
 * A chat turn: the author's message goes back to the Claude Code session the
 * take was made in, which edits the take folder. A turn that changed the take
 * must pass the same check as a new take or it is rolled back.
 */

export interface ChatResult {
  reply: string;
  changed: boolean;
}

/** Files a chat turn may change, saved first so a failed edit can be rolled back. */
const BACKED_UP = ["src", SPEC_FILE, META_FILE] as const;
const BACKUP_DIR = ".before-edit";

export async function chat(projectId: string, variantId: VariantId, message: string): Promise<ChatResult> {
  const history = readChat(projectId, variantId);
  const result = offlineMode()
    ? await offlineChat(projectId, variantId, message)
    : await agentChat(projectId, variantId, message, history);

  const user: ChatMessage = { role: "user", content: message, at: new Date().toISOString() };
  const assistant: ChatMessage = { role: "assistant", content: result.reply, at: new Date().toISOString() };
  writeChat(projectId, variantId, [...history, user, assistant]);
  if (result.changed) {
    const edits = readVariant(projectId, variantId)?.variant.edits ?? 0;
    updateVariant(projectId, variantId, { edits: edits + 1 });
  }
  return result;
}

async function offlineChat(projectId: string, variantId: VariantId, message: string): Promise<ChatResult> {
  const script = readJson<GeneratedSpec>(path.join(variantDir(projectId, variantId), SCRIPT_FILE));
  if (!script) throw new Error("offline mode can only edit takes that were made offline");
  const result = offlineEdit(
    script,
    message,
    listMusic().map((t) => t.name),
  );
  if (result.changed) await realiseScript(projectId, variantId, result.script);
  return { reply: result.reply, changed: result.changed };
}

async function agentChat(
  projectId: string,
  variantId: VariantId,
  message: string,
  history: ChatMessage[],
): Promise<ChatResult> {
  const dir = variantDir(projectId, variantId);
  // Takes made before every take owned its renderer get the starter now.
  seedScene(dir);
  ensureTakeMeta(dir);
  const ctx = takeContext(projectId, variantId);
  const session = new TakeSession(ctx);
  const backup = backUp(dir);
  const system = agentSystemPrompt(musicPrompt(listMusic()), sfxPrompt(listSfx()), assetsPrompt(listAssets()));
  const resume = loadAgentSession(dir);
  let run: AgentRun;
  try {
    try {
      // The session the take was made in already holds the whole conversation.
      run = await runSceneAgent(session, system, editTask(message), { verify: "when-changed", resume });
    } catch (err) {
      // A take from before sessions were kept, or whose session is gone: start one with the chat so far.
      if (!resume || session.changed) throw err;
      console.warn(
        `[${projectId}/${variantId}] could not resume session ${resume}, starting a new one:`,
        describeError(err),
      );
      run = await runSceneAgent(session, system, editTask(message, history), { verify: "when-changed" });
    }
    saveAgentSession(dir, run);
  } catch (err) {
    if (session.changed) {
      ctx.onActivity("Undoing the edit");
      await restore(ctx, backup).catch((e: unknown) => console.error(`[${projectId}/${variantId}] restore failed`, e));
    }
    updateVariant(projectId, variantId, { activity: null });
    throw err;
  } finally {
    rmSync(backup, { recursive: true, force: true });
  }
  if (session.changed) publishTake(projectId, variantId);
  else updateVariant(projectId, variantId, { activity: null });
  return { reply: run.reply, changed: session.changed };
}

function backUp(dir: string): string {
  const backup = path.join(dir, BACKUP_DIR);
  rmSync(backup, { recursive: true, force: true });
  for (const name of BACKED_UP) {
    if (existsSync(path.join(dir, name))) cpSync(path.join(dir, name), path.join(backup, name), { recursive: true });
  }
  return backup;
}

async function restore(ctx: TakeContext, backup: string): Promise<void> {
  for (const name of BACKED_UP) {
    rmSync(path.join(ctx.dir, name), { recursive: true, force: true });
    if (existsSync(path.join(backup, name))) {
      cpSync(path.join(backup, name), path.join(ctx.dir, name), { recursive: true });
    }
  }
  // The narration track and the bundle were rewritten while Claude worked.
  await voiceTake(ctx);
  await buildSite(ctx.dir);
}

/** Takes from before take.json existed keep their post in script.json. */
function ensureTakeMeta(dir: string): void {
  if (existsSync(path.join(dir, META_FILE))) return;
  writeJson(path.join(dir, META_FILE), metaFromScript(readJson<GeneratedSpec>(path.join(dir, SCRIPT_FILE))));
}
