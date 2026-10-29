/**
 * Writes binary glTF 2.0 (.glb) files: the counterpart of glb.ts, which only
 * reads them. It covers what the built-in characters need and nothing more:
 * indexed triangle meshes with normals, flat-colour materials, a node tree
 * with translation, rotation and scale, and animations that key a node's
 * translation, rotation or scale. No textures, skins or extensions, so every
 * file it writes is one the player (and inspectGlb) can use.
 */

export interface GlbGeometry {
  /** xyz triples. */
  positions: Float32Array;
  /** xyz triples, one per position. */
  normals: Float32Array;
  /** Triangle list into the positions. */
  indices: Uint16Array | Uint32Array;
  /** Optional linear rgb triples, one per position, multiplied into the material colour. */
  colors?: Float32Array;
}

export interface GlbMaterial {
  name: string;
  /** Linear RGB, 0 to 1. */
  color: [number, number, number];
  /** 0 mirror to 1 matte; default 0.9. */
  roughness?: number;
  metallic?: number;
  doubleSided?: boolean;
}

export interface GlbNode {
  /** Unique within the document; animation tracks refer to nodes by name. */
  name: string;
  translation?: [number, number, number];
  /** Quaternion x, y, z, w. */
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  mesh?: { geometry: number; material: number };
  children?: GlbNode[];
}

export interface GlbTrack {
  node: string;
  path: "translation" | "rotation" | "scale";
  /** Seconds, ascending. */
  times: number[];
  /** One value per time: xyz for translation and scale, xyzw for rotation. */
  values: number[];
}

export interface GlbClip {
  name: string;
  tracks: GlbTrack[];
}

export interface GlbDocument {
  geometries: GlbGeometry[];
  materials: GlbMaterial[];
  /** Root nodes of the default scene. */
  nodes: GlbNode[];
  clips: GlbClip[];
}

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const FLOAT = 5126;
const USHORT = 5123;
const UINT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

/** The binary buffer under construction: sections appended on 4-byte boundaries. */
class Bin {
  readonly views: { buffer: 0; byteOffset: number; byteLength: number; target?: number }[] = [];
  private readonly chunks: Buffer[] = [];
  private length = 0;

  /** Append `data` as a buffer view and return its index. */
  add(data: ArrayBufferView, target?: number): number {
    const body = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const padded = Math.ceil(body.length / 4) * 4;
    this.views.push({ buffer: 0, byteOffset: this.length, byteLength: body.length, ...(target ? { target } : {}) });
    this.chunks.push(body, Buffer.alloc(padded - body.length));
    this.length += padded;
    return this.views.length - 1;
  }

