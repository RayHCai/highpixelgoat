import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { Page } from "playwright";
import { z } from "zod";
import { seekAndWait } from "../render/capture";
import { describeError } from "../shared/errors";
import type { CoreSpec } from "../take/core";
import { readTakeSpec, voiceTake } from "../take/folder";
import { buildSite, type BuildReport } from "../take/site";
import { TAKE_SERVER } from "./guard";
import type { TakeSession } from "./session";

/**
 * The in-process MCP server with the three tools only this project has:
 * voice (record and time the narration), build (bundle the take's renderer)
 * and snapshot (look at real frames).
 */

const MAX_SNAPSHOTS = 6;
/** How many lines of build errors the model sees at once. */
const MAX_REPORTED_ERRORS = 40;

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

/** Run a tool body, turning a thrown error into an error result the model can read. */
async function result(body: () => Promise<string | Content[]>): Promise<{ content: Content[]; isError?: boolean }> {
  try {
    const out = await body();
    return { content: typeof out === "string" ? [{ type: "text", text: out }] : out };
  } catch (err) {
    return { content: [{ type: "text", text: describeError(err) }], isError: true };
  }
}

/** Index of the beat on screen at `t`. */
function beatAt(spec: CoreSpec, t: number): number {
  let i = 0;
  spec.beats.forEach((b, j) => {
    if ((b.at ?? 0) <= t) i = j;
  });
  return i;
}

function describeTimeline(spec: CoreSpec): string {
  const audio = spec.audio ? `audio ${spec.audio.src}${spec.audio.music ? ` with ${spec.audio.music}` : ""}` : "silent";
  const rows = spec.beats.map((b, i) => {
    const cue = b.musicCue ? `  music ${b.musicCue}` : "";
    const sfx = b.sfx?.length ? `  sfx ${b.sfx.map((s) => `${s.name}+${s.offset}s`).join(", ")}` : "";
    return `beat ${i}  at ${(b.at ?? 0).toFixed(2)}s  ${(b.narrationSeconds ?? 0).toFixed(2)}s spoken  "${b.narration}"${cue}${sfx}`;
  });
  return [`duration ${spec.format.duration}s, ${audio}`, ...rows].join("\n");
}

function describeBuild(report: BuildReport): string {
  const lines = [report.ok ? "player.js rebuilt." : "BUILD FAILED: player.js was not updated."];
  if (report.errors.length) lines.push("Errors:", ...report.errors.slice(0, MAX_REPORTED_ERRORS));
  if (report.typeErrors.length) {
    lines.push(`Type errors (${report.typeErrors.length}):`, ...report.typeErrors.slice(0, MAX_REPORTED_ERRORS));
  }
  if (report.ok && !report.typeErrors.length) lines.push("No type errors.");
  return lines.join("\n");
}

async function snapshots(session: TakeSession, times: number[]): Promise<Content[]> {
  const spec = readTakeSpec(session.dir);
  const errors: string[] = [];
  let page: Page;
  try {
    page = await session.openPlayer(spec, (m) => errors.push(m));
  } catch (err) {
    throw new Error(`the player did not start: ${describeError(err)}${errors.length ? `\n${errors.join("\n")}` : ""}`, {
      cause: err,
    });
  }
  try {
    const blocks: Content[] = [];
    for (const raw of times) {
      const t = Math.min(raw, spec.format.duration);
      await seekAndWait(page, t);
      const jpeg = await page.screenshot({ type: "jpeg", quality: 70, timeout: 120_000 });
      const b = beatAt(spec, t);
      blocks.push({ type: "text", text: `t = ${t.toFixed(2)}s, beat ${b} "${spec.beats[b]?.narration ?? ""}"` });
      blocks.push({ type: "image", data: jpeg.toString("base64"), mimeType: "image/jpeg" });
    }
    const header = errors.length
      ? `Page errors:\n${errors.slice(0, 20).join("\n")}`
      : `duration ${spec.format.duration}s, no page errors`;
    return [{ type: "text", text: header }, ...blocks];
  } finally {
    await page.close();
  }
}

/** The take server, bound to one take. */
export function takeServer(session: TakeSession): McpSdkServerConfigWithInstance {
  const voice = tool(
    "voice",
    "Record the narration of spec.json with its voice persona and pace, mix the background track from take.json (shaped by each beat's musicCue) and each beat's sfx, and write the timing back into spec.json: every beat's at, narrationSeconds and words, format.duration and audio. Call it after writing the script and whenever the narration, the beats, the voice, the music cues or the sound effects change. Returns the timeline.",
    {},
    () => result(async () => describeTimeline(await voiceTake(session.ctx))),
  );

  const build = tool(
    "build",
    "Type-check src/, check it for nondeterministic calls, and bundle it into player.js. Errors block the take; type errors usually mean a real bug, so fix them too. Call it after a round of edits and before snapshot.",
    {},
    () => result(async () => describeBuild(await buildSite(session.dir, { typecheck: true }))),
  );

  const snapshot = tool(
    "snapshot",
    `Render frames of the built take exactly as the exported video shows them (scene and text overlay, 1080x1920) and return them as images, with any page errors. Up to ${MAX_SNAPSHOTS} times per call, in seconds. Build first: this shows the last successful build.`,
    { times: z.array(z.number().min(0)).min(1).max(MAX_SNAPSHOTS).describe("Seconds into the video") },
    ({ times }) => result(() => snapshots(session, times)),
  );

  // alwaysLoad keeps the three tools in front of the model instead of behind tool search.
  return createSdkMcpServer({ name: TAKE_SERVER, version: "1.0.0", alwaysLoad: true, tools: [voice, build, snapshot] });
}
