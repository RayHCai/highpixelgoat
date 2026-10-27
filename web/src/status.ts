import {
  isBuilding,
  isVideoBusy,
  type ProjectRecord,
  type VariantRecord,
  type VideoState,
} from "../../src/project/records";

/** How the dashboard words a take's state. Pure, so it is unit tested. */

export const STEP_LABEL: Record<VariantRecord["status"], string> = {
  queued: "Queued",
  scripting: "Directing",
  voicing: "Recording",
  building: "Building",
  ready: "Ready",
  error: "Failed",
};

/** Anything still in flight, so the page should keep polling. */
export function isBusy(p: ProjectRecord): boolean {
  return p.variants.some((v) => isBuilding(v) || Boolean(v.activity) || isVideoBusy(v.video));
}

export function ago(iso: string, now = Date.now()): string {
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** The line under a take's title on its card. */
export function takeSubtitle(v: VariantRecord): string {
  if (v.status === "ready") {
    const edits = v.edits ? `${v.edits} edit${v.edits === 1 ? "" : "s"}` : "";
    return [v.mode, v.angle, v.terrain, v.style, `${v.duration}s`, edits].filter(Boolean).join(" · ");
  }
  if (v.status === "error") return v.error ?? "failed";
  return `${v.activity ?? STEP_LABEL[v.status]}…`;
}

/** The line under a take's title in the studio panel. */
export function studioSubtitle(v: VariantRecord): string {
  if (v.status !== "ready") return `${STEP_LABEL[v.status]}…`;
  return [v.mode, v.angle, v.terrain, v.style, v.voice, v.music ? `♪ ${v.music}` : "", `${v.duration}s`]
    .filter(Boolean)
    .join(" · ");
}

export function renderButtonLabel(video: VideoState): string {
  switch (video.status) {
    case "ready":
      return "Download video";
    case "queued":
      return "Queued…";
    case "rendering":
      return `Rendering ${Math.round(video.progress * 100)}%`;
    case "error":
      return "Render failed, retry";
    case "idle":
      return "Render video";
  }
}
