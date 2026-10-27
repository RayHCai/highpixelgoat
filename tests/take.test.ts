import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PROJECT_ROOT } from "../src/shared/paths";
import { isTakeImport, takeModuleRefusal } from "../src/take/confine";
import { CoreSpecSchema, specLabel } from "../src/take/core";
import { determinismProblems } from "../src/take/site";
import { fitNarration } from "../src/starter/spec/timing";

/** A spec in a shape the starter schema has never heard of: a take that extended its own. */
const extended = {
  title: "The moon falls into the Pacific",
  voice: { persona: "dry", pace: "brisk" },
  scenes: [{ id: "orbit", sky: "#000010" }, { id: "beach" }],
  beats: [
    { narration: "What if the moon just let go.", scene: 0, camera: { from: [0, 2, 9] } },
    { narration: "Tuesday, the tide never comes back.", scene: 1, sunset: 0.4 },
  ],
};

test("the server reads only the core of a take's spec and passes the rest through", () => {
  const spec = CoreSpecSchema.parse(extended);
  assert.deepEqual(spec.format, { width: 1080, height: 1920, fps: 30, duration: 35 });
  assert.deepEqual((spec as Record<string, unknown>).scenes, extended.scenes);
  assert.equal((spec.beats[1] as Record<string, unknown>).sunset, 0.4);
  assert.equal(specLabel(spec, "style"), null);
  assert.equal(specLabel({ world: { terrain: "moon" } }, "world", "terrain"), "moon");
});

test("the stage size is fixed and every beat needs to exist", () => {
  assert.equal(CoreSpecSchema.safeParse({ ...extended, format: { width: 1920, height: 1080 } }).success, false);
  assert.equal(CoreSpecSchema.safeParse({ ...extended, beats: [] }).success, false);
  assert.equal(CoreSpecSchema.safeParse({ ...extended, title: "" }).success, false);
});

test("timing the narration keeps a take's own beat fields", () => {
  const timed = fitNarration(CoreSpecSchema.parse(extended));
  assert.equal(timed.beats[1]!.at! > timed.beats[0]!.at!, true);
  assert.deepEqual((timed.beats[0] as Record<string, unknown>).camera, { from: [0, 2, 9] });
  assert.deepEqual((timed as Record<string, unknown>).scenes, extended.scenes);
});

test("the determinism check flags wall-clock and random calls outside the player shell", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hpg-take-"));
  try {
    mkdirSync(path.join(dir, "src", "scene"), { recursive: true });
    mkdirSync(path.join(dir, "src", "player"), { recursive: true });
    writeFileSync(
      path.join(dir, "src", "scene", "sky.ts"),
      [
        "export const a = Math.random();",
        "// Math.random() is fine in a comment",
        "export const b = Date.now();",
        "export const c = new Date ();",
        "export const d = 1;",
      ].join("\n"),
    );
    writeFileSync(path.join(dir, "src", "player", "main.ts"), "let last = performance.now();\n");
    const problems = determinismProblems(dir);
    assert.equal(problems.length, 3, problems.join("\n"));
    assert.match(problems[0]!, /^src\/scene\/sky\.ts:1:/);
    assert.ok(problems.every((p) => !p.includes("player")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a take's bundle reads only its own folder and the packages", () => {
  const dir = path.join(PROJECT_ROOT, "out", "demo-1a2b", "a");
  const slash = (p: string) => p.replace(/\\/g, "/");
  assert.equal(isTakeImport(dir, slash(path.join(dir, "src/scene/world.ts"))), true);
  assert.equal(isTakeImport(dir, `${slash(path.join(dir, "src/assets/sky.png"))}?url`), true);
  assert.equal(isTakeImport(dir, slash(path.join(PROJECT_ROOT, "node_modules/three/build/three.module.js"))), true);
  assert.equal(isTakeImport(dir, "\0vite/preload-helper.js"), true);
  assert.equal(isTakeImport(dir, `${slash(path.join(PROJECT_ROOT, ".env"))}?raw`), false);
  assert.equal(isTakeImport(dir, slash(path.join(dir, "..", "b", "src", "x.ts"))), false);
  assert.equal(isTakeImport(dir, slash(path.join(dir, "..", "a-other", "x.ts"))), false);
});

test("a take's code may not pull files in through workers, stylesheets or import.meta.url", () => {
  const dir = path.join(PROJECT_ROOT, "out", "demo-1a2b", "a");
  const file = (name: string) => path.join(dir, "src", name).replace(/\\/g, "/");
  assert.equal(takeModuleRefusal(dir, file("scene/world.ts"), "export const x = 1;"), null);
  assert.equal(takeModuleRefusal(dir, `${file("hud/look.css")}?raw`, ""), null);
  assert.match(takeModuleRefusal(dir, file("hud/look.css"), "") ?? "", /stylesheets/);
  assert.match(takeModuleRefusal(dir, `${file("hud/look.css")}?inline`, "") ?? "", /stylesheets/);
  assert.match(takeModuleRefusal(dir, `${file("scene/w.ts")}?worker&inline`, "") ?? "", /workers/);
  assert.match(
    takeModuleRefusal(dir, file("scene/x.ts"), 'new URL("../../.env", import.meta.url)') ?? "",
    /import\.meta\.url/,
  );
  // Package code is trusted.
  const pkg = path.join(PROJECT_ROOT, "node_modules", "three", "x.js").replace(/\\/g, "/");
  assert.equal(takeModuleRefusal(dir, pkg, "new URL('./w.js', import.meta.url)"), null);
});
