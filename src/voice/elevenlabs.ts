import type { Pace, Persona } from "../starter/spec/schema";
import { retry, wordsFromCharAlignment, type Clip, type TtsProvider, type VoiceChoice } from "./tts";

/**
 * ElevenLabs, used automatically when ELEVENLABS_API_KEY is set. The
 * with-timestamps endpoint returns a character alignment alongside the audio,
 * which becomes the subtitle word timing.
 *
 *   ELEVENLABS_VOICE_ID   force one voice for every persona (default: a premade voice per persona)
 *   ELEVENLABS_MODEL      model id (default eleven_multilingual_v2)
 */

/** Premade ElevenLabs voices that fit each persona. */
export const ELEVENLABS_VOICES: Record<Persona, string> = {
  narrator: "JBFqnCBsd6RMkjVDRZzb", // George
  buddy: "nPczCjzI2devNBz1zQrb", // Brian
  bright: "EXAVITQu4vr4xnSDxMaL", // Sarah
  cheerful: "pFZP5JQG7iQjIQuC4Bku", // Lily
  dry: "onwK4e9ZLuTAKqWW03F9", // Daniel
  posh: "XB0fDUlXrJqFi0bD4bX7", // Charlotte
  hype: "pNInz6obpgDQGcFmaJgB", // Adam
  storyteller: "21m00Tcm4TlvDq8ikWAM", // Rachel
};

const SPEEDS: Record<Pace, number> = { relaxed: 1.0, brisk: 1.08, fast: 1.16 };

export class ElevenLabsVoice implements TtsProvider {
  readonly name = "elevenlabs";
  private readonly forced: string | null;
  private readonly model: string;

  constructor(
    private readonly apiKey: string,
    forced = process.env.ELEVENLABS_VOICE_ID,
    model = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
  ) {
    this.forced = forced?.trim() || null;
    this.model = model;
  }

  voiceId(persona: Persona): string {
    return this.forced ?? ELEVENLABS_VOICES[persona];
  }

  describe(voice: VoiceChoice): string {
    return `${this.voiceId(voice.persona)} x${SPEEDS[voice.pace]}`;
  }

  synthesize(text: string, voice: VoiceChoice): Promise<Clip> {
    return retry(() => this.once(text, voice), 3, "elevenlabs tts");
  }

  private async once(text: string, voice: VoiceChoice): Promise<Clip> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId(voice.persona))}/with-timestamps?output_format=mp3_44100_128`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: this.model,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
          speed: SPEEDS[voice.pace],
        },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      const err = new Error(`ElevenLabs ${res.status}: ${detail}`);
      // Client errors other than rate limiting will not get better on retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
      throw err;
    }
    const body = (await res.json()) as {
      audio_base64: string;
      alignment: {
        characters: string[];
        character_start_times_seconds: number[];
        character_end_times_seconds: number[];
      } | null;
    };
    const a = body.alignment;
    return {
      audio: Buffer.from(body.audio_base64, "base64"),
      ext: "mp3",
      words: a
        ? wordsFromCharAlignment(a.characters, a.character_start_times_seconds, a.character_end_times_seconds)
        : null,
    };
  }
}