  bytes(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function minMax(values: ArrayLike<number>, stride: number): { min: number[]; max: number[] } {
  const min = new Array<number>(stride).fill(Infinity);
  const max = new Array<number>(stride).fill(-Infinity);
  for (let i = 0; i < values.length; i++) {
    const k = i % stride;
    min[k] = Math.min(min[k]!, values[i]!);
    max[k] = Math.max(max[k]!, values[i]!);
  }
  return { min, max };
}

/** Encode a document as a .glb. Throws when a node name repeats or a track names a node that does not exist. */
export function encodeGlb(doc: GlbDocument): Buffer {
  const bin = new Bin();
  const accessors: Record<string, unknown>[] = [];
  const accessor = (a: Record<string, unknown>): number => accessors.push(a) - 1;

  const geometries = doc.geometries.map((g) => {
    if (g.normals.length !== g.positions.length) throw new Error("a geometry needs one normal per position");
    const bounds = minMax(g.positions, 3);
    return {
      position: accessor({
        bufferView: bin.add(g.positions, ARRAY_BUFFER),
        componentType: FLOAT,
        count: g.positions.length / 3,
        type: "VEC3",
        min: bounds.min,
        max: bounds.max,
      }),
      normal: accessor({
        bufferView: bin.add(g.normals, ARRAY_BUFFER),
        componentType: FLOAT,
        count: g.normals.length / 3,
        type: "VEC3",
      }),
      indices: accessor({
        bufferView: bin.add(g.indices, ELEMENT_ARRAY_BUFFER),
        componentType: g.indices instanceof Uint16Array ? USHORT : UINT,
        count: g.indices.length,
        type: "SCALAR",
      }),
      color: g.colors
        ? accessor({
            bufferView: bin.add(g.colors, ARRAY_BUFFER),
            componentType: FLOAT,
            count: g.colors.length / 3,
            type: "VEC3",
          })
        : undefined,
    };
  });

  const materials = doc.materials.map((m) => ({
    name: m.name,
    pbrMetallicRoughness: {
      baseColorFactor: [...m.color, 1],
      metallicFactor: m.metallic ?? 0,
      roughnessFactor: m.roughness ?? 0.9,
    },
    ...(m.doubleSided ? { doubleSided: true } : {}),
  }));

  // One glTF mesh per (geometry, material) pair that a node uses.
  const meshes: { name: string; primitives: Record<string, unknown>[] }[] = [];
  const meshIndex = new Map<string, number>();
  const meshFor = (ref: NonNullable<GlbNode["mesh"]>): number => {
    const g = geometries[ref.geometry];
    const m = doc.materials[ref.material];
    if (!g || !m) throw new Error(`a node refers to geometry ${ref.geometry} and material ${ref.material}`);
    const key = `${ref.geometry}/${ref.material}`;
    let index = meshIndex.get(key);
    if (index === undefined) {
      index =
        meshes.push({
          name: `${m.name}-${ref.geometry}`,
          primitives: [
            {
              attributes: {
                POSITION: g.position,
                NORMAL: g.normal,
                ...(g.color !== undefined ? { COLOR_0: g.color } : {}),
              },
              indices: g.indices,
              material: ref.material,
            },
          ],
        }) - 1;
      meshIndex.set(key, index);
    }
    return index;
  };

  const nodes: Record<string, unknown>[] = [];
  const nodeIndex = new Map<string, number>();
  const addNode = (n: GlbNode): number => {
    if (nodeIndex.has(n.name)) throw new Error(`two nodes are named "${n.name}"`);
    const index = nodes.push({}) - 1;
    nodeIndex.set(n.name, index);
    const children = (n.children ?? []).map(addNode);
    nodes[index] = {
      name: n.name,
      ...(n.translation ? { translation: n.translation } : {}),
      ...(n.rotation ? { rotation: n.rotation } : {}),
      ...(n.scale ? { scale: n.scale } : {}),
      ...(n.mesh ? { mesh: meshFor(n.mesh) } : {}),
      ...(children.length ? { children } : {}),
    };
    return index;
  };
  const roots = doc.nodes.map(addNode);

  const animations = doc.clips.map((clip) => {
    const samplers: Record<string, unknown>[] = [];
    const channels = clip.tracks.map((track) => {
      const node = nodeIndex.get(track.node);
      if (node === undefined) {
        throw new Error(`clip "${clip.name}" animates a node named "${track.node}" that does not exist`);
      }
      const stride = track.path === "rotation" ? 4 : 3;
      if (track.values.length !== track.times.length * stride) {
        throw new Error(
          `clip "${clip.name}": the ${track.path} track of "${track.node}" needs ${stride} values per time`,
        );
      }
      const times = new Float32Array(track.times);
      const bounds = minMax(times, 1);
      const input = accessor({
        bufferView: bin.add(times),
        componentType: FLOAT,
        count: times.length,
        type: "SCALAR",
        min: bounds.min,
        max: bounds.max,
      });
      const output = accessor({
        bufferView: bin.add(new Float32Array(track.values)),
        componentType: FLOAT,
        count: track.times.length,
        type: stride === 4 ? "VEC4" : "VEC3",
      });
      const sampler = samplers.push({ input, output, interpolation: "LINEAR" }) - 1;
      return { sampler, target: { node, path: track.path } };
    });
    return { name: clip.name, samplers, channels };
  });

  const binary = bin.bytes();
  const json = {
    asset: { version: "2.0", generator: "highpixelgoat" },
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews: bin.views,
    buffers: [{ byteLength: binary.length }],
    ...(animations.length ? { animations } : {}),
  };
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + binary.length, 8);
  const chunk = (type: number, body: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(body.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, body]);
  };
  return Buffer.concat([header, chunk(JSON_CHUNK, text), chunk(BIN_CHUNK, binary)]);
}
