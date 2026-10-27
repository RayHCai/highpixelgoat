import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyParts, normaliseParts, partsTop, subjectParts } from "../src/starter/spec/parts";
import { parseSpec, type Part } from "../src/starter/spec/schema";
import { exampleSpec } from "./fixture";

const box = (x: number, y: number, z: number, w: number, h: number, d: number, extra: Partial<Part> = {}): Part => ({
  kind: "box",
  x,
  y,
  z,
  w,
  h,
  d,
  rx: 0,
  ry: 0,
  rz: 0,
  color: "#ffffff",
  pattern: "solid",
  ...extra,
});

test("normaliseParts fits the model into the unit space", () => {
  const parts = normaliseParts([box(10, 5, 0, 2, 2, 8), box(10, 7, 0, 1, 2, 1)]);
  assert.equal(parts[0]!.d, 1, "the longest side becomes 1");
  assert.equal(parts[0]!.x, 0, "centred on x");
  assert.equal(parts[0]!.z, 0, "centred on z");
  assert.ok(Math.abs(parts[0]!.y - 0.125) < 1e-9, "the lowest point rests at y = 0");
  assert.ok(Math.abs(partsTop(parts) - 0.5) < 1e-9);
});

test("normaliseParts repairs sizes, drops extras and leaves rotation and colour alone", () => {
  const many = Array.from({ length: 60 }, (_, i) => box(i, 0.5, 0, -1, 0, 1, { rz: 30, color: "#123456" }));
  const parts = normaliseParts(many);
  assert.equal(parts.length, 40);
  assert.ok(parts.every((p) => p.w > 0 && p.h > 0 && p.d > 0));
  assert.equal(parts[0]!.rz, 30);
  assert.equal(parts[0]!.color, "#123456");
});

test("legacy shapes become parts in the subject colours", () => {
  const human = legacyParts("humanoid", "solid", ["#aaaaaa", "#bbbbbb"], 1);
  assert.equal(human.length, 6);
  const blob = legacyParts("blob", "checker", ["#6b4a2e", "#8f6a45"], 7);
  assert.ok(blob.every((p) => p.pattern === "checker" && p.color2 === "#8f6a45"));
  const coin = legacyParts("coin", "solid", ["#c8803a", "#000000"], 1);
  assert.equal(coin[0]!.kind, "cylinder");
});

test("a spec with the legacy shape still yields a normalised model", () => {
  const spec = exampleSpec();
  assert.equal(spec.subject.parts, undefined);
  const parts = subjectParts(spec);
  assert.ok(parts.length >= 4);
  const top = partsTop(parts);
  assert.ok(top > 0.6 && top <= 1, `the blob is wider than it is tall, so its top sits below 1 (${top})`);
});

test("the schema rejects a subject with neither parts nor a shape", () => {
  const spec = exampleSpec();
  assert.throws(() => parseSpec({ ...spec, subject: { label: "YOU", baseSize: 0.6 } }));
});
