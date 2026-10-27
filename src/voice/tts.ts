import { describeError } from "../shared/errors";
import type { Pace, Persona, Word } from "../starter/spec/schema";

/**
 * Text-to-speech providers. Claude writes the lines and picks a narrator
 * persona and pace for the take; one of these reads them. Every provider
 * returns raw audio plus, when it can, per-word timings so the subtitle
 * highlight follows the voice exactly.
 *
 * Selection (HPG_TTS, or automatic):
 *   elevenlabs  ELEVENLABS_API_KEY set: the smoothest voices, with timings
 *   edge        Microsoft Edge neural voices, free, no key, with timings
 *   sapi        Windows built-in voices, offline, no timings
 *   none        silent build; beats are timed from an estimated reading speed
 */

export interface Clip {
  audio: Buffer;
  ext: "mp3" | "wav";
  /** Word timings relative to the clip start, or null when the provider has none. */
  words: Word[] | null;
}

export interface VoiceChoice {
  persona: Persona;
  pace: Pace;
}

export const DEFAULT_VOICE: VoiceChoice = { persona: "narrator", pace: "brisk" };

/** What each persona sounds like, for the script writer. */
export const PERSONA_NOTES: Record<Persona, string> = {
  narrator: "warm, confident male documentary narrator (US)",
  buddy: "casual, sincere male voice, like a friend telling you a story (US)",
  bright: "bright, expressive female voice with real energy (US)",
  cheerful: "cheerful, clear, friendly female voice (US)",
  dry: "dry, deadpan male voice, British, perfect for understatement",
  posh: "warm, composed female voice, British",
  hype: "animated, punchy male voice, big delivery (US)",
  storyteller: "expressive female storyteller with range (US)",
};

export interface TtsProvider {
  readonly name: string;
  /** Human-readable description of what `voice` resolves to, for logs and the cache key. */
  describe(voice: VoiceChoice): string;
  /** Returns null when the provider produces no audio (silent builds). */
  synthesize(text: string, voice: VoiceChoice): Promise<Clip | null>;
}

export const PROVIDER_NAMES = ["elevenlabs", "edge", "sapi", "none"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export class SilentVoice implements TtsProvider {
  readonly name = "none";
  describe(): string {
    return "none";
  }
  async synthesize(): Promise<null> {
    return null;
  }
}

/** Pick a provider from HPG_TTS, or the best one the environment supports. */
export async function resolveProvider(name: string | undefined = process.env.HPG_TTS): Promise<TtsProvider> {
  const wanted = (name ?? "").trim().toLowerCase();
  if (wanted && !(PROVIDER_NAMES as readonly string[]).includes(wanted)) {
    throw new Error(`unknown HPG_TTS "${wanted}"; expected one of ${PROVIDER_NAMES.join(", ")}`);
  }
  const pick = (wanted || (process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "edge")) as ProviderName;
  switch (pick) {
    case "elevenlabs": {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) throw new Error("HPG_TTS=elevenlabs needs ELEVENLABS_API_KEY");
      const { ElevenLabsVoice } = await import("./elevenlabs");
      return new ElevenLabsVoice(key);
    }
    case "edge": {
      const { EdgeVoice } = await import("./edge");
      return new EdgeVoice();
    }
    case "sapi": {
      const { SapiVoice } = await import("./sapi");
      return new SapiVoice();
    }
    case "none":
      return new SilentVoice();
  }
}

let defaultProvider: Promise<TtsProvider> | null = null;

/** The provider this process narrates with, resolved from the environment once. */
export function getProvider(): Promise<TtsProvider> {
  defaultProvider ??= resolveProvider();
  return defaultProvider;
}

/** Retry a flaky network call a few times with a short back-off. */
export async function retry<T>(fn: () => Promise<T>, attempts: number, label: string): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if ((err as { fatal?: boolean }).fatal) break;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw new Error(`${label} failed: ${describeError(lastError)}`);
}

/**
 * Group a character-level alignment (ElevenLabs style: one entry per
 * character with start/end seconds) into words. Whitespace splits words;
 * punctuation stays attached to the word it follows.
 */
export function wordsFromCharAlignment(chars: string[], starts: number[], ends: number[]): Word[] {
  const words: Word[] = [];
  let text = "";
  let start = 0;
  let end = 0;
  const flush = () => {
    if (text) words.push({ text, start, end });
    text = "";
  };
  chars.forEach((c, i) => {
    if (/\s/.test(c)) {
      flush();
      return;
    }
    if (!text) start = starts[i] ?? end;
    text += c;
    end = ends[i] ?? end;
  });
  flush();
  return words;
}
