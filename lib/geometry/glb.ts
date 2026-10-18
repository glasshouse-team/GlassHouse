/**
 * Minimal GLB (binary glTF 2.0) reader for collider meshes in Node (owner: Temuri, GH-3 / GH-18).
 * The browser uses three's GLTFLoader; scripts use this, so they need no DOM or workers.
 * Draco and meshopt compression need a decoder: glbTriangles refuses them with a clear error.
 */
import { Matrix4, Quaternion, Vector3 } from "three";

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const TRIANGLES = 4;

/** Extensions that compress geometry: positions cannot be read without their decoder. */
const COMPRESSION = [
  "KHR_draco_mesh_compression",
  "EXT_meshopt_compression",
  "KHR_meshopt_compression",
];

interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

/** The parts of the glTF JSON this reader uses. */
export interface GltfJson {
  asset?: { version?: string; generator?: string };
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: GltfNode[];
  meshes?: Array<{
    primitives: Array<{ attributes: Record<string, number>; indices?: number; mode?: number }>;
  }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    normalized?: boolean;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
    sparse?: unknown;
  }>;
  bufferViews?: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
}

export interface Glb {
  json: GltfJson;
  /** The binary chunk (buffer 0), or null when the file has none. */
  bin: Uint8Array | null;
}

/** Splits a .glb file into its JSON and binary chunks. */
export function parseGlb(bytes: Uint8Array): Glb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("Not a GLB file (bad magic)");
  }
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);
  const length = Math.min(view.getUint32(8, true), bytes.byteLength);

  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= length;) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const data = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(data)) as GltfJson;
    else if (chunkType === CHUNK_BIN && !bin) bin = data;
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

export interface GlbSummary {
  generator: string | null;
  extensionsUsed: string[];
  extensionsRequired: string[];
  /** The first compression extension in use, or null when positions can be read directly. */
  compression: string | null;
  meshes: number;
  primitives: number;
  vertices: number;
  triangles: number;
  /** POSITION accessor bounds in mesh space (before node transforms). */
  positionMin: [number, number, number] | null;
  positionMax: [number, number, number] | null;
  /** Nodes that move, rotate or scale their mesh. */
  nodeTransforms: Array<{ node: number } & Omit<GltfNode, "mesh" | "children">>;
}

/** What the JSON chunk says about the mesh: extensions, counts and bounds. */
export function glbSummary({ json }: Glb): GlbSummary {
  const extensionsUsed = json.extensionsUsed ?? [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let primitives = 0;
  let vertices = 0;
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      primitives++;
      const position = json.accessors?.[primitive.attributes.POSITION];
      vertices += position?.count ?? 0;
      position?.min?.forEach((v, i) => (min[i] = Math.min(min[i], v)));
      position?.max?.forEach((v, i) => (max[i] = Math.max(max[i], v)));
      if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) continue;
      const corners =
        primitive.indices != null ? json.accessors?.[primitive.indices]?.count : position?.count;
      triangles += Math.floor((corners ?? 0) / 3);
    }
  }
  const bounded = min.every(Number.isFinite) && max.every(Number.isFinite);
  return {
    generator: json.asset?.generator ?? null,
    extensionsUsed,
    extensionsRequired: json.extensionsRequired ?? [],
    compression: extensionsUsed.find((e) => COMPRESSION.includes(e)) ?? null,
    meshes: json.meshes?.length ?? 0,
    primitives,
    vertices,
    triangles,
    positionMin: bounded ? (min as [number, number, number]) : null,
    positionMax: bounded ? (max as [number, number, number]) : null,
    nodeTransforms: (json.nodes ?? []).flatMap((node, i) => {
      const { matrix, translation, rotation, scale } = node;
      return matrix || translation || rotation || scale
        ? [{ node: i, matrix, translation, rotation, scale }]
        : [];
    }),
  };
}

const COMPONENT_BYTES: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};
const TYPE_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readComponent(view: DataView, offset: number, type: number, normalized: boolean): number {
  switch (type) {
    case 5126:
      return view.getFloat32(offset, true);
    case 5125:
      return view.getUint32(offset, true);
    case 5123:
      return normalized ? view.getUint16(offset, true) / 65535 : view.getUint16(offset, true);
    case 5122:
      return normalized
        ? Math.max(view.getInt16(offset, true) / 32767, -1)
        : view.getInt16(offset, true);
    case 5121:
      return normalized ? view.getUint8(offset) / 255 : view.getUint8(offset);
    case 5120:
      return normalized ? Math.max(view.getInt8(offset) / 127, -1) : view.getInt8(offset);
    default:
      throw new Error(`Unsupported componentType ${type}`);
  }
}

