import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Beat, ScenarioSpec } from "../starter/spec/schema";
import { fitNarration, type NarratedSpec } from "../starter/spec/timing";
import {
  audioSeconds,
  hasMp3Encoder,
  mixdownArgs,
  mixSoundtrackArgs,
  runFfmpeg,
  type Placement,
} from "../voice/mixdown";
import { musicEnvelope, musicVolume, soloMusicVolume, type MusicCue, type Track } from "../voice/music";
import { placeSfx, type SfxCue } from "../voice/sfx";
import type { TtsProvider, VoiceChoice } from "../voice/tts";
import { readJson, writeJson } from "../shared/json";

/**
 * Record every narration line, measure it, lay the beats out to the measured
 * lengths, mix one narration track, then lay the background music under it
 * (shaped by the beats' music cues) and the sound effects over it.
 * Clips are cached by provider, voice and text, so a chat edit only
 * re-records the lines that changed. The page and the video both play the
 * final track, so what you preview is what you export.
 */

interface ClipMeta {
  seconds: number;
  words: Beat["words"] | null;
  ext: string;
}

const CONCURRENCY = 3;

function clipKey(provider: TtsProvider, voice: VoiceChoice, text: string): string {
  return createHash("sha1")
    .update(`${provider.name}|${provider.describe(voice)}|${text}`)
    .digest("hex")
    .slice(0, 16);
}

async function recordLine(
  provider: TtsProvider,
  voice: VoiceChoice,
  text: string,
  clipsDir: string,
): Promise<{ file: string; meta: ClipMeta } | null> {
  const key = clipKey(provider, voice, text);
  const metaFile = path.join(clipsDir, `${key}.json`);
  const cached = readJson<ClipMeta>(metaFile);
  if (cached && existsSync(path.join(clipsDir, `${key}.${cached.ext}`))) {
    return { file: path.join(clipsDir, `${key}.${cached.ext}`), meta: cached };
  }
  const clip = await provider.synthesize(text, voice);
  if (!clip) return null;
  const file = path.join(clipsDir, `${key}.${clip.ext}`);
  writeFileSync(file, clip.audio);
  const meta: ClipMeta = { seconds: await audioSeconds(file), words: clip.words, ext: clip.ext };
  writeJson(metaFile, meta);
  return { file, meta };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** What narrate reads and writes; any take's spec has at least this. */
export interface VoicedSpec extends NarratedSpec {
  voice: VoiceChoice;
  beats: (NarratedSpec["beats"][number] & { words?: Beat["words"]; musicCue?: MusicCue; sfx?: SfxCue[] })[];
  audio?: ScenarioSpec["audio"];
}

export async function narrate<S extends VoicedSpec>(
  spec: S,
  dir: string,
  provider: TtsProvider,
  music: Track | null = null,
  effects: Track[] = [],
): Promise<S> {
  // Unknown effect names fail before anything is recorded.
  placeSfx(spec.beats, Infinity, effects);
  const audioDir = path.join(dir, "audio");
  const clipsDir = path.join(audioDir, "clips");
  mkdirSync(clipsDir, { recursive: true });
  const voice = spec.voice;

  const recorded = await mapLimit(spec.beats, CONCURRENCY, (b) =>
    b.narration.trim() ? recordLine(provider, voice, b.narration.trim(), clipsDir) : Promise.resolve(null),
  );

  const beats = spec.beats.map((b, i) => {
    const r = recorded[i];
    const { narrationSeconds: _s, words: _w, ...rest } = b;
    if (!r) return rest;
    return { ...rest, narrationSeconds: r.meta.seconds, ...(r.meta.words ? { words: r.meta.words } : {}) };
  });
  const { audio: _audio, ...silent } = spec;
  // The spec comes back as it went in, with the beats timed and the audio replaced.
  const timed = fitNarration({ ...silent, beats }) as unknown as S;

  const placements: Placement[] = [];
  timed.beats.forEach((b, i) => {
    const r = recorded[i];
    if (r) placements.push({ file: r.file, at: b.at ?? 0 });
  });
  const duration = timed.format.duration;
  const sfx = placeSfx(timed.beats, duration, effects);
  if (placements.length === 0 && !music && sfx.length === 0) return timed;

  const mp3 = await hasMp3Encoder();
  const codec = mp3 ? "libmp3lame" : "aac";
  const ext = mp3 ? "mp3" : "m4a";
  const narration = `narration.${ext}`;
  await runFfmpeg(mixdownArgs(placements, duration, path.join(audioDir, narration), codec));
  const base = { provider: provider.name, voice: provider.describe(voice), narrationSrc: `audio/${narration}` };
  if (!music && sfx.length === 0) return { ...timed, audio: { ...base, src: `audio/${narration}`, music: null } };

  const track = `track.${ext}`;
  const bed = music && {
    file: music.file,
    // With nobody speaking, the music carries the video.
    volume: placements.length ? musicVolume() : soloMusicVolume(),
    envelope: musicEnvelope(timed.beats),
  };
  await runFfmpeg(
    mixSoundtrackArgs(path.join(audioDir, narration), bed, sfx, duration, path.join(audioDir, track), codec),
  );
  return { ...timed, audio: { ...base, src: `audio/${track}`, music: music?.name ?? null } };
}
