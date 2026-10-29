import { closeSync, openSync, readSync } from "node:fs";
import { z } from "zod";

/**
 * Reads what the scene agent needs to know about a .glb before it uses one:
 * its size, how heavy it is, its animations, and whether the player can load
 * it at all. Only the header and the JSON chunk are read, so a large library
 * lists quickly. Sizes come from the accessors' min/max through the node
 * transforms of the default scene (skinned meshes in their bind pose).
 */

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"
/** Extensions GLTFLoader needs a decoder for, which a take does not ship. */
const NEEDS_DECODER: Record<string, string> = {
  KHR_draco_mesh_compression: "Draco compression",
  EXT_meshopt_compression: "meshopt compression",
  KHR_texture_basisu: "KTX2 textures",
};

const NodeSchema = z.object({
  children: z.array(z.number().int()).optional(),
  mesh: z.number().int().optional(),
  skin: z.number().int().optional(),
  matrix: z.array(z.number()).length(16).optional(),
  translation: z.array(z.number()).length(3).optional(),
  rotation: z.array(z.number()).length(4).optional(),
  scale: z.array(z.number()).length(3).optional(),
});

const GltfSchema = z.object({
  asset: z.object({ version: z.string() }),
  scene: z.number().int().optional(),
  scenes: z.array(z.object({ nodes: z.array(z.number().int()).optional() })).optional(),
  nodes: z.array(NodeSchema).optional(),
  meshes: z
    .array(
      z.object({
        primitives: z.array(
          z.object({
            attributes: z.record(z.string(), z.number().int()),
            indices: z.number().int().optional(),
            mode: z.number().int().optional(),
          }),
        ),
      }),
    )
    .optional(),
  accessors: z
    .array(
      z.object({ count: z.number().int(), min: z.array(z.number()).optional(), max: z.array(z.number()).optional() }),
    )
    .optional(),
  animations: z
    .array(z.object({ name: z.string().optional(), samplers: z.array(z.object({ input: z.number().int() })) }))
    .optional(),
  extensionsRequired: z.array(z.string()).optional(),
});

type Gltf = z.infer<typeof GltfSchema>;
type Node = z.infer<typeof NodeSchema>;
/** Column-major 4x4, as glTF writes it. */
type Mat4 = number[];

export interface GlbSummary {
  /** Width (x), height (y) and depth (z) of the default scene, in the file's units (glTF says metres). */
  size: [number, number, number];
  triangles: number;
  animations: { name: string; seconds: number }[];
  skinned: boolean;
  /** Why the player cannot load this file, or null when it can. */
  unsupported: string | null;
}

/** The JSON chunk of the .glb at `file`. Throws when it is not a binary glTF 2.0 file. */
export function readGlbJson(file: string): unknown {
  const fd = openSync(file, "r");
  try {
    const head = Buffer.alloc(20);
    if (readSync(fd, head, 0, 20, 0) < 20 || head.readUInt32LE(0) !== MAGIC) throw new Error("not a .glb file");
    if (head.readUInt32LE(4) !== 2) throw new Error(`glTF version ${head.readUInt32LE(4)} is not supported (only 2)`);
    const length = head.readUInt32LE(12);
    if (head.readUInt32LE(16) !== JSON_CHUNK) throw new Error("the first chunk is not JSON");
    const body = Buffer.alloc(length);
    if (readSync(fd, body, 0, length, 20) < length) throw new Error("the file is truncated");
    return JSON.parse(body.toString("utf8"));
  } finally {
    closeSync(fd);
  }
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      out[c * 4 + r] = s;
    }
  }
  return out;
}

function localMatrix(n: Node): Mat4 {
  if (n.matrix) return n.matrix;
  const [tx = 0, ty = 0, tz = 0] = n.translation ?? [];
  const [x = 0, y = 0, z = 0, w = 1] = n.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = n.scale ?? [];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function apply(m: Mat4, p: number[]): [number, number, number] {
  const [x = 0, y = 0, z = 0] = p;
  const at = (i: number): number => m[i] ?? 0;
  return [
    at(0) * x + at(4) * y + at(8) * z + at(12),
    at(1) * x + at(5) * y + at(9) * z + at(13),
    at(2) * x + at(6) * y + at(10) * z + at(14),
  ];
}

/** What the scene agent is told about a glTF document. */
export function summariseGltf(raw: unknown): GlbSummary {
  const gltf: Gltf = GltfSchema.parse(raw);
  const nodes = gltf.nodes ?? [];
  const accessors = gltf.accessors ?? [];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  let skinned = false;

  const visit = (index: number, parent: Mat4, depth: number): void => {
    const node = nodes[index];
    if (!node || depth > 64) return;
    const world = multiply(parent, localMatrix(node));
    if (node.skin !== undefined) skinned = true;
    for (const prim of gltf.meshes?.[node.mesh ?? -1]?.primitives ?? []) {
      const position = accessors[prim.attributes.POSITION ?? -1];
      if (!position) continue;
      if ((prim.mode ?? 4) === 4) triangles += Math.floor((accessors[prim.indices ?? -1]?.count ?? position.count) / 3);
      const [min, max] = [position.min, position.max];
      if (!min || !max) continue;
      for (let corner = 0; corner < 8; corner++) {
        const p = [0, 1, 2].map((axis) => ((corner >> axis) & 1 ? max[axis] : min[axis]) ?? 0);
        apply(world, p).forEach((v, axis) => {
          lo[axis] = Math.min(lo[axis]!, v);
          hi[axis] = Math.max(hi[axis]!, v);
        });
      }
    }
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root, IDENTITY, 0);

  const size = [0, 1, 2].map((axis) => (hi[axis]! >= lo[axis]! ? hi[axis]! - lo[axis]! : 0)) as GlbSummary["size"];
  const animations = (gltf.animations ?? []).map((a, i) => ({
    name: a.name || `animation ${i}`,
    seconds: Math.max(0, ...a.samplers.map((s) => accessors[s.input]?.max?.[0] ?? 0)),
  }));
  const decoders = (gltf.extensionsRequired ?? []).filter((e) => e in NEEDS_DECODER).map((e) => NEEDS_DECODER[e]);
  const unsupported = decoders.length
    ? `it needs ${decoders.join(" and ")}, which the player has no decoder for; re-export it without`
    : triangles === 0
      ? "it has no triangles in its default scene"
      : null;
  return { size, triangles, animations, skinned, unsupported };
}

/** Summarise the .glb at `file`. Throws with the reason when it cannot be read. */
export function inspectGlb(file: string): GlbSummary {
  return summariseGltf(readGlbJson(file));
}
