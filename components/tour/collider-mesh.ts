/**
 * The invisible collider of one spot world (GH-11): Marble's collider GLB in three.js meters
 * with a BVH, used to place doorway arrows, pick anchor points and measure the floor. It is
 * never drawn. The transform is lib/geometry's (colliderToThree = marbleToThree + floorHeight),
 * so the splat (splatPose) and the collider line up.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Ray,
  Vector3,
} from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { colliderToThree } from "@/lib/geometry/collider";
import { marbleToThree } from "@/lib/geometry/frame";
import type { SpotLink, Vec3 } from "@/lib/schemas/world";
import { RAY_HEIGHT, arrowDistance, type RayHit } from "./spots";

export interface SpotCollider {
  mesh: Mesh;
  bvh: MeshBVH;
  /** Floor height after flip and scale, before the lift (the floorY for marbleToThree). */
  floorY: number;
  dispose(): void;
}

/** An invisible, raycastable mesh with a BVH from three.js-meter positions. */
export function colliderFromPositions(
  positions: Float32Array,
  index: Uint32Array | null,
  floorY: number,
): SpotCollider {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  if (index && index.length) geometry.setIndex(new BufferAttribute(index, 1));
  const bvh = new MeshBVH(geometry);
  geometry.boundsTree = bvh;
  // visible: false on the material, not the mesh: R3F events still raycast it (anchor mode).
  const material = new MeshBasicMaterial({ visible: false, side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  mesh.raycast = acceleratedRaycast;
  mesh.name = "tour-collider";
  return {
    mesh,
    bvh,
    floorY,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Parses a Marble collider GLB (raw Marble units) into a SpotCollider. */
export function colliderFromGlb(bytes: Uint8Array, metricScaleFactor: number): SpotCollider {
  const { positions, index, floorY } = colliderToThree(bytes, metricScaleFactor);
  return colliderFromPositions(positions, index, floorY);
}

const _ray = new Ray();

/** All hits along a ray with each face's unit normal y. */
export function castRay(collider: SpotCollider, origin: Vec3, direction: Vec3): RayHit[] {
  _ray.origin.set(origin.x, origin.y, origin.z);
  _ray.direction.set(direction.x, direction.y, direction.z).normalize();
  return collider.bvh.raycast(_ray, DoubleSide).map((hit) => ({
    distance: hit.distance,
    normalY: hit.face ? hit.face.normal.y : 0,
  }));
}

/** Arrow distance along a link, from a ray at RAY_HEIGHT out of the spot. */
export function linkDistance(collider: SpotCollider | null) {
  return (_link: SpotLink, direction: Vec3): number =>
    arrowDistance(collider ? castRay(collider, { x: 0, y: RAY_HEIGHT, z: 0 }, direction) : []);
}

/**
 * Position, rotation and scale of the splat for marbleToThree(scale, floorY): the same
 * matrix split into parts, since Spark reads an Object3D's own transform. The flip of y and
 * z is a half turn about x, so the scale stays positive.
 */
export function splatPose(metricScaleFactor: number, floorY: number) {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  marbleToThree(metricScaleFactor, floorY).decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

/** Recomposes a splatPose (tests). */
export function poseMatrix(pose: ReturnType<typeof splatPose>): Matrix4 {
  return new Matrix4().compose(pose.position, pose.quaternion, pose.scale);
}

/**
 * Floor for a world without a collider: World Labs grounds with `y -= ground_plane_offset`
 * after scaling, so after the flip the floor is at -offset (frame.ts). 1.5 m when unknown.
 */
export function fallbackFloorY(groundPlaneOffset: number | null): number {
  return -(groundPlaneOffset && groundPlaneOffset > 0 ? groundPlaneOffset : 1.5);
}
