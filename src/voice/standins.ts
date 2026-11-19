import { makeRng } from "../starter/scene/noise";
import { chord, type Composition } from "./compose";
import {
  biquad,
  circular,
  clap,
  decay,
  electricPiano,
  hat,
  kick,
  midi,
  noiseLoop,
  normalise,
  note,
  pad,
  reverb,
  SAMPLE_RATE,
  Stereo,
  subBass,
  tone,
  wobble,
} from "./synth";

/**
 * Stand-ins for licensed trending sounds, so a take can be cut and previewed
 * locally against something with the right tempo, key, groove and shape
 * before the official audio is added in Instagram or TikTok at posting time.
 * Each is original: the arrangement and feel of the sound are matched, never
 * its melody, lyrics or recording.
 *
 * To hear the real recording locally, replace the stand-in in music/ with a
 * copy you have the right to use, under the same name (any audio format;
 * delete the stand-in's .mp3 if yours has another extension). `npm run
 * music` never overwrites a file it did not write.
 */

const MIN9 = [0, 3, 7, 10, 14];
const MAJ7 = [0, 4, 7, 11];

/**
 * For Finneas's cover of "My Moon My Man", the soft-launch sound: hypnotic
 * indie pop at 125 bpm in E minor, a pulsing pumped pad, muted guitar-like
 * plucks and a steady four-on-the-floor that only arrives after a sparse
 * four-bar intro, so the reveal lands on the beat coming in.
 */
function softLaunchPulse(): Stereo {
  const bpm = 125;
  const beat = 60 / bpm;
  const step = beat / 4;
  const bar = beat * 4;
  const bars = 16;
  const mix = new Stereo(bar * bars);
  const prog = [
    chord("E3", [0, 7, 12, 15]),
    chord("C3", [0, 7, 11, 16]),
    chord("G3", [0, 4, 7, 14]),
    chord("D3", [0, 7, 12, 16]),
  ];
  const pluckSteps = [0, 3, 6, 8, 11, 14];
  const rng = makeRng(125);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const c = prog[b % 4]!;
    const drums = b >= 4;
    // A pad pumping on every eighth: the hypnotic pulse.
    for (let e = 0; e < 8; e++) {
      for (const n of c.slice(1)) {
        const swell = pad(midi(n + 12), step * 1.6, 1500);
        mix.add(swell, t0 + e * step * 2, 0.035, 0);
      }
    }
    // Muted plucks on a syncopated sixteenth pattern.
    pluckSteps.forEach((s, i) => {
      const n = c[(i % 3) + 1]! + 12;
      const p = biquad(
        tone(midi(n), 0.07, { wave: "saw", attack: 0.002, decay: 0.05, sustain: 0.1, release: 0.05 }),
        "lowpass",
        1900,
      );
      mix.add(p, t0 + s * step, 0.13, i % 2 ? 0.35 : -0.35);
    });
    // Bass on the eighths once the beat is in, ducked on the kick like a sidechain.
    if (drums) {
      for (let e = 0; e < 8; e++) {
        const off = e % 2 === 1;
        const bass = tone(midi(c[0]! - 12), step * 1.7, { wave: "saw", decay: 0.08, sustain: 0.6, release: 0.04 });
        mix.add(biquad(bass, "lowpass", 600), t0 + e * step * 2, off ? 0.3 : 0.15);
      }
      for (let q = 0; q < 4; q++) {
        mix.add(kick(0.7, 0.35), t0 + q * beat, 0.6);
        if (q % 2) mix.add(clap(b * 4 + q), t0 + q * beat, 0.22, 0.05);
      }
      for (let s = 0; s < 16; s++) mix.add(hat(b * 16 + s), t0 + s * step, (s % 2 ? 0.07 : 0.04) + rng() * 0.02, 0.3);
    }
  }
  reverb(mix, { room: 0.6, damp: 0.5, wet: 0.2 });
  normalise(mix);
  return mix;
}

