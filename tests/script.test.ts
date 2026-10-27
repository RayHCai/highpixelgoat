import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_DEPTH, normaliseHex, toActor, toGenerated, toScenarioSpec, UNITS_PER_METRE } from "../src/script/lift";
import { cleanCaption, cleanHashtags, instagramText } from "../src/take/caption";
import { EXAMPLES } from "../src/script/examples";
import { offlineEdit } from "../src/script/offline";
import { EditResultSchema, GeneratedSpecSchema, type GeneratedSpec } from "../src/script/schema";
import { MAX_SHOT } from "../src/starter/spec/timing";

const wheel = {
  kind: "cylinder" as const,
  x: 0,
  y: 0.14,
  z: 0.3,
  w: 0.14,
  h: 0.1,
  d: 0.28,
  rx: 0,
  ry: 0,
  rz: 90,
  color: "#222222",
  pattern: "solid" as const,
  color2: "#222222",
};

const generated: GeneratedSpec = {
  mode: "scale",
  angle: "relatable",
  subjectKeyframes: [],
  weatherKind: "none",
  weatherColor: "#ffffff",
  extras: [
    {
      name: "a red hatchback",
      kind: "vehicle",
      sizeMetres: 4.5,
      parts: [
        {
          kind: "box",
          x: 0,
          y: 0.3,
          z: 0,
          w: 0.44,
          h: 0.26,
          d: 1,
          rx: 0,
          ry: 0,
          rz: 0,
          color: "b03a2e",
          pattern: "solid",
          color2: "b03a2e",
        },
        wheel,
      ],
      keyframes: [
        { beat: 0, offset: 0, x: -14, z: 0.5, face: 90, visible: true },
        { beat: 9, offset: 2, x: 0.4, z: 2, face: 90, visible: true },
        { beat: 2, offset: 99, x: 14, z: 0.5, face: 90, visible: false },
      ],
    },
  ],
  title: "A penny that doubles every day",
  style: "lowpoly",
  terrain: "island",
  seed: 21,
  subjectLabel: "YOUR PENNY",
  subjectParts: [
    {
      kind: "cylinder",
      x: 0,
      y: 1,
      z: 0,
      w: 4,
      h: 0.6,
      d: 4,
      rx: 0,
      ry: 0,
      rz: 0,
      color: "C8803A",
      pattern: "solid",
      color2: "not a colour",
    },
    {
      kind: "box",
      x: 0,
      y: 1.4,
      z: 0,
      w: 0.5,
      h: 0.1,
      d: 2,
      rx: 0,
      ry: 0,
      rz: 0,
      color: "red",
      pattern: "checker",
      color2: "#111111",
    },
  ],
  rule: "doubles every day",
  music: "",
  voicePersona: "buddy",
  voicePace: "brisk",
  beats: [
    {
      heading: "Day 1",
      stats: ["one cent"],
      narration: "You are given a penny and told it doubles every day.",
      subjectScale: 1,
      shot: 0,
      fall: 0,
      depth: 0,
      effects: [],
    },
    {
      heading: "Day 20",
      stats: ["$5,242", "a used car", "x", "too many"],
      narration: "",
      subjectScale: 524288,
      shot: 0,
      fall: 0.5,
      depth: 3,
      effects: ["debris", "debris", "shake"],
    },
    {
      heading: "Day 30",
      stats: [],
      narration: "It keeps going, and so does the paperwork.",
      subjectScale: 536870912,
      shot: 0,
      fall: 0,
      depth: 0,
      effects: ["flash"],
    },
  ],
  caption: "Would you take the penny?\nComment the day you would cash out.",
  hashtags: ["#Reels", "whatif", "what if", "whatif", "money"],
};

test("the generated schema accepts the model-shaped object", () => {
  assert.deepEqual(GeneratedSpecSchema.parse(generated), generated);
});

test("the edit result schema wraps a full script", () => {
  const parsed = EditResultSchema.parse({ reply: "Done.", changed: true, script: generated });
  assert.equal(parsed.script.beats.length, 3);
});

