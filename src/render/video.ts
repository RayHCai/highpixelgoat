import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { frameCount } from "../starter/spec/timing";
import { launchBrowser, openPlayer, seekAndWait, type CaptureSpec } from "./capture";

/**
 * Deterministic video export. The generated site is opened in headless
 * Chromium with ?capture=1, driven frame by frame through window.__hpg.seek,
 * screenshotted, and the frames piped into ffmpeg together with the narration
 * track. Output does not depend on machine speed.
 */

function spawnFfmpeg(spec: CaptureSpec, out: string, crf: number, audio: string | null, jpeg: boolean) {
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(spec.format.fps)];
  if (jpeg) args.push("-vcodec", "mjpeg");
  args.push("-i", "-");
  if (audio) args.push("-i", audio, "-shortest", "-c:a", "aac", "-b:a", "192k");
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    String(crf),
    "-preset",
    "medium",
    "-movflags",
    "+faststart",
    out,
  );
  const child = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  let stdinError: Error | null = null;
  child.stdin.on("error", (err) => (stdinError = err));
  const done = new Promise<void>((resolve, reject) => {
    child.on("error", (err) => reject(new Error(`ffmpeg failed to start (is it on PATH?): ${err.message}`)));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim().slice(-400)}`)),
    );
  });
  const write = (buf: Buffer) =>
    new Promise<void>((resolve, reject) => {
      if (stdinError) {
        reject(stdinError);
        return;
      }
      if (!child.stdin.write(buf)) child.stdin.once("drain", () => resolve());
      else resolve();
    });
  return { child, done, write };
}

/**
 * Screenshot with a generous timeout and one retry: software WebGL on a busy
 * machine can take a long time on the heaviest frames, and a single slow
 * frame must not fail a ten-minute render.
 */
async function captureFrame(page: Page, jpeg: boolean): Promise<Buffer> {
  const opts = {
    type: jpeg ? ("jpeg" as const) : ("png" as const),
    ...(jpeg ? { quality: 94 } : {}),
    timeout: 120_000,
  };
  try {
    return await page.screenshot(opts);
  } catch (err) {
    if (!(err instanceof Error) || !/Timeout/i.test(err.message)) throw err;
    return page.screenshot(opts);
  }
}

export interface RenderOptions {
  /** Full URL of the site page, including ?capture=1. */
  pageUrl: string;
  spec: CaptureSpec;
  out: string;
  /** Narration track to mux in, or null for a silent video. */
  audio: string | null;
  jpeg: boolean;
  crf: number;
  start?: number;
  end?: number | null;
  onProgress?: (done: number, total: number) => void;
}

export async function renderVideo(o: RenderOptions): Promise<void> {
  mkdirSync(path.dirname(o.out), { recursive: true });
  const fps = o.spec.format.fps;
  const total = frameCount(o.spec);
  const first = Math.max(0, Math.round((o.start ?? 0) * fps));
  const last = Math.min(total, o.end == null ? total : Math.round(o.end * fps));
  const browser = await launchBrowser();
  try {
    const page = await openPlayer(browser, o.pageUrl, o.spec);
    const ffmpeg = spawnFfmpeg(o.spec, o.out, o.crf, o.audio, o.jpeg);
    for (let i = first; i < last; i++) {
      await seekAndWait(page, i / fps);
      const buf = await captureFrame(page, o.jpeg);
      await ffmpeg.write(buf);
      if ((i - first) % 15 === 0 || i === last - 1) o.onProgress?.(i - first + 1, last - first);
    }
    ffmpeg.child.stdin.end();
    await ffmpeg.done;
  } finally {
    await browser.close();
  }
}

export async function renderStills(o: {
  pageUrl: string;
  spec: CaptureSpec;
  times: number[];
  outDir: string;
  jpeg: boolean;
}): Promise<string[]> {
  mkdirSync(o.outDir, { recursive: true });
  const browser = await launchBrowser();
  const files: string[] = [];
  try {
    const page = await openPlayer(browser, o.pageUrl, o.spec);
    for (const t of o.times) {
      await seekAndWait(page, t);
      const file = path.join(o.outDir, `still-${t.toFixed(2).replace(/\.?0+$/, "")}s.${o.jpeg ? "jpg" : "png"}`);
      await page.screenshot({ path: file, type: o.jpeg ? "jpeg" : "png", ...(o.jpeg ? { quality: 94 } : {}) });
      files.push(file);
    }
  } finally {
    await browser.close();
  }
  return files;
}
