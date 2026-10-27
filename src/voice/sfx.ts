import path from "node:path";
import { DEFAULT_SFX_DIR } from "../shared/paths";
import { findTrack, listAudio, type Track } from "./music";

/**
 * The local sound-effect library: drop short audio files into sfx/ (or the
 * folder HPG_SFX_DIR points at) and beats can place them by name at an
 * offset. `npm run sfx` writes a small synthesized starter set. Effects sit
 * on top of the mix: the voice does not duck them and music cues do not
 * touch them.
 *
 *   HPG_SFX_DIR   folder of effects, default <project>/sfx
 */

export const SFX_DIR = process.env.HPG_SFX_DIR ? path.resolve(process.env.HPG_SFX_DIR) : DEFAULT_SFX_DIR;

export function listSfx(dir = SFX_DIR): Track[] {
  return listAudio(dir);
}

/** One effect placed on a beat, as written in spec.json. */
export interface SfxCue {
  name: string;
  /** Seconds after the beat starts. */
  offset: number;
  /** 0 to 1. */
  volume: number;
}

/** An effect resolved to a file and a time in the video. */
export interface SfxPlacement {
  file: string;
  /** Seconds from the start of the video. */
  at: number;
  volume: number;
}

/**
 * Every beat's effects as files at video times, dropping any that start past
 * the end. Unknown names are an error naming what is available, so the agent
 * can fix the spec instead of shipping a silent cue.
 */
export function placeSfx(
  beats: { at?: number; sfx?: SfxCue[] }[],
  duration: number,
  library: Track[] = listSfx(),
): SfxPlacement[] {
  const placements: SfxPlacement[] = [];
  const unknown = new Set<string>();
  for (const b of beats) {
    for (const cue of b.sfx ?? []) {
      const track = findTrack(cue.name, library);
      if (!track) {
        unknown.add(cue.name);
        continue;
      }
      const at = (b.at ?? 0) + cue.offset;
      if (at < duration) placements.push({ file: track.file, at, volume: cue.volume });
    }
  }
  if (unknown.size) {
    const have = library.length ? library.map((t) => t.name).join(", ") : "none (the library is empty)";
    throw new Error(`Unknown sound effects: ${[...unknown].join(", ")}. Available: ${have}.`);
  }
  return placements;
}

/** The SOUND EFFECTS section of the system prompt for the current library. */
export function sfxPrompt(effects: Track[]): string {
  if (effects.length === 0) {
    return "SOUND EFFECTS\nNo sound effects are available right now. Leave sfx out of every beat.";
  }
  return [
    "SOUND EFFECTS",
    'Place effects on a beat in spec.json as sfx: [{"name": "<exact name>", "offset": <seconds after the beat starts>, "volume": <0 to 1, default 0.8>}]. They play on top of the narration and the music. Use them the way a careful editor would: a few diegetic sounds that match what is on screen at that moment (a controller click as a thumb presses, a phone buzz as the screen lights), not one on every beat. Available:',
    effects.map((t) => `- ${t.name}`).join("\n"),
  ].join("\n");
}
