import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "../shared/json";
import { OUT_DIR } from "../shared/paths";
import { slugify } from "../shared/text";
import {
  idleVideo,
  isBuilding,
  isProjectId,
  isVideoBusy,
  newVariant,
  type ChatMessage,
  type ProjectRecord,
  type VariantId,
  type VariantRecord,
} from "./records";

/**
 * Everything a project produces lives in out/<project id>/, one sub-folder per
 * variant, each a self-contained site:
 *
 *   out/<id>/project.json            status of the project and its variants
 *   out/<id>/<a|b|c>/index.html      the generated page (9:16 player)
 *   out/<id>/<a|b|c>/src/            the take's own renderer, copied from the starter and edited by Claude
 *   out/<id>/<a|b|c>/CLAUDE.md       the map of that code and the contract it keeps
 *   out/<id>/<a|b|c>/player.js       the take's renderer, bundled
 *   out/<id>/<a|b|c>/spec.json       the timed scenario the page plays
 *   out/<id>/<a|b|c>/take.json       angle, music, caption and hashtags
 *   out/<id>/<a|b|c>/script.json     the starter-shaped script, for offline takes (what offline chat edits)
 *   out/<id>/<a|b|c>/agent.json      the Claude Code session the take was made in
 *   out/<id>/<a|b|c>/audio/          narration clips, narration.mp3, and track.mp3 with the music under it
 *   out/<id>/<a|b|c>/caption.txt     the Instagram caption and hashtags, ready to paste
 *   out/<id>/<a|b|c>/chat.json       the edit conversation
 *   out/<id>/<a|b|c>/video.mp4       the export, once rendered
 *
 * One server process owns out/, so read-modify-write here is race-free.
 */

const PROJECT_FILE = "project.json";
const CHAT_FILE = "chat.json";

export function projectDir(id: string): string {
  return path.join(OUT_DIR, id);
}

export function variantDir(id: string, variant: VariantId): string {
  return path.join(OUT_DIR, id, variant);
}

export function newProjectId(prompt: string): string {
  const slug = slugify(prompt);
  // Cut long prompts at a word boundary so the folder name stays readable.
  const base = (slug.length > 40 ? slug.slice(0, 40).replace(/-[^-]*$/, "") : slug).replace(/-+$/, "") || "scenario";
  return `${base}-${randomBytes(2).toString("hex")}`;
}

/** Create and save a one-take project. `idSource` is slugified into its folder name. */
export function createProjectRecord(idSource: string, prompt: string, angle: string): ProjectRecord {
  const now = new Date().toISOString();
  const project: ProjectRecord = {
    id: newProjectId(idSource),
    prompt,
    createdAt: now,
    updatedAt: now,
    selected: "a",
    variants: [newVariant("a", angle)],
  };
  writeProject(project);
  return project;
}

export function readProject(id: string): ProjectRecord | null {
  return isProjectId(id) ? readJson<ProjectRecord>(path.join(projectDir(id), PROJECT_FILE)) : null;
}

export function writeProject(p: ProjectRecord): void {
  p.updatedAt = new Date().toISOString();
  writeJson(path.join(projectDir(p.id), PROJECT_FILE), p);
}

/** A project and one of its variants, or null when either does not exist. */
export function readVariant(id: string, variant: VariantId): { project: ProjectRecord; variant: VariantRecord } | null {
  const project = readProject(id);
  const v = project?.variants.find((x) => x.id === variant);
  return project && v ? { project, variant: v } : null;
}

/** Newest first. Folders without a project.json (old renders) are skipped. */
export function listProjects(): ProjectRecord[] {
  if (!existsSync(OUT_DIR)) return [];
  const projects: ProjectRecord[] = [];
  for (const entry of readdirSync(OUT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = readProject(entry.name);
    if (p) projects.push(p);
  }
  return projects.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Read-modify-write of one variant. */
export function updateVariant(id: string, variant: VariantId, patch: Partial<VariantRecord>): ProjectRecord {
  const found = readVariant(id, variant);
  if (!found) throw new Error(`no such take ${id}/${variant}`);
  Object.assign(found.variant, patch, { updatedAt: new Date().toISOString() });
  writeProject(found.project);
  return found.project;
}

/**
 * After a restart nothing is running: takes caught mid-build are marked
 * failed and chat edits caught mid-way are let go, so the dashboard does not
 * wait on work that will never finish.
 */
export function recoverInterrupted(): void {
  const interrupted = "interrupted by a server restart";
  for (const p of listProjects()) {
    let touched = false;
    for (const v of p.variants) {
      if (isBuilding(v)) {
        Object.assign(v, { status: "error", error: interrupted });
        touched = true;
      }
      if (v.activity) {
        v.activity = null;
        touched = true;
      }
      if (isVideoBusy(v.video)) {
        v.video = { ...idleVideo(), status: "error", error: interrupted };
        touched = true;
      }
    }
    if (touched) writeProject(p);
  }
}

export function readChat(id: string, variant: VariantId): ChatMessage[] {
  return readJson<{ messages: ChatMessage[] }>(path.join(variantDir(id, variant), CHAT_FILE))?.messages ?? [];
}

export function writeChat(id: string, variant: VariantId, messages: ChatMessage[]): void {
  writeJson(path.join(variantDir(id, variant), CHAT_FILE), { messages });
}
