import { Hud, HUD_CSS } from "../hud/hud";
import { World } from "../scene/world";
import { normaliseModels } from "../spec/parts";
import { parseSpec, type ScenarioSpec } from "../spec/schema";
import { fitBeats, frameCount, resolveState } from "../spec/timing";

/**
 * The generated site. One bundle (player.js) sits next to spec.json and the
 * narration track in every out/<project>/<variant>/ folder, builds the world
 * and HUD inside a fixed 1080x1920 stage scaled to the window, and plays the
 * short with its voice-over. In capture mode it instead waits to be driven
 * frame by frame through window.__hpg.
 *
 * Query parameters:
 *   spec=<url>      scenario JSON to load (default ./spec.json next to the page)
 *   capture=1       no audio, no scaling, no controls; expose __hpg.seek
 *   t=<seconds>     start paused at this time
 */

export interface PlayerApi {
  ready: true;
  spec: ScenarioSpec;
  duration: number;
  frames: number;
  seek: (t: number) => void;
}

declare global {
  interface Window {
    __hpg?: PlayerApi | { ready: false; error: string };
  }
}

const params = new URLSearchParams(location.search);
const captureMode = params.get("capture") === "1";
const specUrl = new URL(params.get("spec") ?? "./spec.json", location.href);
const startAt = Number(params.get("t") ?? "0");

const PLAYER_CSS = `
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; color: #ddd; font-family: "Inter", "Segoe UI", system-ui, sans-serif; }
#stage { position: absolute; left: 50%; top: 50%; transform-origin: center center; overflow: hidden; background: #000; }
body.capture #stage { left: 0; top: 0; transform: none; }
#view { display: block; width: 100%; height: 100%; }
#overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.18); cursor: pointer; transition: opacity .25s; }
#overlay.hidden { opacity: 0; pointer-events: none; }
#overlay .big { width: 180px; height: 180px; border-radius: 50%; background: rgba(255,255,255,.92); display: flex; align-items: center; justify-content: center; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
#overlay .big svg { width: 76px; height: 76px; fill: #111; margin-left: 10px; }
#overlay.replay .big svg { margin-left: 0; }
#controls { position: absolute; left: 48px; right: 48px; bottom: 56px; height: 80px; display: flex; align-items: center; gap: 28px; padding: 0 36px; border-radius: 999px; background: rgba(12,12,14,.55); backdrop-filter: blur(14px); color: #fff; font-size: 28px; opacity: 0; transition: opacity .25s; }
#stage:hover #controls, #stage.paused #controls { opacity: 1; }
#controls button { width: 56px; height: 56px; border: 0; border-radius: 50%; background: transparent; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
#controls button svg { width: 36px; height: 36px; fill: #fff; }
#scrubber { flex: 1; height: 8px; accent-color: #fff; cursor: pointer; }
#time { font-variant-numeric: tabular-nums; opacity: .8; min-width: 190px; text-align: right; }
.error { position: fixed; left: 20px; top: 20px; right: 20px; padding: 16px; background: #3b1113; color: #ffd4d4; border-radius: 8px; white-space: pre-wrap; font: 14px/1.4 monospace; }
`;

const PLAY_ICON = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
const REPLAY_ICON = '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>';

