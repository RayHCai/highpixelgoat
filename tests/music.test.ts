import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { EXAMPLES } from "../src/script/examples";
import { offlineEdit } from "../src/script/offline";
import { CoreSpecSchema } from "../src/take/core";
import { gainExpr, mixSoundtrackArgs } from "../src/voice/mixdown";
import { listMusic, musicEnvelope, musicPrompt, resolveMusic } from "../src/voice/music";
import { placeSfx, sfxPrompt } from "../src/voice/sfx";

function library(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "hpg-music-"));
  for (const f of ["Upbeat Ukulele.mp3", "dramatic-cinematic.m4a", "notes.txt", "lofi chill.WAV"]) {
    writeFileSync(path.join(dir, f), "x");
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("listMusic finds audio files only and names them by their stem", () => {
  const { dir, cleanup } = library();
  try {
    const tracks = listMusic(dir);
    assert.deepEqual(
      tracks.map((t) => t.name),
      ["dramatic-cinematic", "lofi chill", "Upbeat Ukulele"],
    );
    assert.deepEqual(listMusic(path.join(dir, "missing")), []);
  } finally {
    cleanup();
  }
});

test("resolveMusic honours an exact name, none, and falls back to a seeded pick", () => {
  const { dir, cleanup } = library();
  try {
    const tracks = listMusic(dir);
    const a0 = { project: "p", take: 0 };
    assert.equal(resolveMusic("upbeat ukulele", a0, tracks)?.name, "Upbeat Ukulele");
    assert.equal(resolveMusic("dramatic-cinematic.m4a", a0, tracks)?.name, "dramatic-cinematic");
    assert.equal(resolveMusic("None", a0, tracks), null);
    const a = resolveMusic("", a0, tracks);
    const again = resolveMusic("nonsense", a0, tracks);
    assert.ok(a && again && a.name === again.name, "the fallback is deterministic per take");
    const picks = new Set([0, 1, 2].map((take) => resolveMusic("", { project: "p", take }, tracks)!.name));
    assert.equal(picks.size, 3, "three takes get three different tracks");
    assert.equal(resolveMusic("anything", a0, []), null);
  } finally {
    cleanup();
  }
});

test("musicPrompt lists the library or says there is none", () => {
  assert.match(musicPrompt([]), /No background tracks/);
  const text = musicPrompt([{ name: "lofi chill", file: "x" }]);
  assert.match(text, /- lofi chill/);
  assert.match(text, /"none"/);
});

const flat = { file: "song.mp3", volume: 0.22, envelope: [{ t: 0, gain: 1 }] };

test("mixSoundtrackArgs loops, fades, ducks and mixes the music under the voice", () => {
  const args = mixSoundtrackArgs("voice.mp3", flat, [], 30, "track.mp3", "libmp3lame");
  assert.ok(args.indexOf("-stream_loop") < args.indexOf("song.mp3"), "the music input loops");
  const graph = args[args.indexOf("-filter_complex") + 1]!;
  assert.match(graph, /asetpts=N\/SR\/TB,volume=0\.220,volume='1\.000':eval=frame/);
  assert.match(graph, /afade=t=out:st=28\.500:d=1\.500/);
  assert.match(graph, /sidechaincompress/);
  assert.match(graph, /\[v\]\[ducked\]amix=inputs=2:normalize=0/);
  assert.equal(args[args.indexOf("-t") + 1], "30.000");
  assert.equal(args[args.length - 1], "track.mp3");
  const loud = mixSoundtrackArgs("v", { ...flat, volume: 4 }, [], 2, "o", "aac");
  assert.match(loud[loud.indexOf("-filter_complex") + 1]!, /volume=1\.000,/, "volume is clamped");
});

test("mixSoundtrackArgs lays effects on top at their times, with or without music", () => {
  const fx = [
    { file: "buzz.wav", at: 4.25, volume: 0.8 },
    { file: "click.wav", at: 0, volume: 3 },
  ];
  const args = mixSoundtrackArgs("voice.mp3", flat, fx, 10, "track.mp3", "aac");
  const graph = args[args.indexOf("-filter_complex") + 1]!;
  assert.ok(args.indexOf("buzz.wav") > args.indexOf("song.mp3"), "effects follow the music input");
  assert.match(graph, /\[2:a\][^;]*volume=0\.800,adelay=4250:all=1\[s0\]/);
  assert.match(graph, /\[3:a\][^;]*volume=1\.000,adelay=0:all=1\[s1\]/);
  assert.match(graph, /\[v\]\[ducked\]\[s0\]\[s1\]amix=inputs=4/);

  const dry = mixSoundtrackArgs("voice.mp3", null, fx.slice(0, 1), 10, "track.mp3", "aac");
  const dryGraph = dry[dry.indexOf("-filter_complex") + 1]!;
  assert.ok(!dry.includes("-stream_loop") && !/sidechain/.test(dryGraph), "no music, no ducking");
  assert.match(dryGraph, /\[1:a\][^;]*adelay=4250:all=1\[s0\];\[v\]\[s0\]amix=inputs=2/);
});

test("musicEnvelope turns beat cues into gain points: instant cuts, ramped rides, held between", () => {
  assert.deepEqual(musicEnvelope([{ at: 0 }, { at: 2 }]), [{ t: 0, gain: 1 }], "no cues, a flat line");
  const env = musicEnvelope([
    { at: 0, musicCue: "low" },
    { at: 2, musicCue: "play" },
    { at: 4 },
    { at: 5, musicCue: "cut" },
    { at: 7, musicCue: "cut" },
    { at: 8, musicCue: "swell" },
  ]);
  assert.deepEqual(env, [
    { t: 0, gain: 0.35 },
    { t: 2, gain: 0.35 },
    { t: 2.6, gain: 1 },
    { t: 5, gain: 1 },
    { t: 5.02, gain: 0 },
    { t: 8, gain: 0 },
    { t: 8.02, gain: 1.4 },
  ]);
});

test("gainExpr interpolates between points and holds after the last", () => {
  assert.equal(gainExpr([{ t: 0, gain: 0.5 }]), "0.500");
  const expr = gainExpr([
    { t: 0, gain: 1 },
    { t: 3, gain: 1 },
    { t: 3.5, gain: 0 },
  ]);
  assert.equal(expr, "if(lt(t,3.000),1.000,if(lt(t,3.500),1.000+-1.000*(t-3.000)/0.500,0.000))");
});

test("placeSfx resolves names to files at video times and names what is missing", () => {
  const library = [
    { name: "phone-buzz", file: "/fx/phone-buzz.wav" },
    { name: "Click", file: "/fx/Click.mp3" },
  ];
  const beats = [
    { at: 0, sfx: [{ name: "click", offset: 0.5, volume: 0.8 }] },
    { at: 3, sfx: [{ name: "phone-buzz.wav", offset: 1, volume: 0.4 }] },
    { at: 9, sfx: [{ name: "phone-buzz", offset: 2, volume: 1 }] },
  ];
  assert.deepEqual(placeSfx(beats, 10, library), [
    { file: "/fx/Click.mp3", at: 0.5, volume: 0.8 },
    { file: "/fx/phone-buzz.wav", at: 4, volume: 0.4 },
  ]);
  assert.throws(
    () => placeSfx([{ at: 0, sfx: [{ name: "doorbell", offset: 0, volume: 1 }] }], 10, library),
    /Unknown sound effects: doorbell\. Available: phone-buzz, Click\./,
  );
  assert.deepEqual(placeSfx([{ at: 0 }], 10, []), []);
});

test("the prompts list the libraries and explain the cues", () => {
  const music = musicPrompt([{ name: "piano", file: "x" }]);
  assert.match(music, /musicCue/);
  assert.match(music, /"cut"/);
  assert.match(sfxPrompt([]), /Leave sfx out/);
  const sfx = sfxPrompt([{ name: "phone-buzz", file: "x" }]);
  assert.match(sfx, /- phone-buzz/);
  assert.match(sfx, /"offset"/);
});

test("a beat's music cue and effects pass through the core spec with defaults", () => {
  const spec = CoreSpecSchema.parse({
    title: "t",
    beats: [{ narration: "", musicCue: "cut", sfx: [{ name: "phone-buzz" }] }],
  });
  assert.equal(spec.beats[0]!.musicCue, "cut");
  assert.deepEqual(spec.beats[0]!.sfx, [{ name: "phone-buzz", offset: 0, volume: 0.8 }]);
  assert.equal(CoreSpecSchema.safeParse({ title: "t", beats: [{ musicCue: "louder" }] }).success, false);
});

test("offline edits can switch or drop the track", () => {
  const moved = offlineEdit(EXAMPLES.a, "use the lofi chill track please", ["lofi chill", "upbeat"]);
  assert.equal(moved.script.music, "lofi chill");
  const none = offlineEdit(EXAMPLES.b, "no music on this one", ["lofi chill"]);
  assert.equal(none.script.music, "none");
});
