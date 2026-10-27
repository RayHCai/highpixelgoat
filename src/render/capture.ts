import express from "express";
import { chromium, type Browser, type Page } from "playwright";

/**
 * Driving a built take in headless Chromium: serve its folder, open the
 * player with ?capture=1, and seek it to exact times through window.__hpg.
 * Used by the video exporter and by the scene agent's snapshot and checks.
 */

export async function launchBrowser(): Promise<Browser> {
  // SwiftShader keeps WebGL available on machines without a usable GPU in
  // headless mode; on machines with one the flags are harmless.
  return chromium.launch({
    headless: true,
    args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--disable-gpu-vsync"],
  });
}

export interface ServedFolder {
  url: string;
  close: () => Promise<void>;
}

/** Serve one site folder on a loopback port, for capture. */
export function serveFolder(dir: string): Promise<ServedFolder> {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.static(dir, { etag: false, cacheControl: false }));
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("could not determine capture server port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
    server.on("error", reject);
  });
}

/** What capture needs from a spec. Each take owns the rest of its spec's shape. */
export interface CaptureSpec {
  format: { width: number; height: number; fps: number; duration: number };
}

/**
 * Open the player page and wait until it is ready. Page errors and console
 * errors go to `onError` (the server log by default).
 */
export async function openPlayer(
  browser: Browser,
  pageUrl: string,
  spec: CaptureSpec,
  onError: (message: string) => void = (m) => console.error(m),
): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: spec.format.width, height: spec.format.height },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (err) => onError(`[page] ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") onError(`[page ${msg.type()}] ${msg.text()}`);
  });
  await page.goto(pageUrl, { waitUntil: "load" });
  await page.waitForFunction(() => window.__hpg !== undefined, null, { timeout: 90_000 });
  const status = await page.evaluate(() => {
    const api = window.__hpg!;
    return api.ready ? { ready: true as const } : { ready: false as const, error: api.error };
  });
  if (!status.ready) throw new Error(`player failed to start: ${status.error}`);
  return page;
}

export async function seekAndWait(page: Page, t: number): Promise<void> {
  await page.evaluate(async (time) => {
    const api = window.__hpg;
    if (!api || !api.ready) throw new Error("player not ready");
    api.seek(time);
    // Two frames so the compositor has picked up both the WebGL canvas and
    // the HUD before the screenshot is taken.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, t);
}
