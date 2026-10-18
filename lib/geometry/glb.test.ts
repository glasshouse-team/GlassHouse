import { describe, expect, it } from "vitest";
import { encodeGlb, meshGlb } from "./glb-fixtures";
import { glbSummary, glbTriangles, parseGlb } from "./glb";

// A 1 x 1 quad at y = 0: four corners, two triangles.
const QUAD = [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1];
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];

describe("glbTriangles", () => {
  it("reads indexed triangles with the node transform applied", () => {
    const glb = parseGlb(
      meshGlb(QUAD, { index: QUAD_INDEX, node: { translation: [0, 1, 0], scale: [2, 2, 2] } }),
    );
    const { positions, index } = glbTriangles(glb);
    expect([...index]).toEqual(QUAD_INDEX);
    expect([...positions]).toEqual([0, 1, 0, 2, 1, 0, 2, 1, 2, 0, 1, 2]);
  });

  it("reads normalized int16 positions in an interleaved buffer", () => {
    // Two vertices of 3 int16 plus 2 bytes padding (stride 8), as KHR_mesh_quantization allows.
    const bin = new Uint8Array(24);
    const view = new DataView(bin.buffer);
    [32767, 0, -32767, 0, 16384, 32767, 0, 0, -32767].forEach((v, i) =>
      view.setInt16(Math.floor(i / 3) * 8 + (i % 3) * 2, v, true),
    );
    const json = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_mesh_quantization"],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ bufferView: 0, componentType: 5122, normalized: true, count: 3, type: "VEC3" }],
      bufferViews: [{ buffer: 0, byteLength: 24, byteStride: 8 }],
    };
    const { positions, index } = glbTriangles(parseGlb(encodeGlb(json, bin)));
    expect([...index]).toEqual([0, 1, 2]);
    expect(positions[0]).toBeCloseTo(1);
    expect(positions[2]).toBeCloseTo(-1);
    expect(positions[4]).toBeCloseTo(0.5, 3);
    expect(positions[8]).toBeCloseTo(-1);
  });

  it("refuses Draco-compressed meshes", () => {
    const json = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_draco_mesh_compression"],
      extensionsRequired: ["KHR_draco_mesh_compression"],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [
        { componentType: 5126, count: 4, type: "VEC3", min: [0, 0, 0], max: [1, 0, 1] },
        { componentType: 5125, count: 6, type: "SCALAR" },
      ],
    };
    const glb = parseGlb(encodeGlb(json, new Uint8Array(4)));
    expect(() => glbTriangles(glb)).toThrow(/KHR_draco_mesh_compression/);
    expect(glbSummary(glb)).toMatchObject({
      compression: "KHR_draco_mesh_compression",
      vertices: 4,
      triangles: 2,
    });
  });
});

describe("glbSummary", () => {
  it("lists extensions, counts, POSITION bounds and node transforms", () => {
    const glb = parseGlb(meshGlb(QUAD, { index: QUAD_INDEX, node: { scale: [2, 2, 2] } }));
    expect(glbSummary(glb)).toEqual({
      generator: null,
      extensionsUsed: [],
      extensionsRequired: [],
      compression: null,
      meshes: 1,
      primitives: 1,
      vertices: 4,
      triangles: 2,
      positionMin: [0, 0, 0],
      positionMax: [1, 0, 1],
      nodeTransforms: [{ node: 0, scale: [2, 2, 2] }],
    });
  });
});

describe("parseGlb", () => {
  it("rejects files that are not GLB", () => {
    expect(() => parseGlb(new Uint8Array(24))).toThrow(/bad magic/);
  });
});