/**
 * For "Montagem da Chupeta" by Lthiago, the top worldwide sound: a Brazilian
 * funk montagem at 130 bpm, a tamborzao pattern of kick and pitched toms,
 * a hard-driven sliding 808, a squeaky square stab riff and a formant
 * "hey" chop on the bar, built hotter and busier than the phonk loop.
 */
function montagemFunk(): Stereo {
  const bpm = 130;
  const step = 60 / bpm / 4;
  const bar = step * 16;
  const bars = 16;
  const mix = new Stereo(bar * bars);
  const roots = ["A1", "A1", "F1", "G1"];
  const tom = (freq: number) => {
    const t = tone(freq, 0.12, {
      wave: "sine",
      attack: 0.001,
      decay: 0.1,
      sustain: 0.3,
      slide: { from: 1.6, time: 0.05 },
    });
    return decay(t, 0.08);
  };
  const rng = makeRng(131);
  const lead = new Stereo(mix.seconds);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const root = note(roots[b % 4]!);
    for (const s of [0, 7, 10]) mix.add(kick(1.2, 0.36), t0 + s * step, 0.72);
    [3, 6, 11, 14].forEach((s, i) => mix.add(tom(i % 2 ? 150 : 110), t0 + s * step, 0.32, i % 2 ? 0.3 : -0.3));
    for (const s of [4, 12]) mix.add(clap(b * 3 + s), t0 + s * step, 0.45);
    for (let s = 0; s < 16; s += 2) mix.add(hat(b * 8 + s), t0 + s * step, 0.06 + rng() * 0.04, -0.3);
    for (const [s, len, glide] of [
      [0, 6, 1],
      [7, 3, 1.5],
      [10, 6, 0.7],
    ] as const) {
      mix.add(subBass(midi(root + 12), step * len, glide, 4), t0 + s * step, 0.4);
    }
    // The "hey": a saw through two formant band-passes, on the first beat of every other bar.
    if (b % 2 === 0) {
      const raw = tone(midi(root + 24), 0.16, { wave: "saw", attack: 0.004, decay: 0.08, sustain: 0.5, release: 0.05 });
      const upper = biquad(raw, "bandpass", 1200, 4);
      const hey = biquad(raw, "bandpass", 700, 4).map((v, i) => v + upper[i]! * 0.7);
      mix.add(hey, t0, 0.5);
    }
    // A squeaky stab riff from bar 5: three short notes sliding up into pitch.
    if (b >= 4) {
      const riff: [number, number][] =
        b % 4 === 3
          ? [
              [0, 12],
              [3, 10],
              [6, 7],
              [8, 3],
              [11, 5],
            ]
          : [
              [0, 12],
              [3, 12],
              [6, 15],
              [10, 14],
            ];
      for (const [s, up] of riff) {
        const stab = tone(midi(root + 36 + up), step * 1.2, {
          wave: "square",
          attack: 0.002,
          decay: 0.05,
          sustain: 0.5,
          release: 0.03,
          slide: { from: 0.8, time: 0.04 },
        });
        lead.add(biquad(stab, "lowpass", 5000), t0 + s * step, 0.12, 0.15);
      }
    }
  }
  reverb(lead, { room: 0.45, damp: 0.4, wet: 0.18 });
  mix.mix(lead);
  normalise(mix);
  return mix;
}

/**
 * For the "No Signal" sound (the looping song on the TV in the Backrooms
 * film's post-credits scene): bossa nova piano chords at 78 bpm in B minor,
 * heard through a television in another room. Band-limited, mono, a little
 * warped, with hiss and two moments where the signal drops out.
 */
