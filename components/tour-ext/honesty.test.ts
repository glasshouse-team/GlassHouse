import type { Object3D } from "three";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Gap } from "@/lib/schemas/world";
import { buildGapSpheres, HONESTY_COLOR, markedGaps, showGapSpheres } from "./honesty";

let n = 0;
function gap(over: Partial<Gap> = {}): Gap {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    world_id: "22222222-2222-4222-8222-222222222222",
    room: "Kitchen",
    issue: "blank",
    description: "The photo-frame wall is AI-filled.",
    severity: 2,
    position: { x: 1.2, y: 0.9, z: -2 },
    view_dir: null,
    radius_m: 0.6,
    screenshot_url: null,
    status: "open",
    filled_by_capture: null,
    ...over,
  };
}

/** A stand-in for useTour().addOverlay that tracks what is in the scene. */
function fakeScene() {
  const scene = new Set<Object3D>();
  const addOverlay = vi.fn((object: Object3D) => {
    scene.add(object);
    return () => {
      scene.delete(object);
    };
  });
  return { scene, addOverlay };
}

describe("markedGaps", () => {
  it("keeps open and requested gaps with a position (AI-filled), drops the rest", () => {
    const open = gap();
    const requested = gap({ status: "requested" });
    const kept = markedGaps([
      open,
      requested,
      gap({ status: "filled" }),
      gap({ status: "dismissed" }),
      gap({ position: null }),
    ]);
    expect(kept.map((g) => g.id)).toEqual([open.id, requested.id]);
  });
});

describe("buildGapSpheres", () => {
  it("places an amber, see-through sphere of radius_m at each gap", () => {
    const g = gap({ radius_m: 0.8 });
    const { meshes } = buildGapSpheres([g]);
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0];
    expect(mesh.position.toArray()).toEqual([1.2, 0.9, -2]);
    expect(mesh.scale.x).toBeCloseTo(0.8);
    const material = mesh.material as MeshBasicMaterial;
    expect(`#${material.color.getHexString()}`).toBe(HONESTY_COLOR);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeLessThan(1);
    expect(material.depthWrite).toBe(false);
  });

  it("never blocks rays (walking, arrows, anchor clicks)", () => {
    const { meshes } = buildGapSpheres([gap({ position: { x: 0, y: 0, z: -3 } })]);
    const ray = new Raycaster(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
    expect(ray.intersectObjects(meshes)).toEqual([]);
    // A normal mesh in the same place would be hit, so the test means something.
    const plain = new Mesh(meshes[0].geometry, meshes[0].material);
    plain.position.copy(meshes[0].position);
    plain.scale.copy(meshes[0].scale);
    plain.updateMatrixWorld();
    expect(ray.intersectObject(plain)).toHaveLength(1);
  });
});

describe("showGapSpheres", () => {
  it("adds one overlay per AI-filled gap and removes them all once", () => {
    const { scene, addOverlay } = fakeScene();
    const remove = showGapSpheres(
      [gap(), gap({ status: "requested" }), gap({ status: "filled" })],
      addOverlay,
    );
    expect(addOverlay).toHaveBeenCalledTimes(2);
    expect(scene.size).toBe(2);
    remove();
    remove();
    expect(scene.size).toBe(0);
  });

  it("frees the shared geometry and material on remove", () => {
    const { addOverlay } = fakeScene();
    const remove = showGapSpheres([gap(), gap()], addOverlay);
    const mesh = addOverlay.mock.calls[0][0] as Mesh;
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const materialDispose = vi.spyOn(mesh.material as MeshBasicMaterial, "dispose");
    remove();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it("does nothing with no gaps (v2 after the fill-in) or none placed", () => {
    const { addOverlay } = fakeScene();
    showGapSpheres([], addOverlay)();
    showGapSpheres([gap({ status: "filled" }), gap({ position: null })], addOverlay)();
    expect(addOverlay).not.toHaveBeenCalled();
  });
});
