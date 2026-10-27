import assert from "node:assert/strict";
import { test } from "node:test";
import { cellId, fbm, makeRng, valueNoise } from "../src/starter/scene/noise";

test("makeRng is deterministic per seed and uniform in [0, 1)", () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const c = makeRng(43);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  const seqC = Array.from({ length: 5 }, () => c());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  const r = makeRng(7);
  let sum = 0;
  for (let i = 0; i < 10000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
    sum += v;
  }
  assert.ok(Math.abs(sum / 10000 - 0.5) < 0.02, "mean should be near 0.5");
});

test("valueNoise and fbm stay in range, are continuous and seed-dependent", () => {
  for (let i = 0; i < 200; i++) {
    const x = Math.sin(i) * 50;
    const y = Math.cos(i * 1.3) * 50;
    const v = valueNoise(x, y, 1);
    const f = fbm(x, y, 1);
    assert.ok(v >= 0 && v <= 1, `valueNoise out of range: ${v}`);
    assert.ok(f >= 0 && f <= 1, `fbm out of range: ${f}`);
  }
  const here = fbm(10.5, 3.25, 9);
  const near = fbm(10.51, 3.25, 9);
  assert.ok(Math.abs(here - near) < 0.05, "noise should be continuous");
  assert.notEqual(fbm(10.5, 3.25, 9), fbm(10.5, 3.25, 10));
  assert.equal(fbm(10.5, 3.25, 9), here, "same input gives same output");
});

test("cellId gives constant ids inside a patch and varies between patches", () => {
  const a = cellId(0.1, 0.1, 5, 7);
  const b = cellId(0.6, 0.4, 5, 7);
  assert.equal(a, b, "neighbouring points share a patch");
  const ids = new Set<number>();
  for (let x = -100; x <= 100; x += 10) for (let z = -100; z <= 100; z += 10) ids.add(cellId(x, z, 5, 7));
  assert.ok(ids.size > 50, `expected many distinct patches, got ${ids.size}`);
});
