/**
 * Camera -> plan pose for the minimap (owner: Temuri, GH-18). The tour's splat and collider sit
 * in one group at the scene origin (marbleToThree), so the camera's world x/z are the spot
 * world's plan coordinates as stored in floor_plans.
 */
import { Vector3, type Camera } from "three";
import type { PlanPose } from "./FloorPlanView";

const dir = new Vector3();
const pos = new Vector3();

/** Position and heading (azimuth: degrees clockwise from -z seen from above, 0..360). */
export function cameraPose(camera: Camera): PlanPose {
  camera.getWorldPosition(pos);
  camera.getWorldDirection(dir);
  const azimuth = ((Math.atan2(dir.x, -dir.z) * 180) / Math.PI + 360) % 360;
  return { x: pos.x, z: pos.z, azimuth };
}

/** True when two poses differ enough to redraw (2 cm or 1 degree). */
export function poseChanged(a: PlanPose | null, b: PlanPose | null): boolean {
  if (!a || !b) return a !== b;
  const turn = Math.abs(((a.azimuth - b.azimuth + 540) % 360) - 180);
  return Math.hypot(a.x - b.x, a.z - b.z) > 0.02 || turn > 1;
}
