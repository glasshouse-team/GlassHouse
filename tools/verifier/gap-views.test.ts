import { describe, expect, it } from "vitest";
import { cropView, directionAzimuth, panoUv, viewRay, viewSpecs, type RgbImage } from "./gap-views";

describe("viewSpecs", () => {
  it("gives six views 60 deg apart", () => {
    expect(viewSpecs().map((v) => [v.id, v.yaw])).toEqual([
      ["v0", 0],
      ["v1", 60],
      ["v2", 120],
      ["v3", 180],
      ["v4", 240],
      ["v5", 300],
    ]);
  });
});

describe("viewRay", () => {
  it("looks along (sin yaw, 0, -cos yaw) at the view centre", () => {
    const d = viewRay(90, 0.5, 0.5);
    expect(d.x).toBeCloseTo(1, 9);
    expect(d.y).toBeCloseTo(0, 9);
    expect(d.z).toBeCloseTo(0, 9);
  });

  it("reaches 45 deg right at the right edge and 45 deg up at the top of a 90 deg view", () => {
    expect(directionAzimuth(viewRay(0, 1, 0.5))).toBeCloseTo(45, 6);
    const up = viewRay(0, 0.5, 0);
    expect(up.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(up.z).toBeCloseTo(-Math.SQRT1_2, 9);
  });
});

describe("panoUv", () => {
  it("puts azimuth 0 in the centre, clockwise to the right, up at the top", () => {
    expect(panoUv({ x: 0, y: 0, z: -1 })).toEqual({ u: 0.5, v: 0.5 });
    expect(panoUv({ x: 1, y: 0, z: 0 }).u).toBeCloseTo(0.75, 9);
    expect(panoUv({ x: -1, y: 0, z: 0 }).u).toBeCloseTo(0.25, 9);
    expect(panoUv({ x: 0, y: 1, z: 0 }).v).toBeCloseTo(0, 9);
  });
});

describe("cropView", () => {
  // A panorama whose red channel is the column (0..255) and green the row.
  const W = 256;
  const H = 128;
  const data = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      data[(y * W + x) * 3] = x;
      data[(y * W + x) * 3 + 1] = y;
    }
  const pano: RgbImage = { width: W, height: H, data };

  it("samples the panorama column of the view's yaw at its centre", () => {
    const size = 32;
    const view = cropView(pano, 90, size);
    const centre = ((size / 2) * size + size / 2) * 3;
    expect(Math.abs(view.data[centre] - 0.75 * W)).toBeLessThan(3);
    expect(Math.abs(view.data[centre + 1] - 0.5 * H)).toBeLessThan(3);
  });
});
