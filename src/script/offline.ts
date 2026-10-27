import { createHash } from "node:crypto";
import { TERRAINS } from "../starter/spec/schema";
import { EXAMPLE_IDS, EXAMPLES } from "./examples";
import type { EditResult, GeneratedSpec } from "./schema";

/**
 * Offline mode (HPG_OFFLINE=1): the bundled examples stand in for Claude, so
 * the dashboard, voicing, previews and export can be tried without it.
 */

/** One of the built-in scripts, chosen by the project id so repeated offline runs vary. */
export function offlineScript(projectId: string): GeneratedSpec {
  const n = createHash("sha1").update(projectId).digest().readUInt32BE(0) % EXAMPLE_IDS.length;
  return structuredClone(EXAMPLES[EXAMPLE_IDS[n]!]);
}

export function offlineEdit(script: GeneratedSpec, message: string, tracks: string[] = []): EditResult {
  // Two honest tricks so the loop can be seen working end to end: a request
  // that names a set switches to it, and one that names a track (or asks for
  // no music) changes the soundtrack.
  const lower = message.toLowerCase();
  const track = tracks.find((t) => lower.includes(t.toLowerCase()));
  if (track && track !== script.music) {
    return {
      reply: `Offline mode: switched the background track to ${track}.`,
      changed: true,
      script: { ...script, music: track },
    };
  }
  if (/\bno music\b|without music|remove the music/.test(lower) && script.music !== "none") {
    return {
      reply: "Offline mode: removed the background track.",
      changed: true,
      script: { ...script, music: "none" },
    };
  }
  const terrain = TERRAINS.find((t) => lower.includes(t) || lower.includes(t.replace("livingroom", "living room")));
  if (terrain && terrain !== script.terrain) {
    return {
      reply: `Offline mode: moved the scene to the ${terrain}. Unset HPG_OFFLINE to edit with Claude.`,
      changed: true,
      script: { ...script, terrain },
    };
  }
  return {
    reply:
      "Offline mode: Claude is not connected, so I cannot make that change. Unset HPG_OFFLINE and restart the dashboard.",
    changed: false,
    script,
  };
}
