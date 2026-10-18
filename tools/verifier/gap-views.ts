/**
 * Gap-check views of one spot world (GH-19, owner: Temuri). A spot world is seen from its centre
 * only (D-009), so the views are perspective crops of the world's own panorama (`worlds.pano_url`,
 * equirectangular, in our storage): six yaws 60 deg apart, 90 deg field of view. The panorama's
 * centre column is azimuth 0 (the first ring photo) and azimuth grows to the right, matching
 * (sin az, 0, -cos az) after marbleToThree. Pure: pixels in, pixels out, plus the ray math.
 */
import type { Vec3 } from "@/lib/schemas/world";

export const VIEW_COUNT = 6;
export const VIEW_FOV_DEG = 90;
export const VIEW_SIZE = 512;

export interface ViewSpec {
  id: string;
  /** Degrees clockwise from the first ring photo. */
  yaw: number;
}

/** v0..v5 at 0, 60, ... 300 deg. */
export function viewSpecs(count = VIEW_COUNT): ViewSpec[] {
  return Array.from({ length: count }, (_, i) => ({ id: `v${i}`, yaw: (i * 360) / count }));
}

/**
 * Direction (unit) through a point of a view, in three.js axes (+y up). `u`, `v` are 0..1 from
 * the view's top-left; (0.5, 0.5) is the view's centre, along (sin yaw, 0, -cos yaw).
 */
export function viewRay(yawDeg: number, u: number, v: number, fovDeg = VIEW_FOV_DEG): Vec3 {
  const a = (yawDeg * Math.PI) / 180;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const sx = (2 * u - 1) * t;
  const sy = (1 - 2 * v) * t;
  // forward (sin a, 0, -cos a), right (cos a, 0, sin a), up (0, 1, 0)
  const x = Math.sin(a) + sx * Math.cos(a);
  const y = sy;
  const z = -Math.cos(a) + sx * Math.sin(a);
  const n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n };
}

/** Where a direction lands in an equirectangular panorama, as 0..1 fractions (u right, v down). */
export function panoUv(dir: Vec3): { u: number; v: number } {
  const az = Math.atan2(dir.x, -dir.z); // 0 = forward, clockwise positive
  const el = Math.asin(Math.max(-1, Math.min(1, dir.y / Math.hypot(dir.x, dir.y, dir.z))));
  let u = az / (2 * Math.PI) + 0.5;
  u -= Math.floor(u);
  return { u, v: 0.5 - el / Math.PI };
}

export interface RgbImage {
  width: number;
  height: number;
  /** 3 bytes per pixel, row-major. */
  data: Uint8Array;
}

/** Bilinear perspective crop of an equirectangular RGB panorama. */
export function cropView(
  pano: RgbImage,
  yawDeg: number,
  size = VIEW_SIZE,
  fovDeg = VIEW_FOV_DEG,
): RgbImage {
  const out = new Uint8Array(size * size * 3);
  const { width: W, height: H, data } = pano;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const { u, v } = panoUv(viewRay(yawDeg, (px + 0.5) / size, (py + 0.5) / size, fovDeg));
      const fx = u * W - 0.5;
      const fy = Math.min(H - 1, Math.max(0, v * H - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const dx = fx - x0;
      const dy = fy - y0;
      const xa = ((x0 % W) + W) % W;
      const xb = (xa + 1) % W;
      const yb = Math.min(H - 1, y0 + 1);
      const o = (py * size + px) * 3;
      for (let c = 0; c < 3; c++) {
        const p00 = data[(y0 * W + xa) * 3 + c];
        const p10 = data[(y0 * W + xb) * 3 + c];
        const p01 = data[(yb * W + xa) * 3 + c];
        const p11 = data[(yb * W + xb) * 3 + c];
        out[o + c] = Math.round(
          p00 * (1 - dx) * (1 - dy) + p10 * dx * (1 - dy) + p01 * (1 - dx) * dy + p11 * dx * dy,
        );
      }
    }
  }
  return { width: size, height: size, data: out };
}

/** Azimuth in degrees (0..360) of a horizontal-ish direction. */
export function directionAzimuth(dir: Vec3): number {
  const az = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
  return ((az % 360) + 360) % 360;
}
