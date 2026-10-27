import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleSpec } from "./fixture";
import { slugify } from "../src/shared/text";
import { parseSpec, type ScenarioSpec } from "../src/starter/spec/schema";
import {
  fitBeats,
  frameCount,
  MAX_SHOT,
  MAX_VISUAL_SIZE,
  OVERVIEW_SHOT,
  resolveActors,
  resolveState,
  resolveSubject,
  shotFor,
  STORY_SHOT,
  visualSize,
} from "../src/starter/spec/timing";

const example = exampleSpec();

function withBeats(spec: ScenarioSpec, ats: number[]): ScenarioSpec {
  return { ...spec, beats: ats.map((at, i) => ({ ...spec.beats[Math.min(i, spec.beats.length - 1)]!, at })) };
}

test("example scenario parses with defaults applied", () => {
  assert.equal(example.format.fps, 30);
  assert.equal(example.beats.length, 8);
  assert.equal(frameCount(example), 36 * 30);
});

test("schema rejects bad colours and ids", () => {
  assert.throws(() => parseSpec({ ...example, id: "Not A Slug" }));
  assert.throws(() => parseSpec({ ...example, subject: { ...example.subject, colors: ["red", "#000000"] } }));
});

test("slugify produces url-safe ids", () => {
  assert.equal(slugify("Your cheeks DOUBLE every hour!"), "your-cheeks-double-every-hour");
  assert.equal(slugify("???"), "scenario");
});

test("fitBeats leaves fitting timings alone", () => {
  const fitted = fitBeats(example);
  assert.deepEqual(
    fitted.beats.map((b) => b.at),
    example.beats.map((b) => b.at),
  );
});

test("fitBeats rescales overflowing timings into the duration with an outro", () => {
  const spec = withBeats({ ...example, format: { ...example.format, duration: 20 } }, [0, 10, 20, 40]);
  const fitted = fitBeats(spec);
  const ats = fitted.beats.map((b) => b.at);
  assert.equal(ats[0], 0);
  assert.ok(ats[ats.length - 1]! <= 17.0001, `last beat ${ats[ats.length - 1]} should leave a 3s outro`);
  for (let i = 1; i < ats.length; i++) assert.ok(ats[i]! > ats[i - 1]!, "beats stay strictly increasing");
});

test("fitBeats pulls a late first beat into the hook window and sorts", () => {
  const fitted = fitBeats(withBeats(example, [9, 3, 6]));
  const ats = fitted.beats.map((b) => b.at);
  assert.ok(ats[0]! <= 0.4);
  assert.deepEqual(
    [...ats].sort((a, b) => a - b),
    ats,
  );
});

test("resolveState holds the first scale before the first beat and reaches each beat target", () => {
  const before = resolveState(example, 0);
  assert.equal(before.beatIndex, 0);
  assert.equal(before.subjectScale, 1);
  const settled = resolveState(example, example.beats[3]!.at + 2);
  assert.equal(settled.beatIndex, 3);
  assert.ok(Math.abs(settled.subjectScale - 32) < 1e-9);
  assert.ok(Math.abs(settled.cameraSize - settled.subjectSize) < 1e-9, "camera and subject agree once settled");
});

test("resolveState is a pure function of time", () => {
  const a = resolveState(example, 18.37);
  resolveState(example, 2);
  resolveState(example, 33);
  const b = resolveState(example, 18.37);
  assert.deepEqual(a, b);
});

test("subject overshoots briefly and the camera never does", () => {
  const beat = example.beats[4]!;
  const mid = resolveState(example, beat.at + 0.7);
  assert.ok(mid.subjectScale > beat.subjectScale, "easeOutBack overshoot");
  assert.ok(mid.cameraSize <= visualSize(example, beat.subjectScale) + 1e-9);
});

