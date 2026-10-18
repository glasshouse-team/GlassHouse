/**
 * Honesty overlay geometry (GH-21): translucent amber spheres at the AI-filled gaps of the
 * current spot's world (D-009). Pure three.js, no React, so it is tested without a viewer.
 */
import { DoubleSide, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import type { TourApi } from "@/components/tour/TourContext";
import type { Gap } from "@/lib/schemas/world";

/** Same as `--honesty` in app/globals.css and the floor-plan hatching (GH-18). */
export const HONESTY_COLOR = "#f5a524";
export const HONESTY_OPACITY = 0.35;

/** A gap counts as AI-filled while it is open or requested (docs/CONTRACTS.md section 14). */
export function isAiFilled(gap: Pick<Gap, "status">): boolean {
  return gap.status === "open" || gap.status === "requested";
}

/** The gaps the overlay marks: AI-filled and placed in the world. */
export function markedGaps(
  gaps: readonly Gap[],
): (Gap & { position: NonNullable<Gap["position"]> })[] {
  return gaps.filter(
    (g): g is Gap & { position: NonNullable<Gap["position"]> } =>
      isAiFilled(g) && g.position !== null && g.radius_m > 0,
  );
}

/** Amber spheres for the marked gaps, in world meters (floor y = 0). Never hit by rays. */
export function buildGapSpheres(gaps: readonly Gap[]): {
  meshes: Mesh[];
  dispose: () => void;
} {
  const marked = markedGaps(gaps);
  if (marked.length === 0) return { meshes: [], dispose: () => {} };
  // One unit sphere and one material shared by every marker, scaled per gap.
  const geometry = new SphereGeometry(1, 32, 16);
  const material = new MeshBasicMaterial({
    color: HONESTY_COLOR,
    transparent: true,
    opacity: HONESTY_OPACITY,
    depthWrite: false,
    // Both faces: the tint stays visible when the camera steps inside a gap sphere.
    side: DoubleSide,
  });
  const meshes = marked.map((gap) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = `honesty-gap-${gap.id}`;
    mesh.position.set(gap.position.x, gap.position.y, gap.position.z);
    mesh.scale.setScalar(gap.radius_m);
    // Draw after the splat so the tint reads on top of it, and never block walking rays.
    mesh.renderOrder = 10;
    mesh.raycast = () => {};
    mesh.userData.gapId = gap.id;
    return mesh;
  });
  return {
    meshes,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Adds a sphere per marked gap through `addOverlay` and returns one function that removes
 * them all and frees the GPU buffers. Safe to call with no gaps.
 */
export function showGapSpheres(
  gaps: readonly Gap[],
  addOverlay: TourApi["addOverlay"],
): () => void {
  const { meshes, dispose } = buildGapSpheres(gaps);
  const removers = meshes.map((mesh) => addOverlay(mesh));
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    for (const remove of removers) remove();
    dispose();
  };
}
