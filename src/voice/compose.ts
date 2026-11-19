import { makeRng } from "../starter/scene/noise";
import {
  biquad,
  circular,
  clap,
  cowbell,
  decay,
  electricPiano,
  hat,
  kick,
  midi,
  musicBox,
  noise,
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
 * Original background loops in the styles that trend on short-form video,
 * composed for the music library with the synthesizer in synth.ts: nothing
 * sampled, nothing licensed, so they can ship with the repo and be posted
 * anywhere. Each is a seamless loop (the mixdown repeats it under the
 * voice). `npm run music` writes them into music/.
 *
 * The names are what the scene agent sees when it picks a track, so they
 * say what the track is for.
 */

export interface Composition {
  /** File name without extension, as the agent and the dashboard see it. */
  name: string;
  /** One line for the README: what it sounds like and what it suits. */
  notes: string;
  /** For a stand-in (standins.ts): the licensed recording it stands in for until the real file replaces it. */
  standsFor?: string;
  render: () => Stereo;
}

/** Chord tones as MIDI numbers from a root name and intervals. */
export function chord(root: string, intervals: number[]): number[] {
  const r = note(root);
  return intervals.map((i) => r + i);
}
const MAJ = [0, 4, 7];
const MIN = [0, 3, 7];
const MAJ7 = [0, 4, 7, 11];
const MIN7 = [0, 3, 7, 10];
const MAJ9 = [0, 4, 7, 11, 14];
const MIN9 = [0, 3, 7, 10, 14];
const MIN6 = [0, 3, 7, 9];

/**
 * A bright, bouncy hangout loop for blocky-game towns and "in this town"
 * stories: chiptune-leaning square lead, plucky off-beat chords, a hopping
 * bass and a light four-on-the-floor kit. I-V-vi-IV in C at 124 bpm.
 */
function blockTownLobby(): Stereo {
  const bpm = 124;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = 16;
  const mix = new Stereo(bar * bars);
  const prog = [chord("C4", MAJ), chord("G3", MAJ), chord("A3", MIN), chord("F3", MAJ)];
  // Eight eighth notes per bar, null for a rest; the second pass changes the last bar.
  const lead: (string | null)[][] = [
    ["E5", null, "G5", null, "A5", "G5", "E5", null],
    ["D5", null, "G5", null, "B5", "A5", "G5", null],
    ["C5", null, "E5", null, "A5", "G5", "E5", "C5"],
    ["D5", null, "F5", null, "A5", null, "G5", null],
  ];
  const leadEnd: (string | null)[] = ["C6", null, "A5", null, "G5", null, "E5", null];
  const rng = makeRng(124);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const c = prog[b % 4]!;
    // Bass: root and octave hopping on eighths.
    for (let e = 0; e < 8; e++) {
      const n = c[0]! - 12 + (e % 2 ? 12 : 0);
      mix.add(tone(midi(n), beat * 0.42, { wave: "triangle", decay: 0.12, sustain: 0.5 }), t0 + e * beat * 0.5, 0.42);
    }
    // Plucky chords on the off-beats.
    for (let q = 0; q < 4; q++) {
      for (const [k, n] of c.entries()) {
        const pluck = biquad(tone(midi(n + 12), 0.09, { wave: "square", decay: 0.06, sustain: 0.2 }), "lowpass", 2600);
        mix.add(pluck, t0 + q * beat + beat / 2, 0.07, (k - 1) * 0.35);
      }
    }
    // Bars 1-8 a bell arpeggio, bars 9-16 the lead.
    if (b < 8) {
      for (let s = 0; s < 8; s++) {
        const n = c[s % 3]! + 12 + (s >= 4 ? 12 : 0);
        mix.add(
          tone(midi(n), 0.12, { wave: "triangle", decay: 0.25, sustain: 0.1, release: 0.3 }),
          t0 + s * beat * 0.5,
          0.16,
          0.3,
        );
      }
    } else {
      const line = b === bars - 1 ? leadEnd : lead[b % 4]!;
      line.forEach((name, s) => {
        if (!name) return;
        const n = tone(midi(note(name)), beat * 0.4, {
          wave: "square",
          decay: 0.08,
          sustain: 0.55,
          release: 0.06,
          vibrato: { rate: 5.5, depth: 0.004 },
        });
        mix.add(biquad(n, "lowpass", 3800), t0 + s * beat * 0.5, 0.16, -0.15);
      });
    }
    // Drums.
    for (let q = 0; q < 4; q++) {
      mix.add(kick(0.8, 0.32), t0 + q * beat, 0.62);
      if (q % 2) mix.add(clap(b * 4 + q), t0 + q * beat, 0.32, 0.1);
      for (const half of [0, 0.5]) {
        mix.add(hat(b * 8 + q * 2 + half * 2), t0 + (q + half) * beat, 0.08 + rng() * 0.04, 0.4);
      }
    }
    if (b % 4 === 3) mix.add(hat(900 + b, true), t0 + 3.5 * beat, 0.1, 0.4);
  }
  reverb(mix, { room: 0.45, damp: 0.5, wet: 0.16 });
  normalise(mix);
  return mix;
}

