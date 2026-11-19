import { makeRng } from "../starter/scene/noise";

/**
 * A small deterministic synthesizer for writing original background tracks
 * and loops into the music library: band-limited oscillators, drums, a few
 * instrument voices, biquad filters, tape wobble and a Freeverb-style
 * reverb, mixed into a stereo buffer and encoded as 16-bit WAV. Everything
 * is seeded, so a track renders to the same bytes every time.
 *
 * Tracks loop under the narration, so the mix is circular: a note ringing
 * past the end continues at the start, and the reverb and wobble run on the
 * loop as a ring, so the seam is inaudible.
 */

export const SAMPLE_RATE = 44100;
const TAU = Math.PI * 2;

/** Frequency of a MIDI note number (69 is A4, 440 Hz). */
export function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI number of a note name like "C4", "F#3" or "Bb5". */
export function note(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note name: ${name}`);
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return NOTE_INDEX[m[1]!]! + accidental + (Number(m[3]) + 1) * 12;
}

/** Seconds as a whole number of samples. */
export function samples(seconds: number): number {
  return Math.max(0, Math.round(seconds * SAMPLE_RATE));
}

/** A stereo mix of a fixed length. Everything added wraps around the end (see the module comment). */
export class Stereo {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly length: number;

  constructor(seconds: number) {
    this.length = Math.max(1, samples(seconds));
    this.left = new Float32Array(this.length);
    this.right = new Float32Array(this.length);
  }

  get seconds(): number {
    return this.length / SAMPLE_RATE;
  }

  /** Add a mono sound at `at` seconds, with a gain and an equal-power pan (-1 left to 1 right). */
  add(sound: Float32Array, at: number, gain = 1, pan = 0): void {
    const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
    const gl = Math.cos(angle) * gain * Math.SQRT2;
    const gr = Math.sin(angle) * gain * Math.SQRT2;
    const start = ((samples(at) % this.length) + this.length) % this.length;
    for (let i = 0; i < sound.length; i++) {
      const j = (start + i) % this.length;
      const v = sound[i]!;
      this.left[j]! += v * gl;
      this.right[j]! += v * gr;
    }
  }

  /** Add another mix (a bus) into this one. */
  mix(other: Stereo, gain = 1): void {
    const n = Math.min(this.length, other.length);
    for (let i = 0; i < n; i++) {
      this.left[i]! += other.left[i]! * gain;
      this.right[i]! += other.right[i]! * gain;
    }
  }

  /** Run a mono process on each channel. */
  each(process: (channel: Float32Array) => Float32Array): void {
    this.left.set(process(this.left));
    this.right.set(process(this.right));
  }
}

/** Run a filter over a loop as a ring: once to settle its state, then again for the output. */
export function circular(input: Float32Array, process: (x: Float32Array) => Float32Array): Float32Array {
  const twice = new Float32Array(input.length * 2);
  twice.set(input);
  twice.set(input, input.length);
  return process(twice).slice(input.length);
}

// ---------- oscillators and envelopes ----------

export type Wave = "sine" | "triangle" | "saw" | "square";

/** PolyBLEP correction: removes most of the aliasing from a naive saw or square. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function sample(wave: Wave, phase: number, dt: number): number {
  switch (wave) {
    case "sine":
      return Math.sin(TAU * phase);
    case "triangle":
      return 1 - 4 * Math.abs(phase - 0.5);
    case "saw":
      return 2 * phase - 1 - blep(phase, dt);
    case "square":
      return (phase < 0.5 ? 1 : -1) + blep(phase, dt) - blep((phase + 0.5) % 1, dt);
  }
}

export interface Envelope {
  attack?: number;
  decay?: number;
  /** Level held after the decay, 0 to 1. */
  sustain?: number;
  release?: number;
}

/** An ADSR envelope over `held` seconds plus its release. */
export function envelope(held: number, e: Envelope = {}): Float32Array {
  const { attack = 0.005, decay = 0.1, sustain = 0.7, release = 0.08 } = e;
  const out = new Float32Array(samples(held + release));
  let level = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    if (t < attack) level = t / attack;
    else if (t < attack + decay) level = 1 - (1 - sustain) * ((t - attack) / decay);
    else if (t < held) level = sustain;
    out[i] = t < held ? level : level * Math.max(0, 1 - (t - held) / release);
  }
  // The release starts from wherever the note had got to.
  return out;
}

export interface ToneOptions extends Envelope {
  wave?: Wave;
  /** Several detuned voices spread by this many cents (a chorus), default one voice. */
  voices?: number;
  detune?: number;
  vibrato?: { rate: number; depth: number };
  /** Pitch starts at freq * from and settles over `time` seconds (a glide or a drop). */
  slide?: { from: number; time: number };
}

/** One note: an oscillator (or a few detuned ones) under an envelope. */
export function tone(freq: number, held: number, o: ToneOptions = {}): Float32Array {
  const env = envelope(held, o);
  const out = new Float32Array(env.length);
  const voices = Math.max(1, o.voices ?? 1);
  for (let v = 0; v < voices; v++) {
    const cents = voices === 1 ? 0 : ((v / (voices - 1)) * 2 - 1) * (o.detune ?? 0);
    const base = freq * Math.pow(2, cents / 1200);
    let phase = (v * 0.37) % 1;
    for (let i = 0; i < out.length; i++) {
      const t = i / SAMPLE_RATE;
      let f = base;
      if (o.slide) f *= 1 + (o.slide.from - 1) * Math.exp(-t / Math.max(1e-3, o.slide.time / 4));
      if (o.vibrato) f *= 1 + o.vibrato.depth * Math.sin(TAU * o.vibrato.rate * t);
      const dt = f / SAMPLE_RATE;
      out[i]! += (sample(o.wave ?? "sine", phase, dt) * env[i]!) / voices;
      phase = (phase + dt) % 1;
    }
  }
  return out;
}

/** Seeded noise: white, or pink-ish (a gentle roll-off) or brown (a deep rumble). */
export function noise(seconds: number, seed: number, color: "white" | "pink" | "brown" = "white"): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(samples(seconds));
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let brown = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rng() * 2 - 1;
    if (color === "white") out[i] = w;
    else if (color === "pink") {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else {
      brown = (brown + 0.02 * w) / 1.02;
      out[i] = brown * 3.5;
    }
  }
  return out;
}

/**
 * Noise that loops without a seam: rendered a little long, with the extra
 * crossfaded (equal power) into the start. Then filtered as a ring when
 * `lowpass` is given, so the filter has no seam either.
 */
export function noiseLoop(
  seconds: number,
  seed: number,
  color: "white" | "pink" | "brown",
  lowpass?: number,
  fade = 0.5,
): Float32Array {
  const n = samples(seconds);
  const f = Math.min(samples(fade), n);
  const raw = noise((n + f) / SAMPLE_RATE, seed, color);
  const out = raw.slice(0, n);
  for (let i = 0; i < f; i++) {
    const k = (i + 0.5) / f;
    out[i] = raw[i]! * Math.sin((k * Math.PI) / 2) + raw[n + i]! * Math.cos((k * Math.PI) / 2);
  }
  return lowpass ? circular(out, (x) => biquad(x, "lowpass", lowpass)) : out;
}

/** Multiply a sound by an exponential decay with this half-life in seconds. */
export function decay(x: Float32Array, halfLife: number): Float32Array {
  const k = Math.log(2) / Math.max(1e-4, halfLife);
  return x.map((v, i) => v * Math.exp((-k * i) / SAMPLE_RATE));
}

// ---------- filters and effects ----------

type BiquadKind = "lowpass" | "highpass" | "bandpass";

/** An RBJ biquad filter. */
export function biquad(x: Float32Array, kind: BiquadKind, cutoff: number, q = Math.SQRT1_2): Float32Array {
  const w = (TAU * Math.min(cutoff, SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  if (kind === "lowpass") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (kind === "highpass") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]!;
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/** Soft saturation: tanh drive, rescaled so a full-scale input stays near full scale. */
export function drive(x: Float32Array, amount: number): Float32Array {
  const k = Math.max(0.01, amount);
  const norm = 1 / Math.tanh(k);
  return x.map((v) => Math.tanh(v * k) * norm);
}

/**
 * Tape wobble: a slowly wandering delay (wow) plus a faster shimmer
 * (flutter), as on a worn cassette. Depth is the pitch swing as a fraction.
 */
export function wobble(x: Float32Array, rate: number, depth: number, seed = 1): Float32Array {
  const rng = makeRng(seed);
  const phase = rng() * TAU;
  const maxDelay = (depth * SAMPLE_RATE) / (TAU * rate) + 8;
  const n = x.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const d =
      maxDelay * (1 + Math.sin(TAU * rate * t + phase)) * 0.5 + 3 * (1 + Math.sin(TAU * rate * 9.3 * t + phase * 2));
    const pos = i - d;
    const j = Math.floor(pos);
    const f = pos - j;
    const a = x[((j % n) + n) % n]!;
    const b = x[(((j + 1) % n) + n) % n]!;
    out[i] = a + (b - a) * f;
  }
  return out;
}

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];

function freeverb(x: Float32Array, room: number, damp: number, spread: number): Float32Array {
  const out = new Float32Array(x.length);
  const feedback = 0.7 + 0.28 * room;
  for (const size of COMBS) {
    const buf = new Float32Array(size + spread);
    let idx = 0;
    let low = 0;
    for (let i = 0; i < x.length; i++) {
      const y = buf[idx]!;
      low = y * (1 - damp) + low * damp;
      buf[idx] = x[i]! * 0.015 + low * feedback;
      idx = (idx + 1) % buf.length;
      out[i]! += y;
    }
  }
  for (const size of ALLPASSES) {
    const buf = new Float32Array(size + spread);
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const b = buf[idx]!;
      const v = out[i]!;
      buf[idx] = v + b * 0.5;
      out[i] = b - v;
      idx = (idx + 1) % buf.length;
    }
  }
  return out;
}

export interface ReverbOptions {
  /** 0 (a small room) to 1 (a hall). */
  room?: number;
  /** High-frequency damping, 0 bright to 1 dark. */
  damp?: number;
  /** Wet level added to the dry signal. */
  wet?: number;
}

/** A stereo Freeverb-style reverb, run on the loop as a ring so the tail wraps into the start. */
export function reverb(mix: Stereo, o: ReverbOptions = {}): void {
  const { room = 0.6, damp = 0.4, wet = 0.25 } = o;
  const mono = mix.left.map((l, i) => (l + mix.right[i]!) * 0.5);
  const l = circular(mono, (x) => freeverb(x, room, damp, 0));
  const r = circular(mono, (x) => freeverb(x, room, damp, 23));
  for (let i = 0; i < mix.length; i++) {
    mix.left[i]! += l[i]! * wet;
    mix.right[i]! += r[i]! * wet;
  }
}

/** Scale a mix so its loudest sample sits at `peak`. */
export function normalise(mix: Stereo, peak = 0.89): void {
  let max = 1e-9;
  for (let i = 0; i < mix.length; i++) max = Math.max(max, Math.abs(mix.left[i]!), Math.abs(mix.right[i]!));
  const k = peak / max;
  for (let i = 0; i < mix.length; i++) {
    mix.left[i]! *= k;
    mix.right[i]! *= k;
  }
}

// ---------- drums and instruments ----------

/** A kick: a sine sweeping down from a click into a short boom. */
export function kick(punch = 1, length = 0.45): Float32Array {
  const n = samples(length);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = 45 + 110 * punch * Math.exp(-t * 28);
    phase += f / SAMPLE_RATE;
    out[i] = Math.sin(TAU * phase) * Math.exp(-t * (6 / length));
  }
  return out;
}

/** A snare: a band of noise over a short tone body. */
export function snare(seed: number): Float32Array {
  const body = decay(tone(185, 0.12, { attack: 0.001, decay: 0.05, sustain: 0.2, release: 0.05 }), 0.04);
  const rattle = decay(biquad(noise(0.25, seed), "bandpass", 3200, 0.7), 0.05);
  return body.map((v, i) => v * 0.5 + (rattle[i] ?? 0) * 0.9);
}

/** A clap: three quick noise bursts and a short tail. */
export function clap(seed: number): Float32Array {
  const n = samples(0.3);
  const src = biquad(noise(0.3, seed), "bandpass", 1500, 0.9);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let g = Math.exp(-(t - 0.024) * 22) * (t > 0.024 ? 1 : 0);
    for (const burst of [0, 0.008, 0.016]) {
      if (t >= burst && t < burst + 0.008) g = Math.max(g, 1 - (t - burst) / 0.008);
    }
    out[i] = src[i]! * g;
  }
  return out;
}

/** A hi-hat: high noise, closed (short) or open (ringing). */
export function hat(seed: number, open = false): Float32Array {
  return decay(biquad(noise(open ? 0.4 : 0.08, seed), "highpass", 7000), open ? 0.09 : 0.018);
}

/** The classic drum-machine cowbell: two square waves a fifth-ish apart through a band-pass. Tunable. */
export function cowbell(freq = 540, length = 0.32): Float32Array {
  const a = tone(freq, length, { wave: "square", attack: 0.001, decay: 0.02, sustain: 0.6, release: 0.02 });
  const b = tone(freq * 1.4815, length, { wave: "square", attack: 0.001, decay: 0.02, sustain: 0.6, release: 0.02 });
  const sum = a.map((v, i) => v + b[i]!);
  return decay(biquad(sum, "bandpass", freq * 1.6, 1.4), length / 4);
}

/** A music-box tine: a bell tone with quickly fading inharmonic overtones. */
export function musicBox(freq: number, length = 1.6): Float32Array {
  const n = samples(length);
  const out = new Float32Array(n);
  const partials: [number, number, number][] = [
    [1, 1, length / 4],
    [3.0, 0.25, length / 14],
    [5.95, 0.12, length / 30],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const [ratio, amp, half] of partials) v += Math.sin(TAU * freq * ratio * t) * amp * Math.pow(0.5, t / half);
    out[i] = v * Math.min(1, t / 0.002);
  }
  return out;
}

/** An electric piano: two-operator FM whose bright attack mellows into a sine. */
export function electricPiano(freq: number, held: number): Float32Array {
  const env = envelope(held, { attack: 0.003, decay: 1.2, sustain: 0.35, release: 0.4 });
  const out = new Float32Array(env.length);
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const index = 0.4 + 2.2 * Math.exp(-t * 6);
    const mod = Math.sin(TAU * freq * t) * index;
    out[i] = Math.sin(TAU * freq * t + mod) * env[i]! * (0.85 + 0.15 * Math.sin(TAU * 4.8 * t));
  }
  return out;
}

/** A warm pad: detuned saws through a low-pass, slow to arrive and to leave. */
export function pad(freq: number, held: number, cutoff = 1200): Float32Array {
  const raw = tone(freq, held, {
    wave: "saw",
    voices: 3,
    detune: 9,
    attack: 0.9,
    decay: 0.5,
    sustain: 0.8,
    release: 1.4,
  });
  return biquad(raw, "lowpass", cutoff, 0.6);
}

/** A sub bass for phonk and funk: a sine with an octave of drive, gliding in from `glideFrom` times its pitch. */
export function subBass(freq: number, held: number, glideFrom = 1, grit = 2.5): Float32Array {
  const raw = tone(freq, held, {
    wave: "sine",
    attack: 0.004,
    decay: 0.25,
    sustain: 0.75,
    release: 0.06,
    ...(glideFrom !== 1 ? { slide: { from: glideFrom, time: 0.12 } } : {}),
  });
  return drive(raw, grit);
}

// ---------- output ----------

/** Encode a mix as a 16-bit stereo PCM WAV file, clipping anything past full scale. */
export function encodeWav(mix: Stereo): Buffer {
  const data = mix.length * 4;
  const buf = Buffer.alloc(44 + data);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + data, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(data, 40);
  const pcm = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < mix.length; i++) {
    buf.writeInt16LE(pcm(mix.left[i]!), 44 + i * 4);
    buf.writeInt16LE(pcm(mix.right[i]!), 46 + i * 4);
  }
  return buf;
}
