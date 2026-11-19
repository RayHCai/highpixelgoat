import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPOSITIONS } from "../src/voice/compose";
import { STAND_INS } from "../src/voice/standins";
import { circular, encodeWav, midi, noiseLoop, note, SAMPLE_RATE, samples, Stereo, tone } from "../src/voice/synth";

test("note names and MIDI numbers map to the right pitches", () => {
  assert.equal(note("A4"), 69);
  assert.equal(note("C4"), 60);
  assert.equal(note("F#1"), 30);
  assert.equal(note("Bb3"), 58);
  assert.equal(midi(69), 440);
  assert.ok(Math.abs(midi(81) - 880) < 1e-9);
  assert.throws(() => note("H2"));
});

test("a mix wraps sounds past its end into the start, so tracks loop without a gap", () => {
  const mix = new Stereo(1);
  const click = new Float32Array(10).fill(1);
  mix.add(click, 1 - 5 / SAMPLE_RATE, 0.5);
  assert.ok(mix.left[mix.length - 1]! > 0, "the start of the click is at the end");
  assert.ok(mix.left[4]! > 0 && mix.left[5] === 0, "and the rest wrapped to the start");
  assert.ok(Math.abs(mix.left[0]! - mix.right[0]!) < 1e-6, "centred");
});

test("seeded synthesis is deterministic", () => {
  assert.deepEqual(noiseLoop(0.2, 3, "pink"), noiseLoop(0.2, 3, "pink"));
  assert.deepEqual(
    tone(220, 0.1, { wave: "saw", voices: 3, detune: 8 }),
    tone(220, 0.1, { wave: "saw", voices: 3, detune: 8 }),
  );
  assert.notDeepEqual(noiseLoop(0.2, 3, "white"), noiseLoop(0.2, 4, "white"));
});

test("a noise loop has no seam: the step across the loop point is an ordinary step", () => {
  const x = noiseLoop(1, 9, "brown", 400);
  assert.equal(x.length, samples(1));
  let largest = 0;
  for (let i = 1; i < x.length; i++) largest = Math.max(largest, Math.abs(x[i]! - x[i - 1]!));
  assert.ok(Math.abs(x[0]! - x[x.length - 1]!) <= largest);
});

test("circular filters run as a ring and keep the length", () => {
  const x = new Float32Array([1, 0, 0, 0]);
  const y = circular(x, (v) => v.map((s, i) => s + (v[i - 1] ?? 0)));
  assert.deepEqual([...y], [1, 1, 0, 0]);
});

test("encodeWav writes a 16-bit stereo PCM header and clips past full scale", () => {
  const mix = new Stereo(0.01);
  mix.left[0] = 2;
  mix.right[0] = -2;
  const wav = encodeWav(mix);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(22), 2, "two channels");
  assert.equal(wav.readUInt32LE(24), SAMPLE_RATE);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), mix.length * 4);
  assert.equal(wav.readInt16LE(44), 32767);
  assert.equal(wav.readInt16LE(46), -32767);
});

test("the original loops and stand-ins have distinct, descriptive library names", () => {
  const names = [...COMPOSITIONS, ...STAND_INS].map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.match(n, /^[a-z0-9]+(-[a-z0-9]+){2,}$/);
  for (const c of [...COMPOSITIONS, ...STAND_INS]) assert.ok(c.notes.length > 20);
});

test("every stand-in names the trending sound it stands in for, and only stand-ins do", () => {
  for (const c of STAND_INS) {
    assert.match(c.name, /^trending-/);
    assert.ok(c.standsFor && c.standsFor.length > 5, c.name);
  }
  assert.ok(COMPOSITIONS.every((c) => !c.standsFor && !c.name.startsWith("trending-")));
});
