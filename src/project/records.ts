/**
 * The records the server keeps in out/<id>/project.json and the dashboard
 * reads over the API. Types and pure helpers only, so web/ can import them.
 */

export type VariantId = "a" | "b" | "c";
export const VARIANT_IDS: readonly VariantId[] = ["a", "b", "c"];

export type VariantStatus = "queued" | "scripting" | "voicing" | "building" | "ready" | "error";

export interface VideoState {
  status: "idle" | "queued" | "rendering" | "ready" | "error";
  /** 0..1 while rendering. */
  progress: number;
  error: string | null;
  renderedAt: string | null;
}

export interface VariantRecord {
  id: VariantId;
  angle: string;
  /** The format Claude chose: "Scale", "Story" or "Overview"; null until the script exists. */
  mode?: string | null;
  status: VariantStatus;
  error: string | null;
  title: string | null;
  style: string | null;
  terrain: string | null;
  duration: number | null;
  /** Narrator persona and pace, e.g. "dry / brisk". */
  voice: string | null;
  /** Name of the background track mixed under the narration, null when none. */
  music: string | null;
  /** Instagram caption and hashtags written with the script. */
  caption: string | null;
  hashtags: string[];
  /** Ready to paste: caption, blank line, hashtags. */
  instagram: string | null;
  /** Number of chat edits applied. */
  edits: number;
  /** What Claude is doing in this take right now ("Editing src/scene/props.ts"), null when idle. */
  activity?: string | null;
  /** When the site folder was last (re)built; the dashboard reloads the player on change. */
  builtAt: string | null;
  updatedAt: string;
  video: VideoState;
}

export interface ProjectRecord {
  id: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  selected: VariantId | null;
  variants: VariantRecord[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export const idleVideo = (): VideoState => ({ status: "idle", progress: 0, error: null, renderedAt: null });

/** A video export that has been asked for and has not finished. */
export function isVideoBusy(video: VideoState): boolean {
  return video.status === "queued" || video.status === "rendering";
}

/** A take that is still being made (not ready, not failed). */
export function isBuilding(v: VariantRecord): boolean {
  return v.status !== "ready" && v.status !== "error";
}

export function isVariantId(x: string): x is VariantId {
  return (VARIANT_IDS as readonly string[]).includes(x);
}

export function isProjectId(x: string): boolean {
  return /^[a-z0-9-]{3,64}$/.test(x);
}

export function newVariant(id: VariantId, angle: string): VariantRecord {
  return {
    id,
    angle,
    status: "queued",
    error: null,
    title: null,
    style: null,
    terrain: null,
    duration: null,
    voice: null,
    music: null,
    caption: null,
    hashtags: [],
    instagram: null,
    edits: 0,
    activity: null,
    builtAt: null,
    updatedAt: new Date().toISOString(),
    video: idleVideo(),
  };
}
