/**
 * A tiny hand-built .glb for tests: a w x h x d box under a root node scaled
 * by `scale`, on a child node turned 90 degrees about y (so width and depth
 * swap), with one looping "Spin" animation of `seconds`.
 */
export function boxGlb(
  o: { w?: number; h?: number; d?: number; scale?: number; seconds?: number; extensionsRequired?: string[] } = {},
): Buffer {
  const { w = 1, h = 2, d = 3, scale = 2, seconds = 1.5 } = o;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) => [
    c & 1 ? w / 2 : -w / 2,
    c & 2 ? h / 2 : -h / 2,
    c & 4 ? d / 2 : -d / 2,
  ]);
  // Two triangles per face, wound outward.
  const faces = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  const indices = faces.flatMap(([a, b, c, e]) => [a!, b!, c!, a!, c!, e!]);
  const half = Math.SQRT1_2;
  const sections = [
    Buffer.from(new Float32Array(corners).buffer),
    Buffer.from(new Uint16Array(indices).buffer),
    Buffer.from(new Float32Array([0, seconds]).buffer),
    Buffer.from(new Float32Array([0, half, 0, half, 0, -half, 0, half]).buffer),
  ];
  const offsets: number[] = [];
  let at = 0;
  for (const s of sections) {
    offsets.push(at);
    at += Math.ceil(s.length / 4) * 4;
  }
  const bin = Buffer.alloc(at);
  sections.forEach((s, i) => s.copy(bin, offsets[i]));

  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: "root", scale: [scale, scale, scale], children: [1] },
      { name: "box", mesh: 0, rotation: [0, half, 0, half] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.3, 0.2, 1], metallicFactor: 1 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: sections.map((s, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: s.length })),
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: [-w / 2, -h / 2, -d / 2],
        max: [w / 2, h / 2, d / 2],
      },
      { bufferView: 1, componentType: 5123, count: indices.length, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [seconds] },
      { bufferView: 3, componentType: 5126, count: 2, type: "VEC4" },
    ],
    animations: [
      {
        name: "Spin",
        samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }],
      },
    ],
    ...(o.extensionsRequired ? { extensionsRequired: o.extensionsRequired, extensionsUsed: o.extensionsRequired } : {}),
  };
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  const chunk = (type: number, body: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(body.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, body]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, bin)]);
}
