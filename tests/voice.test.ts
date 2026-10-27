import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleSpec } from "./fixture";
import { alignWords, subtitleWords } from "../src/starter/hud/hud";
import {
  beatSlot,
  BREATH_SECONDS,
  estimateNarrationSeconds,
  fitNarration,
  MIN_SLOT_SECONDS,
} from "../src/starter/spec/timing";
import { parseEdgeWords } from "../src/voice/edge";
import { mixdownArgs } from "../src/voice/mixdown";
import { wordsFromCharAlignment } from "../src/voice/tts";

const example = exampleSpec();

test("fitNarration spaces beats by their measured narration and derives the duration", () => {
  const beats = example.beats.map((b, i) => ({ ...b, narrationSeconds: 1 + i }));
  const spec = fitNarration({ ...example, beats });
  for (let i = 1; i < spec.beats.length; i++) {
    const prev = spec.beats[i - 1]!;
    const gap = spec.beats[i]!.at - prev.at;
    assert.ok(
      Math.abs(gap - Math.max(MIN_SLOT_SECONDS, prev.narrationSeconds! + BREATH_SECONDS)) < 0.011,
      `gap ${i} = ${gap}`,
    );
  }
  const last = spec.beats[spec.beats.length - 1]!;
  assert.ok(
    spec.format.duration >= last.at + last.narrationSeconds! + 1.6,
    "the last line finishes before the video ends",
  );
  assert.ok(spec.format.duration <= 90);
});

test("beats without audio are timed from an estimated reading speed", () => {
  const silent = fitNarration({ ...example, beats: example.beats.map(({ narrationSeconds: _s, ...b }) => b) });
  assert.ok(estimateNarrationSeconds("one two three four five") > 2);
  assert.equal(estimateNarrationSeconds("   "), 0);
  assert.equal(beatSlot({ ...example.beats[0]!, narration: "" }), MIN_SLOT_SECONDS);
  assert.ok(silent.format.duration > 20 && silent.format.duration < 60, `derived duration ${silent.format.duration}`);
});

test("mixdownArgs delays each clip to its beat and pads to the duration", () => {
  const args = mixdownArgs(
    [
      { file: "a.mp3", at: 0.4 },
      { file: "b.mp3", at: 5.25 },
    ],
    30,
    "out.mp3",
    "libmp3lame",
  );
  const filter = args[args.indexOf("-filter_complex") + 1]!;
  assert.match(filter, /\[0\]adelay=400:all=1\[a0\]/);
  assert.match(filter, /\[1\]adelay=5250:all=1\[a1\]/);
  assert.match(filter, /amix=inputs=2:normalize=0/);
  assert.match(filter, /apad\[out\]/);
  assert.equal(args[args.indexOf("-t") + 1], "30.000");
  assert.equal(args[args.length - 1], "out.mp3");
  const silent = mixdownArgs([], 12, "out.m4a", "aac");
  assert.ok(silent.includes("anullsrc=r=44100:cl=mono"));
  assert.ok(!silent.includes("-filter_complex"));
});

test("character alignments are grouped into words with punctuation attached", () => {
  const text = "By lunch, done.";
  const chars = text.split("");
  const starts = chars.map((_, i) => i * 0.1);
  const ends = chars.map((_, i) => i * 0.1 + 0.1);
  const words = wordsFromCharAlignment(chars, starts, ends);
  assert.deepEqual(
    words.map((w) => w.text),
    ["By", "lunch,", "done."],
  );
  assert.equal(words[0]!.start, 0);
  assert.ok(Math.abs(words[1]!.start - 0.3) < 1e-9);
  assert.ok(Math.abs(words[2]!.end - 1.5) < 1e-9);
});

test("edge word boundaries are read from 100ns ticks", () => {
  const metas = [
    JSON.stringify({
      Metadata: [{ Type: "WordBoundary", Data: { Offset: 875000, Duration: 750000, text: { Text: "By" } } }],
    }),
    JSON.stringify({ Metadata: [{ Type: "SentenceBoundary", Data: { Offset: 0, Duration: 1, text: { Text: "x" } } }] }),
    "not json",
    JSON.stringify({
      Metadata: [{ Type: "WordBoundary", Data: { Offset: 1625000, Duration: 3000000, text: { Text: "lunch" } } }],
    }),
  ];
  const words = parseEdgeWords(metas)!;
  assert.equal(words.length, 2);
  assert.ok(Math.abs(words[0]!.start - 0.0875) < 1e-9);
  assert.ok(Math.abs(words[1]!.end - 0.4625) < 1e-9);
  assert.equal(parseEdgeWords(["{}"]), null);
});

test("subtitleWords keeps the written words and borrows the provider timings", () => {
  const timed = subtitleWords(
    "One, two three.",
    [
      { text: "One", start: 0.1, end: 0.3 },
      { text: "two", start: 0.3, end: 0.5 },
      { text: "three", start: 0.5, end: 0.9 },
    ],
    0.9,
  );
  assert.deepEqual(
    timed.map((w) => w.text),
    ["One,", "two", "three."],
    "punctuation survives",
  );
  assert.equal(timed[1]!.start, 0.3);
  assert.equal(timed[2]!.end, 0.9);
  const even = subtitleWords("one two three four", undefined, 2);
  assert.equal(even.length, 4);
  assert.equal(even[0]!.start, 0);
  assert.ok(Math.abs(even[2]!.start - 1) < 1e-9);
  const merged = subtitleWords(
    "well-known fact",
    [
      { text: "well", start: 0.2, end: 0.4 },
      { text: "known", start: 0.4, end: 0.7 },
      { text: "fact", start: 0.7, end: 1.0 },
    ],
    1.2,
  );
  assert.equal(merged.length, 2, "a hyphenated word spans the provider words it is made of");
  assert.ok(Math.abs(merged[0]!.start - 0.2) < 1e-9);
  assert.ok(Math.abs(merged[0]!.end - 0.7) < 1e-9);
  const extra = subtitleWords(
    "one two three",
    [
      { text: "one", start: 0.1, end: 0.3 },
      { text: "uh", start: 0.3, end: 0.4 },
      { text: "two", start: 0.4, end: 0.6 },
      { text: "three", start: 0.6, end: 1.2 },
    ],
    1.2,
  );
  assert.ok(Math.abs(extra[1]!.start - 0.4) < 1e-9, "a stray provider word is skipped");
  const unmatched = subtitleWords(
    "one two three",
    [
      { text: "one", start: 0.2, end: 0.4 },
      { text: "three", start: 0.8, end: 1.2 },
    ],
    1.2,
  );
  assert.equal(unmatched.length, 3, "on-screen text wins when the provider drops a word");
  assert.ok(Math.abs(unmatched[1]!.start - 0.4) < 1e-9, "an unmatched word is spread between its neighbours");
  assert.ok(Math.abs(unmatched[1]!.end - 0.8) < 1e-9);
  assert.equal(subtitleWords("", undefined, 1).length, 0);
});

test("alignWords ignores case and punctuation", () => {
  const out = alignWords(
    ["Day", "thirty:", "$5,242"],
    [
      { text: "day", start: 0, end: 0.2 },
      { text: "thirty", start: 0.2, end: 0.6 },
      { text: "5,242", start: 0.7, end: 1.4 },
    ],
  );
  assert.ok(out.every((w) => w !== null));
  assert.equal(out[2]!.text, "$5,242");
});
