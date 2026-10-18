import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { cameraPose, poseChanged } from "./camera-pose";

describe("cameraPose", () => {
  it("reads position and azimuth (0 = looking along -z, 90 = along +x)", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(1.2, 1.6, -0.5);
    camera.lookAt(1.2, 1.6, -5);
    camera.updateMatrixWorld();
    const pose = cameraPose(camera);
    expect(pose.x).toBeCloseTo(1.2);
    expect(pose.z).toBeCloseTo(-0.5);
    expect(pose.azimuth).toBeCloseTo(0);

    camera.lookAt(10, 1.6, -0.5);
    camera.updateMatrixWorld();
    expect(cameraPose(camera).azimuth).toBeCloseTo(90);
  });

  it("matches a spot link's direction (sin az, 0, -cos az)", () => {
    const camera = new PerspectiveCamera();
    const az = (225 * Math.PI) / 180;
    camera.lookAt(Math.sin(az), 0, -Math.cos(az));
    camera.updateMatrixWorld();
    expect(cameraPose(camera).azimuth).toBeCloseTo(225);
  });
});

describe("poseChanged", () => {
  it("ignores jitter under 2 cm and 1 degree, including across north", () => {
    const a = { x: 0, z: 0, azimuth: 359.6 };
    expect(poseChanged(a, { x: 0.01, z: 0, azimuth: 0.2 })).toBe(false);
    expect(poseChanged(a, { x: 0.05, z: 0, azimuth: 359.6 })).toBe(true);
    expect(poseChanged(a, { x: 0, z: 0, azimuth: 2 })).toBe(true);
    expect(poseChanged(null, a)).toBe(true);
    expect(poseChanged(null, null)).toBe(false);
  });
});
