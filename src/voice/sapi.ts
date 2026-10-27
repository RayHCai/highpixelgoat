import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runChecked } from "../shared/process";
import type { Clip, TtsProvider, VoiceChoice } from "./tts";

/**
 * Windows built-in speech (System.Speech via PowerShell). Works offline on
 * any Windows machine; the voices are clearly synthetic, so this is the
 * fallback, not the default. HPG_SAPI_VOICE selects an installed voice; the
 * persona is ignored, the pace sets the rate.
 */
export class SapiVoice implements TtsProvider {
  readonly name = "sapi";
  readonly voice: string;

  constructor(voice = process.env.HPG_SAPI_VOICE ?? "default") {
    this.voice = voice;
  }

  describe(voice: VoiceChoice): string {
    return `${this.voice} ${voice.pace}`;
  }

  async synthesize(text: string, voice: VoiceChoice): Promise<Clip> {
    const dir = mkdtempSync(path.join(tmpdir(), "hpg-sapi-"));
    const textFile = path.join(dir, "line.txt");
    const wavFile = path.join(dir, "line.wav");
    writeFileSync(textFile, text, "utf8");
    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      'if ($env:HPG_SAPI_VOICE -and $env:HPG_SAPI_VOICE -ne "default") { $s.SelectVoice($env:HPG_SAPI_VOICE) }',
      `$s.Rate = ${{ relaxed: 0, brisk: 1, fast: 2 }[voice.pace]}`,
      "$s.SetOutputToWaveFile($env:HPG_SAPI_OUT)",
      "$s.Speak([IO.File]::ReadAllText($env:HPG_SAPI_TEXT))",
      "$s.Dispose()",
    ].join("; ");
    try {
      await runChecked("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
        env: { ...process.env, HPG_SAPI_OUT: wavFile, HPG_SAPI_TEXT: textFile, HPG_SAPI_VOICE: this.voice },
      });
      return { audio: readFileSync(wavFile), ext: "wav", words: null };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