test("visualSize compresses extreme growth under the cap and preserves modest growth", () => {
  const max = Math.max(...example.beats.map((b) => b.subjectScale));
  assert.ok(Math.abs(visualSize(example, max) - MAX_VISUAL_SIZE) < 1e-6);
  assert.ok(visualSize(example, 1) === example.subject.baseSize);
  const modest = { ...example, beats: example.beats.slice(0, 3) };
  assert.equal(visualSize(modest, 10), example.subject.baseSize * 10);
});

test("resolveActors glides extras between keyframes, faces them along the way, and hides them on cue", () => {
  const box = {
    kind: "box" as const,
    x: 0,
    y: 0.5,
    z: 0,
    w: 0.4,
    h: 1,
    d: 0.3,
    rx: 0,
    ry: 0,
    rz: 0,
    color: "#ffffff",
    pattern: "solid" as const,
  };
  const spec: ScenarioSpec = {
    ...example,
    actors: [
      {
        name: "walker",
        kind: "person",
        parts: [box],
        size: 0.6,
        keyframes: [
          { beat: 0, offset: 0, x: -3, z: -2, face: 0, visible: true },
          { beat: 2, offset: 1, x: 3, z: -2, face: 90, visible: true },
          { beat: 4, offset: 0, x: 3, z: -2, face: 90, visible: false },
        ],
      },
    ],
  };
  const t1 = example.beats[2]!.at + 1;
  const before = resolveActors(spec, -1)[0]!;
  assert.deepEqual([before.x, before.z, before.visible, before.moving], [-3, -2, true, false]);
  const mid = resolveActors(spec, t1 / 2)[0]!;
  assert.ok(mid.x > -3 && mid.x < 3, "between the keyframes");
  assert.ok(mid.moving && mid.y > 0, "a walking person bobs");
  assert.ok(Math.abs(mid.ry - Math.PI / 2) < 1e-9, "faces the direction of travel (+x)");
  const arrived = resolveActors(spec, t1 + 0.5)[0]!;
  assert.deepEqual([arrived.x, arrived.moving, arrived.visible], [3, false, true]);
  assert.ok(Math.abs(arrived.ry - Math.PI / 2) < 1e-9, "stands facing its keyframe direction");
  const gone = resolveActors(spec, example.beats[4]!.at + 0.1)[0]!;
  assert.equal(gone.visible, false);
  assert.deepEqual(resolveActors(example, 5), [], "no extras, no states");
});

function withShots(spec: ScenarioSpec, mode: ScenarioSpec["mode"], shots: number[]): ScenarioSpec {
  return { ...spec, mode, beats: spec.beats.map((b, i) => ({ ...b, subjectScale: 1, shot: shots[i] ?? 0 })) };
}

test("the camera frames by the mode when a beat has no shot, and never frames the subject out", () => {
  for (const b of example.beats) {
    assert.ok(
      Math.abs(shotFor(example, b) - visualSize(example, b.subjectScale)) < 1e-9,
      "scale mode frames the subject",
    );
  }
  const story = withShots(example, "story", [0, 3, 0.1]);
  assert.equal(shotFor(story, story.beats[0]!), STORY_SHOT, "a story holds a room-sized shot by default");
  assert.equal(shotFor(story, story.beats[1]!), 3, "a written shot wins");
  assert.equal(
    shotFor(story, story.beats[2]!),
    story.subject.baseSize,
    "a shot tighter than the subject grows to fit it",
  );
  const overview = withShots(example, "overview", [0, 500]);
  assert.equal(shotFor(overview, overview.beats[0]!), OVERVIEW_SHOT, "an overview holds a block by default");
  assert.equal(shotFor(overview, overview.beats[1]!), MAX_SHOT, "and never wider than the widest shot");
  const grown = { ...example, mode: "scale" as const, beats: example.beats.map((b) => ({ ...b, shot: 0.2 })) };
  const last = grown.beats[grown.beats.length - 1]!;
  assert.ok(
    Math.abs(shotFor(grown, last) - visualSize(grown, last.subjectScale)) < 1e-9,
    "a tiny shot cannot hide a grown subject",
  );
});

