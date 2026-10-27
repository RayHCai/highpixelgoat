import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { describeError } from "../shared/errors";
import { relativeToRoot } from "../shared/paths";
import { runFfmpeg } from "../voice/mixdown";
import { SFX_DIR } from "../voice/sfx";

/**
 * Write a small starter set of sound effects into the sfx library,
 * synthesized by ffmpeg so there is nothing to download or license. Files
 * that already exist are kept; replace any of them with a real recording of
 * the same name whenever you have one.
 *
 *   npm run sfx              write the missing ones
 *   npm run sfx -- --force   rewrite all of them
 */

/** Each effect is one lavfi source and the filters that shape it. */
const STARTER: { name: string; source: string; filter?: string }[] = [
  {
    name: "controller-click",
    source: "anoisesrc=d=0.05:c=white:a=0.5:seed=3",
    filter: "highpass=f=2500,afade=t=out:st=0.004:d=0.04",
  },
  {
    name: "controller-clicks",
    source: "anoisesrc=d=1.4:c=white:a=0.45:seed=5",
    filter: "highpass=f=2200,volume='lt(mod(t,0.23),0.018)*(0.6+0.4*lt(mod(t,0.69),0.23))':eval=frame",
  },
  {
    name: "phone-buzz",
    source: "aevalsrc='0.35*sgn(sin(2*PI*165*t))*lt(mod(t,0.5),0.32)':d=0.9",
    filter: "lowpass=f=900,afade=t=out:st=0.8:d=0.1",
  },
  {
    name: "message-ping",
    source: "aevalsrc='0.4*sin(2*PI*1320*t)*exp(-7*t)+0.2*sin(2*PI*1980*t)*exp(-10*t)':d=0.7",
  },
  {
    name: "typing",
    source: "anoisesrc=d=1.6:c=white:a=0.4:seed=11",
    filter: "bandpass=f=3000:width_type=o:w=1.5,volume='lt(mod(t*7.3+0.4*sin(9*t),1),0.12)':eval=frame",
  },
  {
    name: "soft-thud",
    source: "aevalsrc='0.8*sin(2*PI*68*t)*exp(-13*t)+0.15*sin(2*PI*140*t)*exp(-25*t)':d=0.5",
  },
  {
    name: "whoosh",
    source: "anoisesrc=d=0.8:c=pink:a=0.5:seed=7",
    filter: "bandpass=f=900:width_type=o:w=2,afade=t=in:d=0.45,afade=t=out:st=0.45:d=0.35",
  },
  {
    name: "room-tone",
    source: "anoisesrc=d=10:c=brown:a=0.06:seed=13",
    filter: "lowpass=f=350,afade=t=in:d=1,afade=t=out:st=9:d=1",
  },
];

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  mkdirSync(SFX_DIR, { recursive: true });
  for (const fx of STARTER) {
    const out = path.join(SFX_DIR, `${fx.name}.wav`);
    if (existsSync(out) && !force) {
      console.log(`kept     ${relativeToRoot(out)}`);
      continue;
    }
    const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", fx.source];
    if (fx.filter) args.push("-af", fx.filter);
    await runFfmpeg([...args, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
    console.log(`wrote    ${relativeToRoot(out)}`);
  }
}

main().catch((err: unknown) => {
  console.error(describeError(err));
  process.exit(1);
});
