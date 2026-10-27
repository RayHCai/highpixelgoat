import path from "node:path";
import { serveFolder } from "../render/capture";
import { renderVideo } from "../render/video";
import { describeError } from "../shared/errors";
import { readJson } from "../shared/json";
import { CoreSpecSchema } from "../take/core";
import { SPEC_FILE } from "../take/folder";
import { isVideoBusy, type VariantId, type VideoState } from "./records";
import { readVariant, updateVariant, variantDir } from "./store";

/**
 * Exporting a take to video.mp4. Renders are CPU-bound (software WebGL), so
 * they run one after another.
 */

const VIDEO_FILE = "video.mp4";
/** Progress is written to project.json at most this often. */
const PROGRESS_INTERVAL_MS = 1000;

let renderQueue: Promise<void> = Promise.resolve();

export function videoPath(projectId: string, variantId: VariantId): string {
  return path.join(variantDir(projectId, variantId), VIDEO_FILE);
}

/** Queue a video export for a ready take. No-op if one is already queued or running. */
export function requestRender(projectId: string, variantId: VariantId): VideoState {
  const found = readVariant(projectId, variantId);
  if (!found) throw new Error(`no such take ${projectId}/${variantId}`);
  const v = found.variant;
  if (v.status !== "ready") throw new Error("this take is still being built");
  if (v.activity) throw new Error("Claude is editing this take; render once the edit is done");
  if (isVideoBusy(v.video)) return v.video;
  const queued: VideoState = { status: "queued", progress: 0, error: null, renderedAt: null };
  updateVariant(projectId, variantId, { video: queued });
  renderQueue = renderQueue.then(() => renderNow(projectId, variantId)).catch(() => undefined);
  return queued;
}

async function renderNow(projectId: string, variantId: VariantId): Promise<void> {
  const dir = variantDir(projectId, variantId);
  const setVideo = (video: VideoState) => updateVariant(projectId, variantId, { video });
  const parsed = CoreSpecSchema.safeParse(readJson<unknown>(path.join(dir, SPEC_FILE)));
  if (!parsed.success) {
    setVideo({ status: "error", progress: 0, error: `the site has no valid ${SPEC_FILE}`, renderedAt: null });
    return;
  }
  const spec = parsed.data;
  setVideo({ status: "rendering", progress: 0, error: null, renderedAt: null });
  const site = await serveFolder(dir);
  let lastWrite = 0;
  try {
    await renderVideo({
      pageUrl: `${site.url}/index.html?capture=1`,
      spec,
      out: videoPath(projectId, variantId),
      audio: spec.audio ? path.join(dir, spec.audio.src) : null,
      jpeg: true,
      crf: 18,
      onProgress: (done, total) => {
        const now = Date.now();
        if (now - lastWrite < PROGRESS_INTERVAL_MS && done !== total) return;
        lastWrite = now;
        setVideo({ status: "rendering", progress: done / total, error: null, renderedAt: null });
      },
    });
    setVideo({ status: "ready", progress: 1, error: null, renderedAt: new Date().toISOString() });
  } catch (err) {
    console.error(`[${projectId}/${variantId}] render failed`, err);
    setVideo({ status: "error", progress: 0, error: describeError(err), renderedAt: null });
  } finally {
    await site.close();
  }
}