test("the camera eases between the shots of consecutive beats and settles on the new one", () => {
  const story = withShots(example, "story", [2, 8, 8]);
  const b1 = story.beats[1]!;
  const before = resolveState(story, b1.at - 0.1);
  assert.equal(before.cameraSize, 2);
  const mid = resolveState(story, b1.at + 0.3);
  assert.ok(mid.cameraSize > 2 && mid.cameraSize < 8, `eases between the shots, got ${mid.cameraSize}`);
  assert.ok(Math.abs(resolveState(story, b1.at + 2).cameraSize - 8) < 1e-9);
  assert.equal(
    resolveState(story, b1.at + 2).subjectSize,
    story.subject.baseSize,
    "the subject itself stays life-sized",
  );
});

test("the subject walks its own keyframes and the camera focus follows; without them it stays at the origin", () => {
  assert.deepEqual(resolveSubject(example, 5), { x: 0, z: 0, y: 0, ry: 0, visible: true, moving: false });
  const walking: ScenarioSpec = {
    ...example,
    mode: "story",
    subject: {
      ...example.subject,
      keyframes: [
        { beat: 0, offset: 0, x: 0, z: 0, face: 0, visible: true },
        { beat: 1, offset: 0, x: 0, z: 0, face: 0, visible: true },
        { beat: 1, offset: 2, x: 4, z: 0, face: 90, visible: true },
        { beat: 2, offset: 0, x: 4, z: 0, face: 90, visible: false },
      ],
    },
  };
  const t1 = walking.beats[1]!.at;
  const mid = resolveState(walking, t1 + 1).subjectAt;
  assert.ok(mid.x > 0 && mid.x < 4 && mid.moving, "half way along the walk");
  assert.ok(Math.abs(mid.ry - Math.PI / 2) < 1e-9, "faces the way it walks");
  assert.ok(mid.y > 0, "bobs as it walks");
  const arrived = resolveState(walking, t1 + 2.5).subjectAt;
  assert.deepEqual([arrived.x, arrived.visible, arrived.moving], [4, true, false]);
  assert.equal(resolveState(walking, walking.beats[2]!.at + 0.1).subjectAt.visible, false, "hidden once it has left");
});

test("weather piles up to the beat's depth as the beat lands and the fall ramps in", () => {
  const snowy: ScenarioSpec = {
    ...example,
    weather: { kind: "snow", color: "#ffffff" },
    beats: example.beats.map((b, i) => ({ ...b, fall: i === 0 ? 0 : 1, depth: i < 1 ? 0 : 2 })),
  };
  const b1 = snowy.beats[1]!;
  const b2 = snowy.beats[2]!;
  assert.deepEqual(resolveState(snowy, 0).weather, { fall: 0, depth: 0 });
  const rising = resolveState(snowy, b1.at + 0.9).weather;
  assert.ok(rising.depth > 0 && rising.depth < 2, `still piling up a moment after the beat lands, got ${rising.depth}`);
  assert.ok(
    Math.abs(resolveState(snowy, b1.at + 2.5).weather.depth - 2) < 1e-9,
    "at the written depth while the line is read",
  );
  assert.equal(rising.fall, 1);
  assert.ok(
    resolveState(snowy, b1.at + 0.2).weather.fall > 0 && resolveState(snowy, b1.at + 0.2).weather.fall < 1,
    "the fall ramps in",
  );
  assert.equal(resolveState(snowy, b2.at + 0.5).weather.depth, 2, "holds once nothing more is written");
  assert.deepEqual(resolveState(example, 10).weather, { fall: 0, depth: 0 }, "no weather by default");
});

test("effects carry their age from the active beat", () => {
  const s = resolveState(example, example.beats[6]!.at + 0.5);
  const names = s.effects.map((e) => e.name).sort();
  assert.deepEqual(names, ["debris", "flash", "shake"]);
  for (const e of s.effects) assert.ok(Math.abs(e.age - 0.5) < 1e-9);
});
