import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { addAsset, assetsPrompt, describeAsset, listAssets, takeAssetPath } from "../src/take/assets";
import { inspectGlb } from "../src/take/glb";
import { boxGlb } from "./glb";

function library(files: Record<string, Buffer | string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hpg-assets-"));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

test("inspectGlb measures the default scene through its node transforms", () => {
  const dir = library({ "box.glb": boxGlb({ w: 1, h: 2, d: 3, scale: 2, seconds: 1.5 }) });
  try {
    const s = inspectGlb(path.join(dir, "box.glb"));
    // Turned 90 degrees about y, so width and depth swap; then doubled.
    assert.deepEqual(
      s.size.map((v) => Number(v.toFixed(6))),
      [6, 4, 2],
    );
    assert.equal(s.triangles, 12);
    assert.deepEqual(s.animations, [{ name: "Spin", seconds: 1.5 }]);
    assert.equal(s.skinned, false);
    assert.equal(s.unsupported, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("inspectGlb flags files the player has no decoder for and refuses non-glb files", () => {
  const dir = library({
    "draco.glb": boxGlb({ extensionsRequired: ["KHR_draco_mesh_compression"] }),
    "text.glb": "not a model",
  });
  try {
    assert.match(inspectGlb(path.join(dir, "draco.glb")).unsupported ?? "", /Draco/);
    assert.throws(() => inspectGlb(path.join(dir, "text.glb")), /not a \.glb/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("listAssets finds .glb files in subfolders, named by their path without the extension", () => {
  const dir = library({
    "zebra.glb": boxGlb(),
    "city/Car Red.glb": boxGlb(),
    "city/readme.txt": "ignored",
    "broken.glb": "glTF but not really",
  });
  try {
    const assets = listAssets(dir);
    assert.deepEqual(
      assets.map((a) => a.name),
      ["broken", "city/Car Red", "zebra"],
    );
    assert.match(assets[0]!.problem ?? "", /could not be read/);
    assert.equal(assets[2]!.problem, null);
    assert.deepEqual(listAssets(path.join(dir, "missing")), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assetsPrompt lists usable models with their size and clips, and says so when there are none", (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);
  const dir = library({
    "robot.glb": boxGlb(),
    "draco.glb": boxGlb({ extensionsRequired: ["KHR_draco_mesh_compression"] }),
  });
  try {
    const assets = listAssets(dir);
    const robot = assets.find((a) => a.name === "robot")!;
    assert.match(describeAsset(robot), /^- robot: 6 x 4 x 2 m, 12 triangles, \d+ KB; animations: Spin 1\.5s$/);
    const text = assetsPrompt(assets);
    assert.match(text, /^3D ASSETS/);
    assert.match(text, /mcp__take__asset/);
    assert.match(text, /- robot: /);
    assert.doesNotMatch(text, /draco/);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(assetsPrompt([]), /Build every model from primitives/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("addAsset copies a listed model into the take's src/assets and nothing else", () => {
  const lib = library({
    "city/car.glb": boxGlb(),
    "draco.glb": boxGlb({ extensionsRequired: ["KHR_draco_mesh_compression"] }),
  });
  const take = mkdtempSync(path.join(tmpdir(), "hpg-take-"));
  try {
    const assets = listAssets(lib);
    assert.equal(addAsset(take, "City/Car.glb", assets).name, "city/car");
    const copied = path.join(take, ...takeAssetPath("city/car").split("/"));
    assert.equal(copied, path.join(take, "src", "assets", "city", "car.glb"));
    assert.deepEqual(readFileSync(copied), readFileSync(path.join(lib, "city", "car.glb")));

    assert.throws(() => addAsset(take, "red car", assets), /No 3D asset is named "red car"\. Similar: city\/car\./);
    assert.throws(() => addAsset(take, "../../.env", assets), /No 3D asset/);
    assert.throws(() => addAsset(take, "draco", assets), /draco cannot be used: .*Draco/);
    assert.throws(() => addAsset(take, "anything", []), /library is empty/);
    assert.equal(existsSync(path.join(take, "src", "assets", "draco.glb")), false);
  } finally {
    rmSync(lib, { recursive: true, force: true });
    rmSync(take, { recursive: true, force: true });
  }
});