test("toScenarioSpec normalises colours, casing, counts and lays beats out from the narration", () => {
  const spec = toScenarioSpec(generated, { id: "penny", seed: null });
  assert.equal(spec.id, "penny");
  assert.equal(spec.world.seed, 21);
  const parts = spec.subject.parts!;
  assert.equal(parts[0]!.color, "#c8803a", "a bare hex colour gets its hash");
  assert.equal(parts[0]!.color2, undefined, "solid parts drop the second colour");
  assert.equal(parts[1]!.color, "#888888", "an unparseable colour falls back");
  assert.equal(parts[1]!.color2, "#111111");
  assert.equal(parts[0]!.w, 1, "the largest dimension is normalised to 1");
  assert.ok(Math.abs(parts[0]!.y - parts[0]!.h / 2) < 1e-9, "the model rests on the ground");
  assert.ok(Math.abs(parts[1]!.y - 0.175) < 1e-9, "other parts scale with it");
  assert.equal(spec.subject.baseSize, 0.9, "a flat model is enlarged up to one and a half times");
  assert.equal(spec.rule, "DOUBLES EVERY DAY");
  assert.deepEqual(spec.beats[0]!.stats, ["ONE CENT"]);
  assert.equal(spec.beats[1]!.stats.length, 3, "stats are capped at three lines");
  assert.equal(spec.beats[1]!.narration, "", "a silent beat keeps an empty narration");
  assert.deepEqual(spec.beats[1]!.effects, ["debris", "shake"], "duplicate effects are dropped");
  const ats = spec.beats.map((b) => b.at);
  for (let i = 1; i < ats.length; i++) assert.ok(ats[i]! > ats[i - 1]! + 2, `beat ${i} gets at least a minimum slot`);
  assert.ok(spec.format.duration > ats[ats.length - 1]! + 3, "the duration leaves an outro after the last beat");
});

test("a scale script keeps the subject put and ignores weather numbers without a weather kind", () => {
  const spec = toScenarioSpec(
    { ...generated, subjectKeyframes: [{ beat: 1, offset: 0, x: 2, z: 1, face: 0, visible: true }] },
    { id: "penny", seed: null },
  );
  assert.equal(spec.mode, "scale");
  assert.deepEqual(spec.subject.keyframes, [], "only a story moves the subject");
  assert.equal(spec.weather.kind, "none");
  assert.ok(
    spec.beats.every((b) => b.shot === 0 && b.fall === 0 && b.depth === 0),
    "no weather, no fall or depth; the camera frames the subject",
  );
});

test("a story lifts the subject path and the per-beat shots in metres", () => {
  const spec = toScenarioSpec(EXAMPLES.d, { id: "parents", seed: null });
  assert.equal(spec.mode, "story");
  assert.equal(spec.world.terrain, "livingroom");
  assert.equal(spec.subject.keyframes.length, EXAMPLES.d.subjectKeyframes.length);
  const out = spec.subject.keyframes.find((k) => k.z > 2)!;
  assert.equal(out.x, 0.6, "the subject may walk out of the front toward the camera; it is never pushed aside");
  assert.ok(Math.abs(spec.beats[0]!.shot - 4 * UNITS_PER_METRE) < 1e-3, "a 4 metre shot in world units");
  assert.ok(spec.beats[3]!.shot > spec.beats[0]!.shot, "the shot widens when the house should be in frame");
  assert.equal(spec.beats[0]!.subjectScale, 0.6, "a child grows gently");
  const back = toGenerated(spec);
  assert.equal(back.mode, "story");
  assert.equal(back.subjectKeyframes.length, spec.subject.keyframes.length);
  assert.ok(Math.abs(back.beats[0]!.shot - 4) < 0.05, "shots round-trip to metres");
  assert.deepEqual(GeneratedSpecSchema.parse(back), back);
});

test("an overview lifts the weather, clamps the shot to the widest view and the depth to the cap", () => {
  const spec = toScenarioSpec(EXAMPLES.e, { id: "nyc", seed: null });
  assert.equal(spec.mode, "overview");
  assert.deepEqual(spec.weather, { kind: "snow", color: "#ffffff" });
  assert.deepEqual(spec.subject.keyframes, []);
  assert.ok(Math.abs(spec.beats[0]!.depth - 0.02 * UNITS_PER_METRE) < 1e-6, "a dusting in world units");
  assert.equal(spec.beats[5]!.depth, Math.min(MAX_DEPTH, 300 * UNITS_PER_METRE));
  assert.equal(spec.beats[3]!.shot, MAX_SHOT, "a 200 metre shot is the widest the camera goes");
  assert.equal(spec.beats[2]!.fall, 1);
  for (let i = 1; i < spec.beats.length; i++) {
    assert.ok(spec.beats[i]!.depth >= spec.beats[i - 1]!.depth, "the snow only gets deeper");
  }
  const back = toGenerated(spec);
  assert.equal(back.weatherKind, "snow");
  assert.ok(Math.abs(back.beats[2]!.depth - 3) < 0.05, "depth round-trips to metres");
  assert.deepEqual(GeneratedSpecSchema.parse(back), back);
});

test("an explicit seed wins over the model's, and a fractional model seed is truncated", () => {
  assert.equal(toScenarioSpec(generated, { id: "penny", seed: 5 }).world.seed, 5);
  assert.equal(toScenarioSpec({ ...generated, seed: 21.7 }, { id: "penny", seed: null }).world.seed, 21);
});

