/** Builds small GLB files for the geometry tests. Not used at runtime. */

const pad4 = (n: number) => (n + 3) & ~3;

/** A GLB from a glTF JSON object and a binary chunk. */
export function encodeGlb(json: object, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad4(jsonBytes.length);
  const binLength = pad4(bin.length);
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLength);
  out.set(jsonBytes, 20);
  view.setUint32(20 + jsonLength, binLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  out.set(bin, 28 + jsonLength);
  return out;
}

/** One mesh of float positions (non-indexed unless `index` is given) under one node. */
export function meshGlb(
  positions: number[],
  { index, node = {} }: { index?: number[]; node?: object } = {},
): Uint8Array {
  const positionBytes = new Uint8Array(new Float32Array(positions).buffer);
  const indexBytes = new Uint8Array(new Uint32Array(index ?? []).buffer);
  const bin = new Uint8Array(positionBytes.length + indexBytes.length);
  bin.set(positionBytes);
  bin.set(indexBytes, positionBytes.length);

  const axis = (a: number) => positions.filter((_, i) => i % 3 === a);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...node }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, ...(index ? { indices: 1 } : {}) }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [0, 1, 2].map((a) => Math.min(...axis(a))),
        max: [0, 1, 2].map((a) => Math.max(...axis(a))),
      },
      ...(index
        ? [{ bufferView: 1, componentType: 5125, count: index.length, type: "SCALAR" }]
        : []),
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length },
      ...(index
        ? [{ buffer: 0, byteOffset: positionBytes.length, byteLength: indexBytes.length }]
        : []),
    ],
    buffers: [{ byteLength: bin.length }],
  };
  return encodeGlb(json, bin);
}
