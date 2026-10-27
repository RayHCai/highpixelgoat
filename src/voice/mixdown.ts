import { runChecked, runProcess } from "../shared/process";
import type { GainPoint } from "./music";
import type { SfxPlacement } from "./sfx";

/**
 * Mix per-beat narration clips into one track at their beat times, padded to
 * the video length. The player and the video exporter both use this single
 * file, so playback and export are in sync by construction.
 */

export interface Placement {
  file: string;
  /** Seconds from the start of the video. */
  at: number;
}

export type AudioCodec = "libmp3lame" | "aac";

const QUIET = ["-y", "-hide_banner", "-loglevel", "error"];

/** Mono 44.1 kHz output of `seconds` in `codec`, written to `out`. */
function encodeArgs(seconds: number, codec: AudioCodec, out: string): string[] {
  const quality = codec === "libmp3lame" ? ["-q:a", "2"] : ["-b:a", "160k"];
  return ["-t", seconds.toFixed(3), "-ar", "44100", "-ac", "1", "-c:a", codec, ...quality, out];
}

export function mixdownArgs(placements: Placement[], duration: number, out: string, codec: AudioCodec): string[] {
  const args = [...QUIET];
  if (placements.length === 0) {
    args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono");
  } else {
    for (const p of placements) args.push("-i", p.file);
    const delayed = placements.map((p, i) => `[${i}]adelay=${Math.max(0, Math.round(p.at * 1000))}:all=1[a${i}]`);
    const inputs = placements.map((_, i) => `[a${i}]`).join("");
    const mix = `${inputs}amix=inputs=${placements.length}:normalize=0:dropout_transition=0,apad[out]`;
    args.push("-filter_complex", [...delayed, mix].join(";"), "-map", "[out]");
  }
  return [...args, ...encodeArgs(duration, codec, out)];
}

/**
 * An ffmpeg expression in `t` for a gain that is linear between the points
 * and holds after the last one.
 */
export function gainExpr(points: GainPoint[]): string {
  const n = (x: number) => x.toFixed(3);
  if (points.length === 0) return "1";
  const at = (i: number): string => {
    const a = points[i]!;
    const b = points[i + 1];
    if (!b) return n(a.gain);
    const segment = a.gain === b.gain ? n(a.gain) : `${n(a.gain)}+${n(b.gain - a.gain)}*(t-${n(a.t)})/${n(b.t - a.t)}`;
    return `if(lt(t,${n(b.t)}),${segment},${at(i + 1)})`;
  };
  return at(0);
}

export interface SoundtrackMusic {
  file: string;
  /** Base level, 0 to 1. */
  volume: number;
  /** Gain over time on top of the level (from the beats' music cues). */
  envelope: GainPoint[];
}

const MONO = "aformat=sample_rates=44100:channel_layouts=mono";

/**
 * The finished soundtrack from a narration track, an optional music track
 * and any sound effects. The music loops to fill the video, follows its
 * envelope, fades in and out, and is compressed by the voice itself
 * (sidechain ducking) so every spoken word stays on top. The effects land at
 * their times on top of both.
 */
export function mixSoundtrackArgs(
  voice: string,
  music: SoundtrackMusic | null,
  effects: SfxPlacement[],
  duration: number,
  out: string,
  codec: AudioCodec,
): string[] {
  const dur = Math.max(1, duration);
  const inputs = ["-i", voice];
  const graph: string[] = [];
  const mixed: string[] = ["[v]"];
  if (music) {
    const fadeOut = Math.min(1.5, dur / 2);
    const level = Math.min(1, Math.max(0, music.volume)).toFixed(3);
    inputs.push("-stream_loop", "-1", "-i", music.file);
    graph.push(
      // asetpts restarts the clock at 0 and keeps it running across loops, so the envelope is in video time.
      `[1:a]${MONO},asetpts=N/SR/TB,volume=${level},volume='${gainExpr(music.envelope)}':eval=frame,afade=t=in:st=0:d=0.8,afade=t=out:st=${(dur - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}[m]`,
      `[0:a]${MONO},asplit[v][key]`,
      "[m][key]sidechaincompress=threshold=0.025:ratio=6:attack=30:release=600:makeup=1[ducked]",
    );
    mixed.push("[ducked]");
  } else {
    graph.push(`[0:a]${MONO}[v]`);
  }
  const first = music ? 2 : 1;
  effects.forEach((e, i) => {
    inputs.push("-i", e.file);
    const volume = Math.min(1, Math.max(0, e.volume)).toFixed(3);
    graph.push(`[${first + i}:a]${MONO},volume=${volume},adelay=${Math.max(0, Math.round(e.at * 1000))}:all=1[s${i}]`);
    mixed.push(`[s${i}]`);
  });
  graph.push(`${mixed.join("")}amix=inputs=${mixed.length}:normalize=0:dropout_transition=0[out]`);
  return [...QUIET, ...inputs, "-filter_complex", graph.join(";"), "-map", "[out]", ...encodeArgs(dur, codec, out)];
}

let mp3Encoder: Promise<boolean> | null = null;

/** Does this ffmpeg build carry an mp3 encoder? (aac is always available.) */
export function hasMp3Encoder(): Promise<boolean> {
  mp3Encoder ??= runProcess("ffmpeg", ["-hide_banner", "-encoders"]).then(
    ({ stdout }) => /libmp3lame/.test(stdout),
    () => false,
  );
  return mp3Encoder;
}

export async function runFfmpeg(args: string[]): Promise<void> {
  await runChecked("ffmpeg", args);
}

/** Seconds of audio in a file, via ffprobe. */
export async function audioSeconds(file: string): Promise<number> {
  const { code, stdout } = await runProcess("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  const seconds = Number(stdout.trim());
  if (code !== 0 || !Number.isFinite(seconds)) throw new Error(`ffprobe could not read ${file}`);
  return seconds;
}