test("toGenerated round-trips a lifted spec back into the model shape", () => {
  const spec = toScenarioSpec(generated, { id: "penny", seed: null });
  assert.deepEqual(spec.voice, { persona: "buddy", pace: "brisk" });
  const back = toGenerated(spec, { caption: generated.caption, hashtags: generated.hashtags });
  assert.equal(back.title, generated.title);
  assert.equal(back.rule, "DOUBLES EVERY DAY");
  assert.equal(back.beats.length, 3);
  assert.equal(back.beats[2]!.narration, generated.beats[2]!.narration);
  assert.equal(back.voicePersona, "buddy");
  assert.equal(back.subjectParts.length, 2);
  assert.equal(back.subjectParts[0]!.color2, "#c8803a", "solid parts repeat their colour for the strict schema");
  assert.deepEqual(GeneratedSpecSchema.parse(back), back);
});

test("extras are lifted into life-sized actors with keyframes clamped to the beats and kept out of the camera line", () => {
  const spec = toScenarioSpec(generated, { id: "penny", seed: null });
  assert.equal(spec.actors.length, 1);
  const car = spec.actors[0]!;
  assert.equal(car.name, "a red hatchback");
  assert.ok(Math.abs(car.size - 4.5 * UNITS_PER_METRE) < 0.01, "size is converted from metres to world units");
  assert.equal(car.parts[0]!.color, "#b03a2e");
  assert.equal(car.keyframes[1]!.beat, 2, "a beat past the end is clamped to the last beat");
  assert.equal(car.keyframes[1]!.x, 1.6, "a keyframe in front of the subject is pushed to the side");
  assert.equal(car.keyframes[2]!.offset, 8, "offsets are capped");
  assert.equal(car.keyframes[2]!.visible, false);
  assert.equal(toActor({ ...generated.extras[0]!, keyframes: [] }, 3), null);
  const back = toGenerated(spec);
  assert.equal(back.extras.length, 1);
  assert.ok(Math.abs(back.extras[0]!.sizeMetres - 4.5) < 0.05);
  assert.deepEqual(GeneratedSpecSchema.parse(back), back);
});

test("cleanCaption strips emoji, turns dashes into sentences and keeps three short lines", () => {
  const messy =
    "Every bark doubles your dog \u2014 the postman is two houses away \ud83d\udc15\nFourteen barks \u2013 taller than Everest \u2764\ufe0f\nTag a friend\nA fourth line that should go";
  const clean = cleanCaption(messy);
  assert.equal(
    clean,
    "Every bark doubles your dog. The postman is two houses away.\nFourteen barks. Taller than Everest.\nTag a friend.",
  );
  assert.ok(!/[\u2014\u2013]/.test(clean) && !/\p{Extended_Pictographic}/u.test(clean));
  assert.equal(cleanCaption("one -- two - three"), "One. Two. Three.");
  assert.equal(cleanCaption("Would you take it?"), "Would you take it?");
  assert.ok(cleanCaption("x".repeat(300)).length <= 220);
  for (const ex of Object.values(EXAMPLES)) {
    const lines = cleanCaption(ex.caption).split("\n");
    assert.ok(lines.length <= 3 && lines[0]!.length <= 60, `example caption is hooky: ${lines[0]}`);
  }
});

test("hashtags are cleaned and the Instagram text is caption, blank line, tags", () => {
  assert.deepEqual(cleanHashtags(generated.hashtags), ["reels", "whatif", "money"]);
  assert.equal(instagramText(" Hook line \n", ["a", "#b"]), "Hook line.\n\n#a #b");
  assert.equal(instagramText("", []), "");
});

test("the built-in example scripts satisfy the schema and lift into realistic sets", () => {
  for (const [id, script] of Object.entries(EXAMPLES)) {
    assert.deepEqual(GeneratedSpecSchema.parse(script), script, `example ${id}`);
    const spec = toScenarioSpec(script, { id: `x-${id}`, seed: null });
    assert.ok(["bedroom", "kitchen", "street", "livingroom", "city"].includes(spec.world.terrain));
    assert.ok(spec.subject.parts!.length >= 3, `example ${id} has a real model`);
    assert.ok(spec.actors.length >= 2, `example ${id} has extras`);
    assert.ok(
      spec.actors.every((a) => a.keyframes[0]!.beat === 0),
      "every extra starts at the first beat",
    );
    assert.ok(spec.format.duration > 25 && spec.format.duration < 50, `example ${id} runs ${spec.format.duration}s`);
    assert.ok(script.hashtags.length >= 15);
  }
  assert.deepEqual(
    Object.values(EXAMPLES).map((s) => s.mode),
    ["scale", "scale", "scale", "story", "overview"],
    "the examples cover every format",
  );
  const moved = offlineEdit(EXAMPLES.a, "move it to the living room");
  assert.equal(moved.changed, true);
  assert.equal(moved.script.terrain, "livingroom");
});

test("normaliseHex accepts with or without a hash and falls back otherwise", () => {
  assert.equal(normaliseHex("#ABCDEF", "#000000"), "#abcdef");
  assert.equal(normaliseHex("abcdef", "#000000"), "#abcdef");
  assert.equal(normaliseHex("red", "#000000"), "#000000");
});