function noSignalTvBossa(): Stereo {
  const bpm = 78;
  const beat = 60 / bpm;
  const step = beat / 4;
  const bar = beat * 4;
  const bars = 12;
  const mix = new Stereo(bar * bars);
  const prog = [
    chord("B2", MIN9),
    chord("E2", MIN9),
    chord("A2", [0, 4, 10, 14, 21]),
    chord("D3", MAJ7),
    chord("G2", MAJ7),
    chord("C#3", [0, 3, 6, 10]),
    chord("F#2", [0, 4, 10, 13]),
    chord("B2", MIN9),
  ];
  // A two-bar bossa comping pattern on sixteenths.
  const comp = [
    [0, 3, 6, 10, 12],
    [2, 6, 8, 11, 14],
  ];
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const c = prog[b % prog.length]!;
    for (const s of comp[b % 2]!) {
      c.slice(1).forEach((n, k) => mix.add(electricPiano(midi(n + 12), step * 1.8), t0 + s * step + k * 0.006, 0.09));
    }
    // Bass: root on one, fifth on the and of two, root on three, fifth on the and of four.
    [
      [0, 0],
      [6, 7],
      [8, 0],
      [14, 7],
    ].forEach(([s, up]) => {
      const n = tone(midi(c[0]! - 12 + up!), step * 2.5, {
        wave: "sine",
        attack: 0.01,
        decay: 0.2,
        sustain: 0.5,
        release: 0.1,
      });
      mix.add(n, t0 + s! * step, 0.42);
    });
    // Brushes: a soft shaker on the eighths.
    for (let s = 0; s < 16; s += 2) mix.add(hat(b * 8 + s), t0 + s * step, s % 4 ? 0.05 : 0.03);
  }
  // Through the TV: mono, a narrow band, a slightly warped tape, a small room.
  for (let i = 0; i < mix.length; i++) {
    const m = (mix.left[i]! + mix.right[i]!) * 0.5;
    mix.left[i] = m;
    mix.right[i] = m;
  }
  mix.each((ch) => circular(ch, (x) => biquad(biquad(x, "highpass", 260), "lowpass", 3200)));
  mix.each((ch) => wobble(ch, 0.35, 0.004, 3));
  // The signal drops twice: the music sinks into static for a moment.
  const drops = [13.2, 29.5];
  const fade = (t: number) => {
    let g = 1;
    for (const d of drops) {
      if (t > d && t < d + 0.9) g = Math.min(g, 0.08 + 0.92 * Math.abs(Math.cos(((t - d) / 0.9) * Math.PI)) ** 4);
    }
    return g;
  };
  const statik = noiseLoop(mix.seconds, 21, "white", 7000);
  for (let i = 0; i < mix.length; i++) {
    const g = fade(i / SAMPLE_RATE);
    const s = statik[i]! * (0.012 + (1 - g) * 0.25);
    mix.left[i] = mix.left[i]! * g + s;
    mix.right[i] = mix.right[i]! * g + s;
  }
  reverb(mix, { room: 0.35, damp: 0.6, wet: 0.22 });
  normalise(mix, 0.85);
  return mix;
}

/** The stand-ins `npm run music` writes, after the original loops. */
export const STAND_INS: Composition[] = [
  {
    name: "trending-my-moon-my-man-soft-launch",
    notes:
      "Hypnotic pulsing indie pop, 125 bpm in E minor; the beat drops in after four bars. For soft launches and reveals.",
    standsFor: 'Finneas, "My Moon My Man" (Amazon Music Original cover of Feist)',
    render: softLaunchPulse,
  },
  {
    name: "trending-montagem-chupeta-funk",
    notes:
      "Brazilian funk montagem at 130 bpm: tamborzao toms, sliding 808, squeaky stabs, a formant hey. Fast chaotic edits.",
    standsFor: 'Lthiago, "Montagem da Chupeta"',
    render: montagemFunk,
  },
  {
    name: "trending-no-signal-tv-bossa",
    notes:
      "Bossa nova piano heard through a TV in another room, 78 bpm in B minor, with signal dropouts. Creepy found footage.",
    standsFor: 'The "No Signal" sound from the Backrooms post-credits trend',
    render: noSignalTvBossa,
  },
];