/**
 * Dreamcore: a music box lullaby that is slightly wrong. A waltz in F with a
 * borrowed minor iv, detuned a little flat, a warped tape wobble, a big
 * empty reverb and hiss. Nostalgic, uncanny, childhood-adjacent.
 */
function dreamcoreMusicBox(): Stereo {
  const bpm = 78;
  const beat = 60 / bpm;
  const bar = beat * 3;
  const bars = 16;
  const mix = new Stereo(bar * bars);
  const flat = -0.35; // semitones: everything sits a little under pitch
  const prog = [chord("F4", MAJ7), chord("A3", MIN7), chord("Bb3", MAJ7), chord("Bb3", MIN6)];
  const rng = makeRng(78);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const c = prog[b % 4]!;
    // Six eighths per bar: up the chord and back down, an octave or two above.
    const shape = [0, 1, 2, 3, 2, 1];
    shape.forEach((idx, s) => {
      // The box skips now and then, as if a pin is missing.
      if (rng() < 0.08) return;
      const n = c[idx % c.length]! + 12 + (idx === 3 ? 12 : 0);
      mix.add(musicBox(midi(n + flat), 1.8), t0 + s * beat * 0.5, 0.32, Math.sin(s) * 0.4);
    });
    // A top melody note on the downbeat every other bar.
    if (b % 2 === 0) mix.add(musicBox(midi(c[3]! + 24 + flat), 2.4), t0, 0.22, -0.2);
    // A pad under the chord.
    for (const n of c) mix.add(pad(midi(n - 12 + flat), bar * 0.95, 900), t0, 0.06);
  }
  mix.each((ch) => wobble(ch, 0.42, 0.005, 5));
  reverb(mix, { room: 0.92, damp: 0.35, wet: 0.5 });
  mix.add(noiseLoop(mix.seconds, 7, "pink", 6000), 0, 0.018, -0.3);
  mix.add(noiseLoop(mix.seconds, 8, "pink", 6000), 0, 0.018, 0.3);
  normalise(mix, 0.8);
  return mix;
}

/**
 * The backrooms: fluorescent tubes buzzing at the mains hum, a sub drone
 * just under hearing, room tone, a ballast sputter now and then and one
 * distant thud somewhere in the walls. No melody: dread as ambience.
 */
function backroomsHum(): Stereo {
  const seconds = 40;
  const mix = new Stereo(seconds);
  const n = mix.length;
  const rng = makeRng(120);
  // Smooth random level for the tubes, plus three sputters.
  const knots = Array.from({ length: 41 }, () => 0.75 + rng() * 0.25);
  knots[40] = knots[0]!;
  const sputters = [7.3, 18.9, 31.6];
  const hum = new Float32Array(n);
  const buzz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const k = Math.floor(t);
    const f = t - k;
    let level = knots[k]! + (knots[(k + 1) % 40]! - knots[k]!) * (f * f * (3 - 2 * f));
    for (const s of sputters) {
      if (t > s && t < s + 0.7) level *= Math.sin(t * 190) > 0.2 ? 0.25 : 1;
    }
    hum[i] =
      (Math.sin(2 * Math.PI * 120 * t) * 0.6 +
        Math.sin(2 * Math.PI * 240 * t) * 0.3 +
        Math.sin(2 * Math.PI * 360 * t) * 0.15 +
        Math.sin(2 * Math.PI * 480 * t) * 0.08) *
      level;
    // The buzz: the hum clipped hard, so it sounds like a failing ballast.
    buzz[i] = Math.max(-0.3, Math.min(0.3, Math.sin(2 * Math.PI * 120 * t) * 3)) * level;
  }
  mix.add(hum, 0, 0.32);
  mix.add(
    circular(buzz, (x) => biquad(x, "bandpass", 3000, 0.8)),
    0,
    0.12,
    0.25,
  );
  const drone = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    drone[i] = Math.sin(2 * Math.PI * 41.2 * t) * 0.7 + Math.sin(2 * Math.PI * 55.1 * t) * 0.25;
  }
  mix.add(drone, 0, 0.22);
  mix.add(noiseLoop(seconds, 13, "brown", 300), 0, 0.2, -0.3);
  mix.add(noiseLoop(seconds, 14, "brown", 300), 0, 0.2, 0.3);
  mix.add(biquad(kick(0.3, 1.4), "lowpass", 180), 26.2, 0.5, -0.6);
  reverb(mix, { room: 0.75, damp: 0.55, wet: 0.3 });
  normalise(mix, 0.7);
  return mix;
}

/**
 * Liminal mall muzak: slowed, warm electric-piano ninth chords over a soft
 * sine bass and a rim click, washed in reverb and tape wobble, as if heard
 * from an empty food court at closing time. Dreamcore's calmer cousin.
 */
