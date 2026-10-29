import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildCharacter, CHARACTERS } from "../src/take/characters";
import { inspectGlb } from "../src/take/glb";
import { encodeGlb, type GlbDocument, type GlbGeometry } from "../src/take/glb-writer";

function boxGeometry(w: number, h: number, d: number): GlbGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  return {
    positions: Float32Array.from(g.getAttribute("position").array),
    normals: Float32Array.from(g.getAttribute("normal").array),
    indices: Uint16Array.from(g.getIndex()!.array),
  };
}

/** Inspect a document the way the asset library does: written to disk and read back. */
function inspect(doc: GlbDocument) {
  const dir = mkdtempSync(path.join(tmpdir(), "hpg-glb-"));
  try {
    const file = path.join(dir, "model.glb");
    writeFileSync(file, encodeGlb(doc));
    return inspectGlb(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Load a document with the same loader the player uses. */
function load(doc: GlbDocument): Promise<GLTF> {
  const buffer = encodeGlb(doc);
  const bytes = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(bytes).set(buffer);
  return new Promise((resolve, reject) => new GLTFLoader().parse(bytes, "", resolve, reject));
}

const half = Math.SQRT1_2;
const spinning: GlbDocument = {
  geometries: [boxGeometry(1, 2, 3)],
  materials: [{ name: "red", color: [0.9, 0.3, 0.2] }],
  nodes: [
    {
      name: "root",
      scale: [2, 2, 2],
      children: [{ name: "box", rotation: [0, half, 0, half], mesh: { geometry: 0, material: 0 } }],
    },
  ],
  clips: [
    { name: "Spin", tracks: [{ node: "box", path: "rotation", times: [0, 1.5], values: [0, 0, 0, 1, 0, 1, 0, 0] }] },
  ],
};

test("encodeGlb writes a file the library reads back with its transforms and clips", () => {
  const s = inspect(spinning);
  // Turned 90 degrees about y, so width and depth swap; then doubled.
  assert.deepEqual(
    s.size.map((v) => Number(v.toFixed(6))),
    [6, 4, 2],
  );
  assert.equal(s.triangles, 12);
  assert.deepEqual(s.animations, [{ name: "Spin", seconds: 1.5 }]);
  assert.equal(s.unsupported, null);
});

test("encodeGlb refuses repeated node names and tracks on nodes that do not exist", () => {
  const twice = { ...spinning, nodes: [...spinning.nodes, { name: "root", mesh: { geometry: 0, material: 0 } }] };
  assert.throws(() => encodeGlb(twice), /two nodes are named "root"/);
  const stray = { ...spinning, clips: [{ name: "Spin", tracks: [{ ...spinning.clips[0]!.tracks[0]!, node: "lid" }] }] };
  assert.throws(() => encodeGlb(stray), /"lid" that does not exist/);
});

test("there are three designs of each of the three characters, named by folder and design", () => {
  assert.equal(CHARACTERS.length, 9);
  const names = CHARACTERS.map((c) => c.name);
  assert.equal(new Set(names).size, 9);
  for (const c of CHARACTERS) {
    assert.match(c.name, /^[a-z-]+\/[a-z-]+$/);
    assert.equal(CHARACTERS.filter((o) => o.character === c.character).length, 3);
    assert.ok(c.metres > 0.5 && c.metres < 3, `${c.name} is ${c.metres} m`);
    assert.ok(c.notes.length > 20);
  }
});

test("every character is a usable library model of its stated size with its clips", () => {
  for (const c of CHARACTERS) {
    const doc = buildCharacter(c);
    const s = inspect(doc);
    assert.equal(s.unsupported, null, c.name);
    assert.equal(s.skinned, false);
    assert.ok(s.triangles > 500, `${c.name} has ${s.triangles} triangles`);
    const largest = Math.max(...s.size);
    assert.ok(Math.abs(largest - c.metres) < c.metres * 0.01, `${c.name} measures ${largest} m, not ${c.metres}`);
    assert.deepEqual(
      s.animations.map((a) => a.name),
      doc.clips.map((k) => k.name),
    );
    assert.ok(
      s.animations.some((a) => a.name === "Idle"),
      `${c.name} has no Idle clip`,
    );
    assert.ok(s.animations.every((a) => a.seconds > 0.5));
    assert.ok(encodeGlb(doc).length < 1_200_000, `${c.name} is ${encodeGlb(doc).length} bytes`);
  }
});

test("the player's loader opens every character and finds the nodes its clips animate", async () => {
  for (const c of CHARACTERS) {
    const doc = buildCharacter(c);
    const gltf = await load(doc);
    const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
    const largest = Math.max(size.x, size.y, size.z);
    assert.ok(Math.abs(largest - c.metres) < c.metres * 0.01, `${c.name} loads at ${largest} m`);
    assert.equal(gltf.animations.length, doc.clips.length);
    for (const clip of gltf.animations) {
      assert.ok(clip.tracks.length > 0, `${c.name} ${clip.name} has no tracks`);
      for (const track of clip.tracks) {
        const target = track.name.slice(0, track.name.indexOf("."));
        assert.ok(gltf.scene.getObjectByName(target), `${c.name} ${clip.name} animates missing node ${target}`);
      }
    }
    // Joints are named groups a take can pose by hand: every design has a head or a body, and arms unless it is a bust.
    assert.ok(
      gltf.scene.getObjectByName("head") ?? gltf.scene.getObjectByName("body"),
      `${c.name} has no head or body`,
    );
    if (c.design !== "Bust") {
      assert.ok(gltf.scene.getObjectByName("arm-left") && gltf.scene.getObjectByName("arm-right"), `${c.name} arms`);
    }
  }
});
