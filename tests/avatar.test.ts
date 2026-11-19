import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleSpec } from "./fixture";
import { EXAMPLES } from "../src/script/examples";
import { toGenerated, toScenarioSpec } from "../src/script/lift";
import { GeneratedSpecSchema } from "../src/script/schema";
import { AvatarSchema, parseSpec, type ScenarioSpec } from "../src/starter/spec/schema";
import { resolveActors, resolveSubject } from "../src/starter/spec/timing";

const base = exampleSpec();

/** The example with one avatar extra that waves, walks over and then dances. */
function withAvatar(): ScenarioSpec {
  return parseSpec({
    ...base,
    style: "blocks",
    actors: [
      {
        name: "the neighbour",
        kind: "person",
        avatar: { shirt: "#2f9e5b", hat: "cap" },
        size: 0.6,
        keyframes: [
          { beat: 0, x: 0, z: -1, action: "wave" },
          { beat: 1, x: 0, z: -1 },
          { beat: 1, offset: 2, x: 3, z: -1, action: "dance" },
        ],
      },
    ],
  });
}

test("an extra can be an avatar instead of parts, with defaults for every field it leaves out", () => {
  const spec = withAvatar();
  const avatar = spec.actors[0]!.avatar!;
  assert.equal(spec.style, "blocks");
  assert.deepEqual(spec.actors[0]!.parts, []);
  assert.equal(avatar.shirt, "#2f9e5b");
  assert.equal(avatar.hat, "cap");
  assert.equal(avatar.face, "smile");
  assert.equal(avatar.build, "classic");
  assert.deepEqual(avatar.held, []);
  const neither = { name: "nobody", kind: "person", size: 0.6, keyframes: [{ beat: 0, x: 0, z: 0 }] };
  assert.throws(() => parseSpec({ ...base, actors: [neither] }), /parts or an avatar/);
  assert.throws(() => AvatarSchema.parse({ face: "wink" }));
});

test("the subject can be an avatar without parts or a shape", () => {
  const subject = { label: "YOU", avatar: {}, baseSize: 0.6 };
  assert.ok(parseSpec({ ...base, subject }).subject.avatar);
  assert.throws(() => parseSpec({ ...base, subject: { label: "YOU" } }), /parts, a shape or an avatar/);
});

test("an avatar does its keyframe's action while it stands, and walks between keyframes", () => {
  const spec = withAvatar();
  const t1 = spec.beats[1]!.at;
  const waving = resolveActors(spec, 1.5)[0]!;
  assert.deepEqual([waving.action, waving.moving, waving.since], ["wave", false, 1.5]);
  // Keyframes without an action stand idle.
  assert.equal(resolveActors(spec, t1 + 0)[0]!.action, "idle");
  const walking = resolveActors(spec, t1 + 1)[0]!;
  assert.ok(walking.moving && Math.abs(walking.speed - 1.5) < 1e-9, "three units in two seconds");
  const dancing = resolveActors(spec, t1 + 3)[0]!;
  assert.deepEqual([dancing.action, dancing.moving], ["dance", false]);
  assert.ok(Math.abs(dancing.since - 1) < 1e-9, "seconds since it arrived, for the dance cycle");
  assert.equal(resolveSubject(spec, 7).since, 7, "a subject with no path idles on the video clock");
});

test("the blocky town example lifts avatars, held models and actions, and round-trips", () => {
  const script = EXAMPLES.f;
  const spec = toScenarioSpec(script, { id: "town", seed: null });
  assert.equal(spec.style, "blocks");
  assert.equal(spec.subject.parts, undefined, "an avatar subject carries no part model");
  assert.ok(spec.subject.avatar);
  assert.ok(Math.abs(spec.subject.baseSize - 0.6) < 0.01, "a 1.7 metre person");
  const people = spec.actors.filter((a) => a.avatar);
  assert.ok(people.length >= 3);
  assert.ok(
    people.every((a) => a.avatar!.held.length > 0),
    "everyone in town holds a duck",
  );
  const actions = new Set(spec.actors.flatMap((a) => a.keyframes.map((k) => k.action ?? "idle")));
  for (const a of ["wave", "dance", "point"] as const) assert.ok(actions.has(a), `someone does ${a}`);
  const back = toGenerated(spec);
  assert.deepEqual(back.subjectAvatar, spec.subject.avatar);
  assert.deepEqual(back.extras[0]!.avatar, spec.actors[0]!.avatar);
  assert.deepEqual(GeneratedSpecSchema.parse(back), back);
});
