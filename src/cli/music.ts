import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describeError } from "../shared/errors";
import { relativeToRoot } from "../shared/paths";
import { runProcess } from "../shared/process";
import { COMPOSITIONS } from "../voice/compose";
import { runFfmpeg } from "../voice/mixdown";
import { listMusic, MUSIC_DIR } from "../voice/music";
import { STAND_INS } from "../voice/standins";
import { encodeWav } from "../voice/synth";

/**
 * Write the original trend-style loops (src/voice/compose.ts) and the
 * stand-ins for licensed trending sounds (src/voice/standins.ts) into the
 * music library as mp3s at -16 LUFS, like the other tracks. Every file it
 * writes is tagged, and it never replaces a file it did not write: a real
 * recording you put in place of a stand-in, under the same name, stays.
 *
 *   npm run music              write the missing ones
 *   npm run music -- --force   rewrite the ones this command wrote
 */

const TAG = "written by highpixelgoat npm run music";

/** True when ffprobe finds this command's tag on the file. */
async function writtenHere(file: string): Promise<boolean> {
  const probe = await runProcess("ffprobe", [
    ...["-v", "error", "-show_entries", "format_tags=comment", "-of", "csv=p=0", file],
  ]);
  return probe.code === 0 && probe.stdout.includes(TAG);
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  mkdirSync(MUSIC_DIR, { recursive: true });
  const scratch = mkdtempSync(path.join(tmpdir(), "hpg-music-"));
  try {
    for (const c of [...COMPOSITIONS, ...STAND_INS]) {
      const existing = listMusic(MUSIC_DIR).filter((t) => t.name === c.name);
      const out = path.join(MUSIC_DIR, `${c.name}.mp3`);
      if (existing.length && !force) {
        console.log(`kept     ${relativeToRoot(existing[0]!.file)}`);
        continue;
      }
      const theirs = [];
      for (const t of existing) if (!(await writtenHere(t.file))) theirs.push(t);
      if (theirs.length) {
        console.log(`kept     ${relativeToRoot(theirs[0]!.file)} (not written here, so left alone)`);
        continue;
      }
      const wav = path.join(scratch, `${c.name}.wav`);
      writeFileSync(wav, encodeWav(c.render()));
      await runFfmpeg([
        ...["-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-metadata", `comment=${TAG}`],
        ...["-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "2", out],
      ]);
      console.log(`wrote    ${relativeToRoot(out)}${c.standsFor ? `  (stand-in for ${c.standsFor})` : ""}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(describeError(err));
  process.exit(1);
});
