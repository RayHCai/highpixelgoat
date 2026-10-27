import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Pace, Persona, Word } from "../starter/spec/schema";
import { retry, type Clip, type TtsProvider, type VoiceChoice } from "./tts";

/**
 * Microsoft Edge neural "read aloud" voices. Free and keyless, so it is the
 * default; the connection is occasionally dropped mid-stream, hence retries.
 * Each persona maps to a voice; the pace sets the speaking rate. Set
 * HPG_EDGE_VOICE to force one voice for every persona.
 */

export const EDGE_VOICES: Record<Persona, string> = {
  narrator: "en-US-AndrewMultilingualNeural",
  buddy: "en-US-BrianMultilingualNeural",
  bright: "en-US-AvaMultilingualNeural",
  cheerful: "en-US-EmmaMultilingualNeural",
  dry: "en-GB-RyanNeural",
  posh: "en-GB-SoniaNeural",
  hype: "en-US-GuyNeural",
  storyteller: "en-US-AriaNeural",
};

/** Speaking-rate offsets. Edge voices read a touch slowly at their default. */
export const EDGE_RATES: Record<Pace, string> = { relaxed: "+4%", brisk: "+12%", fast: "+20%" };

export class EdgeVoice implements TtsProvider {
  readonly name = "edge";
  private readonly forced: string | null;

  constructor(forced = process.env.HPG_EDGE_VOICE) {
    this.forced = forced?.trim() || null;
  }

  voiceName(persona: Persona): string {
    return this.forced ?? EDGE_VOICES[persona];
  }

  describe(voice: VoiceChoice): string {
    return `${this.voiceName(voice.persona)} ${EDGE_RATES[voice.pace]}`;
  }

  synthesize(text: string, voice: VoiceChoice): Promise<Clip> {
    return retry(() => this.once(text, voice), 3, "edge tts");
  }

  private async once(text: string, voice: VoiceChoice): Promise<Clip> {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(this.voiceName(voice.persona), OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
        wordBoundaryEnabled: true,
      });
      const { audioStream, metadataStream } = tts.toStream(text, { rate: EDGE_RATES[voice.pace] });
      const chunks: Buffer[] = [];
      const metas: string[] = [];
      audioStream.on("data", (c: Buffer) => chunks.push(c));
      metadataStream?.on("data", (m: Buffer | string) => metas.push(String(m)));
      await new Promise<void>((resolve, reject) => {
        audioStream.on("end", () => resolve());
        audioStream.on("error", reject);
      });
      const audio = Buffer.concat(chunks);
      if (audio.length < 500) throw new Error("empty audio stream");
      return { audio, ext: "mp3", words: parseEdgeWords(metas) };
    } finally {
      tts.close();
    }
  }
}

interface EdgeMetadata {
  Metadata?: { Type?: string; Data?: { Offset?: number; Duration?: number; text?: { Text?: string } } }[];
}

/** Edge reports word boundaries as 100ns ticks from the start of the clip. */
export function parseEdgeWords(metas: string[]): Word[] | null {
  const words: Word[] = [];
  for (const raw of metas) {
    let parsed: EdgeMetadata;
    try {
      parsed = JSON.parse(raw) as EdgeMetadata;
    } catch {
      continue;
    }
    for (const m of parsed.Metadata ?? []) {
      const d = m.Data;
      if (m.Type !== "WordBoundary" || !d || typeof d.Offset !== "number" || !d.text?.Text) continue;
      const start = d.Offset / 1e7;
      words.push({ text: d.text.Text, start, end: start + (d.Duration ?? 0) / 1e7 });
    }
  }
  return words.length ? words : null;
}
