import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { DEFAULT_MUSIC_DIR } from "../shared/paths";

/**
 * The local music library: drop audio files into music/ (or the folder
 * HPG_MUSIC_DIR points at) and every take gets one mixed quietly under the
 * narration, ducked while the narrator speaks. Claude sees the file names and
 * picks the one that fits the vibe; a take whose choice does not match any
 * file gets a seeded pick, so the three takes still differ. Beats can cue the
 * track (low, cut, swell, play), which shapes its level over the video.
 *
 *   HPG_MUSIC_DIR           folder of tracks, default <project>/music
 *   HPG_MUSIC_VOLUME        music level under the voice, 0 to 1, default 0.22
 *   HPG_MUSIC_SOLO_VOLUME   music level when a take has no narration, 0 to 1, default 0.6
 */

export const MUSIC_DIR = process.env.HPG_MUSIC_DIR ? path.resolve(process.env.HPG_MUSIC_DIR) : DEFAULT_MUSIC_DIR;
const DEFAULT_VOLUME = 0.22;
const DEFAULT_SOLO_VOLUME = 0.6;
const EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"]);

export interface Track {
  /** File name without its extension; what Claude sees and what the dashboard shows. */
  name: string;
  file: string;
}

/** Every audio file directly in `dir`, named by its stem, sorted by name. */
export function listAudio(dir: string): Track[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => ({ name: path.basename(e.name, path.extname(e.name)), file: path.join(dir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listMusic(dir = MUSIC_DIR): Track[] {
  return listAudio(dir);
}

/** The track whose name or file name is `wanted`, ignoring case, or null. */
export function findTrack(wanted: string, tracks: Track[]): Track | null {
  const w = wanted.trim().toLowerCase();
  return tracks.find((t) => t.name.toLowerCase() === w || path.basename(t.file).toLowerCase() === w) ?? null;
}

function envLevel(name: string, fallback: number): number {
  const v = Number(process.env[name] ?? fallback);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/** The level music plays at under the voice before ducking, 0 to 1. */
export function musicVolume(): number {
  return envLevel("HPG_MUSIC_VOLUME", DEFAULT_VOLUME);
}

/** The level music plays at in a take with no narration, where it carries the video alone. */
export function soloMusicVolume(): number {
  return envLevel("HPG_MUSIC_SOLO_VOLUME", DEFAULT_SOLO_VOLUME);
}

/**
 * Turn the choice written in the script into a track: an exact name wins
 * (case and extension do not matter), "none" means no music, anything else
 * gets a deterministic pick: the project hashes to a starting point and each
 * take steps along the library, so three takes get three different tracks
 * whenever there are three to choose from.
 */
export function resolveMusic(
  wanted: string,
  seed: { project: string; take: number },
  tracks: Track[] = listMusic(),
): Track | null {
  if (tracks.length === 0) return null;
  if (wanted.trim().toLowerCase() === "none") return null;
  const match = findTrack(wanted, tracks);
  if (match) return match;
  const start = createHash("sha1").update(seed.project).digest().readUInt32BE(0) % tracks.length;
  return tracks[(start + seed.take) % tracks.length]!;
}

/** What a beat's musicCue does to the track from the start of that beat until the next cue. */
export const MUSIC_CUES = ["play", "low", "cut", "swell"] as const;
export type MusicCue = (typeof MUSIC_CUES)[number];

/** Gain of each cue relative to the take's music level. */
const CUE_GAIN: Record<MusicCue, number> = { play: 1, low: 0.35, cut: 0, swell: 1.4 };
/** Seconds a level change takes: a cut in or out is an edit, everything else a ride of the fader. */
const RAMP_SECONDS = 0.6;
const CUT_SECONDS = 0.02;

/** One point of the music's gain over time; the gain is linear between points and holds after the last. */
export interface GainPoint {
  t: number;
  gain: number;
}

/**
 * The music's gain over the video from each beat's cue. A beat without a cue
 * keeps the one before it; the video starts on "play" unless the first beat
 * says otherwise. Cuts into and out of silence are near-instant, the rest
 * ramp over RAMP_SECONDS from the start of the beat.
 */
export function musicEnvelope(beats: { at?: number; musicCue?: MusicCue }[]): GainPoint[] {
  let cue: MusicCue = beats[0]?.musicCue ?? "play";
  const points: GainPoint[] = [{ t: 0, gain: CUE_GAIN[cue] }];
  for (const b of beats.slice(1)) {
    if (!b.musicCue || b.musicCue === cue) continue;
    const at = Math.max(b.at ?? 0, points[points.length - 1]!.t);
    const ramp = cue === "cut" || b.musicCue === "cut" ? CUT_SECONDS : RAMP_SECONDS;
    points.push({ t: at, gain: CUE_GAIN[cue] }, { t: at + ramp, gain: CUE_GAIN[b.musicCue] });
    cue = b.musicCue;
  }
  return points;
}

/** The MUSIC section of the system prompt for the current library. */
export function musicPrompt(tracks: Track[]): string {
  if (tracks.length === 0) {
    return 'MUSIC\nNo background tracks are available right now. Set "music" to an empty string.';
  }
  return [
    "MUSIC",
    'A background track is mixed quietly under the narration and ducked while the narrator speaks (in a take with no narration it plays louder and carries the video). Pick the one whose name best fits the vibe of this take from this list and put its exact name in "music":',
    tracks.map((t) => `- ${t.name}`).join("\n"),
    'Use "none" only if the author asks for no music.',
    'Cue the track per beat with musicCue in spec.json: "low" sinks it under the moment (an end card, a quiet line), "cut" drops it to silence on the cut (a punchline, a realisation, a held breath), "swell" lifts it a little above normal (the payoff), "play" brings it back to normal. A cue holds until a later beat sets another; cuts in and out of silence are instant, the rest ramp over about half a second. Leave it out where nothing changes, and use cuts sparingly so each one lands.',
  ].join("\n");
}