function liminalMallMuzak(): Stereo {
  const bpm = 72;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = 12;
  const mix = new Stereo(bar * bars);
  const prog = [chord("Eb3", MAJ9), chord("C3", MIN9), chord("Ab2", MAJ9), chord("Bb2", [0, 5, 7, 10, 14])];
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const c = prog[b % 4]!;
    for (const at of [0, 1.5, 2.5]) {
      for (const [k, n] of c.slice(1).entries()) {
        mix.add(electricPiano(midi(n + 12), beat * 1.2), t0 + at * beat + k * 0.012, 0.09, (k - 1.5) * 0.3);
      }
    }
    mix.add(
      tone(midi(c[0]! - 12), bar * 0.9, { wave: "sine", attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.3 }),
      t0,
      0.4,
    );
    for (const q of [1, 3]) {
      mix.add(decay(biquad(noise(0.1, b * 4 + q), "bandpass", 1800, 2), 0.012), t0 + q * beat, 0.2, 0.2);
    }
  }
  mix.each((ch) => circular(ch, (x) => biquad(x, "lowpass", 4200)));
  mix.each((ch) => wobble(ch, 0.3, 0.003, 9));
  reverb(mix, { room: 0.85, damp: 0.45, wet: 0.42 });
  normalise(mix, 0.82);
  return mix;
}

/**
 * Brazilian funk meets phonk, the "montagem" sound that tops the global
 * trending charts: a syncopated funk kick, gliding distorted sub bass, a
 * pitched cowbell riff in F sharp minor, claps and busy hats. 130 bpm.
 */
function funkMontagemPhonk(): Stereo {
  const bpm = 130;
  const step = 60 / bpm / 4;
  const bar = step * 16;
  const bars = 16;
  const mix = new Stereo(bar * bars);
  const roots = ["F#1", "F#1", "D1", "E1"];
  const kicks = [0, 3, 6, 10, 12];
  const bassNotes: [number, number][] = [
    [0, 0],
    [6, 0],
    [10, 3],
    [12, 0],
  ];
  // The cowbell riff: [step, semitones above F#5], two variations.
  const riffA: [number, number][] = [
    [0, 0],
    [2, 0],
    [3, 3],
    [5, 0],
    [7, 7],
    [8, 5],
    [10, 3],
    [11, 0],
    [13, -2],
    [14, 0],
  ];
  const riffB: [number, number][] = [
    [0, 7],
    [2, 7],
    [3, 10],
    [5, 7],
    [7, 5],
    [8, 3],
    [10, 5],
    [11, 3],
    [13, 0],
    [14, -2],
  ];
  const rng = makeRng(130);
  const bell = new Stereo(mix.seconds);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const root = note(roots[b % 4]!);
    for (const s of kicks) mix.add(kick(1.1, 0.38), t0 + s * step, 0.7);
    for (const [s, up] of bassNotes) {
      const glide = s === 10 ? 0.75 : 1;
      mix.add(subBass(midi(root + 12 + up), step * 3.2, glide), t0 + s * step, 0.42);
    }
    for (const s of [4, 12]) mix.add(clap(b * 2 + s), t0 + s * step, 0.42, 0.05);
    for (let s = 0; s < 16; s++) mix.add(hat(b * 16 + s), t0 + s * step, 0.05 + rng() * 0.05, 0.35);
    if (b >= 4) {
      const riff = b % 4 === 3 ? riffB : riffA;
      for (const [s, up] of riff) bell.add(cowbell(midi(note("F#5") + up), 0.28), t0 + s * step, 0.3, -0.2);
    }
  }
  reverb(bell, { room: 0.5, damp: 0.4, wet: 0.2 });
  mix.mix(bell);
  normalise(mix);
  return mix;
}

/** Every original track `npm run music` writes, in the order it writes them. */
export const COMPOSITIONS: Composition[] = [
  {
    name: "block-town-lobby-upbeat",
    notes: "Bright, bouncy chiptune-leaning hangout loop for blocky-game towns and 'in this town' stories.",
    render: blockTownLobby,
  },
  {
    name: "dreamcore-music-box-uncanny",
    notes: "A detuned music-box waltz in a warped tape wobble and an empty reverb: nostalgic and slightly wrong.",
    render: dreamcoreMusicBox,
  },
  {
    name: "backrooms-fluorescent-hum",
    notes: "Fluorescent buzz, sub drone, room tone, a sputtering ballast and one distant thud. Liminal dread.",
    render: backroomsHum,
  },
  {
    name: "liminal-mall-muzak-slowed",
    notes: "Slowed electric-piano ninth chords from an empty food court at closing time. Calm, hollow, vaporwave.",
    render: liminalMallMuzak,
  },
  {
    name: "funk-montagem-phonk-cowbell",
    notes: "Brazilian funk meets phonk: syncopated kick, gliding distorted sub, a cowbell riff. High energy edits.",
    render: funkMontagemPhonk,
  },
];