async function loadSpec(url: URL): Promise<ScenarioSpec> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load ${url.pathname} (${res.status})`);
  return fitBeats(normaliseModels(parseSpec(await res.json())));
}

function fitStage(stage: HTMLElement, width: number, height: number): void {
  if (captureMode) {
    stage.style.transform = "none";
    return;
  }
  const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function post(message: Record<string, unknown>): void {
  if (window.parent !== window) window.parent.postMessage({ source: "hpg-player", ...message }, "*");
}

async function main(): Promise<void> {
  const style = document.createElement("style");
  style.textContent = PLAYER_CSS + HUD_CSS;
  document.head.appendChild(style);
  if (captureMode) document.body.classList.add("capture");

  const stage = document.createElement("div");
  stage.id = "stage";
  const canvas = document.createElement("canvas");
  canvas.id = "view";
  stage.appendChild(canvas);
  document.body.appendChild(stage);

  const spec = await loadSpec(specUrl);
  const { width, height, duration } = spec.format;
  document.title = spec.title;

  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  canvas.width = width;
  canvas.height = height;

  const world = new World(spec, canvas);
  const hud = new Hud(spec, stage);

  const seek = (t: number): void => {
    const state = resolveState(spec, t);
    world.update(state);
    world.render();
    hud.update(state, world.subjectTopOnScreen());
  };

  fitStage(stage, width, height);
  window.addEventListener("resize", () => fitStage(stage, width, height));

  // Wait for web fonts so the first frame matches later ones.
  await document.fonts.ready;
  window.__hpg = { ready: true, spec, duration, frames: frameCount(spec), seek };
  if (captureMode) {
    seek(Math.min(startAt, duration));
    return;
  }
  // Poster: a moment into the first beat, once its text has settled, so the
  // preview reads as the short rather than as an empty landscape. Playback
  // still starts from the beginning.
  const poster = params.has("t") ? Math.min(startAt, duration) : Math.min(duration, (spec.beats[0]?.at ?? 0) + 1.2);
  seek(poster);

  // Interactive playback. The narration track is the clock when present: the
  // visuals follow a smooth local clock that is pulled back into line with
  // audio.currentTime whenever it drifts.
  const audio = spec.audio ? new Audio(new URL(spec.audio.src, specUrl).href) : null;
  if (audio) audio.preload = "auto";

  const overlay = document.createElement("div");
  overlay.id = "overlay";
  overlay.innerHTML = `<div class="big">${PLAY_ICON}</div>`;
  stage.appendChild(overlay);

  const controls = document.createElement("div");
  controls.id = "controls";
  controls.innerHTML = `<button id="play" aria-label="Play">${PLAY_ICON}</button><input id="scrubber" type="range" min="0" max="${duration}" step="0.01" value="0" /><span id="time"></span>`;
  stage.appendChild(controls);
  const scrubber = controls.querySelector<HTMLInputElement>("#scrubber")!;
  const timeLabel = controls.querySelector<HTMLElement>("#time")!;
  const playButton = controls.querySelector<HTMLButtonElement>("#play")!;

  let playing = false;
  let ended = false;
  let t = Math.min(startAt, duration);
  let last = performance.now();

  const showOverlay = (): void => {
    overlay.classList.toggle("hidden", playing);
    overlay.classList.toggle("replay", ended);
    overlay.querySelector(".big")!.innerHTML = ended ? REPLAY_ICON : PLAY_ICON;
    playButton.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    stage.classList.toggle("paused", !playing);
  };

  const setPlaying = (p: boolean): void => {
    if (p && ended) {
      ended = false;
      t = 0;
    }
    playing = p;
    last = performance.now();
    if (audio) {
      if (p) {
        audio.currentTime = t;
        audio.play().catch(() => {
          /* autoplay policy: the overlay click is a gesture, so this only fails for programmatic play */
        });
      } else audio.pause();
    }
    showOverlay();
    post({ type: "state", playing, ended, t });
  };

  const scrubTo = (time: number): void => {
    t = Math.max(0, Math.min(duration, time));
    ended = false;
    if (audio) audio.currentTime = t;
    seek(t);
    showOverlay();
  };

  overlay.addEventListener("click", () => setPlaying(true));
  playButton.addEventListener("click", () => setPlaying(!playing));
  canvas.addEventListener("click", () => setPlaying(!playing));
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      setPlaying(!playing);
    }
  });
  scrubber.addEventListener("input", () => {
    setPlaying(false);
    scrubTo(Number(scrubber.value));
  });
  window.addEventListener("message", (e: MessageEvent<{ source?: string; type?: string }>) => {
    if (e.data?.source !== "hpg-dashboard") return;
    if (e.data.type === "pause" && playing) setPlaying(false);
    if (e.data.type === "play" && !playing) setPlaying(true);
  });

  const frame = (now: number): void => {
    if (playing) {
      t += (now - last) / 1000;
      if (audio && !audio.paused && !audio.ended && Math.abs(audio.currentTime - t) > 0.08) t = audio.currentTime;
      if (t >= duration) {
        t = duration;
        playing = false;
        ended = true;
        audio?.pause();
        showOverlay();
        post({ type: "state", playing, ended, t });
      }
      seek(t);
      scrubber.value = String(t);
    }
    last = now;
    timeLabel.textContent = `${t.toFixed(1)}s / ${duration.toFixed(1)}s`;
    requestAnimationFrame(frame);
  };
  showOverlay();
  requestAnimationFrame(frame);
  post({ type: "ready", duration });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  window.__hpg = { ready: false, error: message };
  const box = document.createElement("pre");
  box.className = "error";
  box.textContent = message;
  document.body.appendChild(box);
  console.error(err);
});
