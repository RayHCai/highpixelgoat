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
  // Blocky-game sounds: original chip-style blips, not anyone's recorded effects.
  {
    name: "block-jump",
    source: "aevalsrc='0.45*sin(2*PI*(280*t+1090*t*t))*exp(-6*t)':d=0.25",
    filter: "lowpass=f=3000,afade=t=out:st=0.2:d=0.05",
  },
  {
    name: "coin-collect",
    source: "aevalsrc='0.3*sgn(sin(2*PI*if(lt(t,0.07),988,1319)*t))*exp(-5*t)':d=0.45",
    filter: "lowpass=f=4500",
  },
  {
    name: "block-hurt-bonk",
    source: "aevalsrc='0.35*sgn(sin(2*PI*(520*t-600*t*t)))*exp(-7*t)':d=0.35",
    filter: "lowpass=f=2200",
  },
  {
    name: "level-up",
    source:
      "aevalsrc='0.25*sgn(sin(2*PI*if(lt(t,0.12),523.25,if(lt(t,0.24),659.25,if(lt(t,0.36),783.99,1046.5)))*t))*exp(-2.5*max(0,t-0.36))':d=0.9",
    filter: "lowpass=f=5000,afade=t=out:st=0.75:d=0.15",
  },
  {
    name: "pop",
    source: "aevalsrc='0.6*sin(2*PI*(900*t-2500*t*t))*exp(-40*t)':d=0.12",
  },
  // Meme punctuation: a deep boom for the reveal.
  {
    name: "bass-boom",
    source: "aevalsrc='0.9*sin(2*PI*(62*t-6*t*t))*exp(-1.8*t)':d=2.2",
    filter: "lowpass=f=400,afade=t=out:st=1.9:d=0.3",
  },
  // Dreamcore and backrooms.
  {
    name: "dream-chime",
    source:
      "aevalsrc='0.3*sin(2*PI*1318.5*t)*exp(-1.6*t)+0.2*sin(2*PI*1975.5*t)*exp(-2.2*t)+0.12*sin(2*PI*2637*t)*exp(-3*t)+0.1*sin(2*PI*1320.8*t)*exp(-1.5*t)':d=3",
    filter: "aecho=0.8:0.7:180|370:0.4|0.25,afade=t=out:st=2.6:d=0.4",
  },
  {
    name: "fluorescent-flicker",
    source:
      "aevalsrc='0.5*(sin(2*PI*120*t)+0.5*sin(2*PI*240*t)+0.25*sin(2*PI*360*t))*(0.3+0.7*gt(sin(2*PI*7*t+3*sin(2*PI*1.3*t)),-0.2))':d=2.4",
    filter: "highpass=f=90,afade=t=in:d=0.02,afade=t=out:st=2.2:d=0.2",
  },
  {
    name: "vhs-glitch",
    source: "anoisesrc=d=0.7:c=white:a=0.6:seed=17",
    filter:
      "bandpass=f=2400:width_type=o:w=3,volume='0.9*lt(mod(t,0.09),0.05)*(1-t/0.7)':eval=frame,acrusher=bits=6:mode=log:mix=1",
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