/** Reads an accessor from the binary chunk (any component type, interleaved or not). */
function readAccessor(glb: Glb, accessorIndex: number): Float64Array {
  const accessor = glb.json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}`);
  if (accessor.sparse) throw new Error("Sparse accessors are not supported");
  const bufferView =
    accessor.bufferView == null ? undefined : glb.json.bufferViews?.[accessor.bufferView];
  if (!bufferView || bufferView.buffer !== 0 || !glb.bin) {
    throw new Error(`Accessor ${accessorIndex} is not in the GLB binary chunk`);
  }
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  const size = TYPE_SIZE[accessor.type];
  if (!componentBytes || !size) {
    throw new Error(`Unsupported accessor ${accessor.type} / ${accessor.componentType}`);
  }
  const stride = bufferView.byteStride ?? componentBytes * size;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const out = new Float64Array(accessor.count * size);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < size; c++) {
      out[i * size + c] = readComponent(
        view,
        base + i * stride + c * componentBytes,
        accessor.componentType,
        accessor.normalized ?? false,
      );
    }
  }
  return out;
}

function localMatrix(node: GltfNode): Matrix4 {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(
    new Vector3(...(node.translation ?? [0, 0, 0])),
    new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
    new Vector3(...(node.scale ?? [1, 1, 1])),
  );
}

/**
 * Every triangle of the default scene as one indexed mesh, with node transforms applied (as
 * GLTFLoader does). Positions are in the file's own frame: for a Marble collider, convert them
 * with marbleToThree. Only TRIANGLES primitives; throws for compressed files and sparse data.
 */
export function glbTriangles(glb: Glb): { positions: Float32Array; index: Uint32Array } {
  const { json } = glb;
  const compression = (json.extensionsUsed ?? []).find((e) => COMPRESSION.includes(e));
  if (compression) throw new Error(`${compression}: decode the mesh first (no decoder here)`);

  const positionParts: Float32Array[] = [];
  const indexParts: Uint32Array[] = [];
  let vertexCount = 0;
  const v = new Vector3();

  const addMesh = (meshIndex: number, matrix: Matrix4) => {
    for (const primitive of json.meshes?.[meshIndex]?.primitives ?? []) {
      if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) continue;
      const source = readAccessor(glb, primitive.attributes.POSITION);
      const count = source.length / 3;
      const positions = new Float32Array(source.length);
      for (let i = 0; i < count; i++) {
        v.set(source[i * 3], source[i * 3 + 1], source[i * 3 + 2]).applyMatrix4(matrix);
        positions[i * 3] = v.x;
        positions[i * 3 + 1] = v.y;
        positions[i * 3 + 2] = v.z;
      }
      const local =
        primitive.indices != null
          ? readAccessor(glb, primitive.indices)
          : Float64Array.from({ length: count }, (_, i) => i);
      const index = new Uint32Array(local.length - (local.length % 3));
      for (let i = 0; i < index.length; i++) index[i] = local[i] + vertexCount;
      positionParts.push(positions);
      indexParts.push(index);
      vertexCount += count;
    }
  };

  const nodes = json.nodes ?? [];
  const visit = (nodeIndex: number, parent: Matrix4) => {
    const node = nodes[nodeIndex];
    if (!node) return;
    const matrix = parent.clone().multiply(localMatrix(node));
    if (node.mesh != null) addMesh(node.mesh, matrix);
    for (const child of node.children ?? []) visit(child, matrix);
  };

  if (nodes.length === 0) {
    (json.meshes ?? []).forEach((_, i) => addMesh(i, new Matrix4()));
  } else {
    const children = new Set(nodes.flatMap((n) => n.children ?? []));
    const roots =
      json.scenes?.[json.scene ?? 0]?.nodes ??
      nodes.flatMap((_, i) => (children.has(i) ? [] : [i]));
    for (const root of roots) visit(root, new Matrix4());
  }

  return {
    positions: joinInto(new Float32Array(totalLength(positionParts)), positionParts),
    index: joinInto(new Uint32Array(totalLength(indexParts)), indexParts),
  };
}

const totalLength = (parts: ArrayLike<number>[]) => parts.reduce((n, p) => n + p.length, 0);

function joinInto<T extends Float32Array | Uint32Array>(out: T, parts: ArrayLike<number>[]): T {
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
