import * as THREE from "three";
import type { GlbClip, GlbDocument, GlbGeometry, GlbMaterial, GlbNode, GlbTrack } from "./glb-writer";

/**
 * A three.js object tree as a glTF document: every Object3D becomes a node
 * (named, so clips can find it), every distinct geometry and standard
 * material is written once, and clips authored as rotation keys in degrees
 * or translation offsets become sampled tracks.
 */

export interface ObjectTrack {
  node: string;
  path: "rotation" | "translation";
  /** Seconds and a value: degrees (XYZ) for rotation, an offset from the rest position for translation. */
  keys: [number, [number, number, number]][];
}

export interface ObjectClip {
  name: string;
  tracks: ObjectTrack[];
}

function quaternion(deg: [number, number, number]): [number, number, number, number] {
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(deg[0]),
    THREE.MathUtils.degToRad(deg[1]),
    THREE.MathUtils.degToRad(deg[2]),
    "XYZ",
  );
  const q = new THREE.Quaternion().setFromEuler(e);
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return [round(q.x), round(q.y), round(q.z), round(q.w)];
}

function geometryOf(g: THREE.BufferGeometry): GlbGeometry {
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  const position = g.getAttribute("position");
  let index = g.getIndex();
  if (!index) {
    index = new THREE.BufferAttribute(
      Uint32Array.from({ length: position.count }, (_, i) => i),
      1,
    );
  }
  const color = g.getAttribute("color");
  let colors: Float32Array | undefined;
  if (color) {
    colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      colors[i * 3] = color.getX(i);
      colors[i * 3 + 1] = color.getY(i);
      colors[i * 3 + 2] = color.getZ(i);
    }
  }
  return {
    positions: Float32Array.from(position.array),
    normals: Float32Array.from(g.getAttribute("normal").array),
    indices: position.count > 65535 ? Uint32Array.from(index.array) : Uint16Array.from(index.array),
    ...(colors ? { colors } : {}),
  };
}

function materialOf(m: THREE.Material, fallback: string): GlbMaterial {
  if (!(m instanceof THREE.MeshStandardMaterial)) throw new Error(`${fallback}: only MeshStandardMaterial is written`);
  return {
    name: m.name || fallback,
    color: [m.color.r, m.color.g, m.color.b],
    roughness: m.roughness,
    metallic: m.metalness,
    doubleSided: m.side === THREE.DoubleSide,
  };
}

/** The document for `root` (which becomes the only root node) and its clips. */
export function documentFromObject(root: THREE.Object3D, clips: ObjectClip[]): GlbDocument {
  const geometries: GlbGeometry[] = [];
  const geometryIndex = new Map<string, number>();
  const materials: GlbMaterial[] = [];
  const materialIndex = new Map<string, number>();
  const names = new Set<string>();
  const rest = new Map<string, THREE.Vector3>();
  const round = (v: number) => Math.round(v * 1e6) / 1e6;

  const convert = (o: THREE.Object3D, parentName: string, i: number): GlbNode => {
    let name = o.name || `${parentName}-${i}`;
    if (names.has(name)) {
      if (o.name) throw new Error(`two nodes are named "${name}"`);
      let k = 2;
      while (names.has(`${name}-${k}`)) k++;
      name = `${name}-${k}`;
    }
    names.add(name);
    rest.set(name, o.position.clone());
    const node: GlbNode = { name };
    if (o.position.lengthSq() > 0) node.translation = [round(o.position.x), round(o.position.y), round(o.position.z)];
    if (Math.abs(o.quaternion.w - 1) > 1e-9) {
      node.rotation = [round(o.quaternion.x), round(o.quaternion.y), round(o.quaternion.z), round(o.quaternion.w)];
    }
    if (o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1) {
      node.scale = [round(o.scale.x), round(o.scale.y), round(o.scale.z)];
    }
    if (o instanceof THREE.Mesh) {
      const g = o.geometry as THREE.BufferGeometry;
      let gi = geometryIndex.get(g.uuid);
      if (gi === undefined) {
        gi = geometries.push(geometryOf(g)) - 1;
        geometryIndex.set(g.uuid, gi);
      }
      const m = Array.isArray(o.material) ? o.material[0]! : o.material;
      let mi = materialIndex.get(m.uuid);
      if (mi === undefined) {
        mi = materials.push(materialOf(m, `material-${materials.length}`)) - 1;
        materialIndex.set(m.uuid, mi);
      }
      node.mesh = { geometry: gi, material: mi };
    }
    const children = o.children.map((c, j) => convert(c, name, j));
    if (children.length) node.children = children;
    return node;
  };
  const rootNode = convert(root, "root", 0);

  const track = (clip: string, t: ObjectTrack): GlbTrack => {
    const times = t.keys.map(([time]) => time);
    if (t.path === "rotation") {
      return { node: t.node, path: "rotation", times, values: t.keys.flatMap(([, deg]) => quaternion(deg)) };
    }
    const base = rest.get(t.node);
    if (!base) throw new Error(`clip "${clip}" moves a node named "${t.node}" that does not exist`);
    return {
      node: t.node,
      path: "translation",
      times,
      values: t.keys.flatMap(([, off]) => [base.x + off[0], base.y + off[1], base.z + off[2]]),
    };
  };
  const glbClips: GlbClip[] = clips.map((c) => ({ name: c.name, tracks: c.tracks.map((t) => track(c.name, t)) }));
  return { geometries, materials, nodes: [rootNode], clips: glbClips };
}
