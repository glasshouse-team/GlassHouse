import { describe, expect, it, vi } from "vitest";
import type { TourApi } from "@/components/tour/TourContext";
import type { Anchor } from "@/lib/schemas/world";
import { runTourAction, TourActionSchema } from "./actions";

const desk: Anchor = {
  id: "11111111-1111-4111-8111-111111111111",
  world_id: "22222222-2222-4222-8222-222222222222",
  name: "desk",
  kind: "object",
  room: "Living room",
  position: { x: 1, y: 1.6, z: 2 },
  look_at: { x: 1.5, y: 0.8, z: 3 },
  source: "manual",
};

function fakeTour(): TourApi {
  return {
    ready: true,
    worldId: desk.world_id,
    scene: null,
    camera: null,
    anchors: [desk],
    gaps: [],
    flyTo: vi.fn(async () => {}),
    lookAt: vi.fn(async () => {}),
    highlightRoom: vi.fn(),
    addOverlay: vi.fn(() => () => {}),
  };
}

describe("runTourAction", () => {
  it("hands fly_to to the tour, which switches spots for anchors elsewhere", async () => {
    const tour = fakeTour();
    await runTourAction(tour, { type: "fly_to", anchorId: desk.id });
    await runTourAction(tour, { type: "fly_to", anchorId: "33333333-3333-4333-8333-333333333333" });
    expect(tour.flyTo).toHaveBeenNthCalledWith(1, desk.id);
    expect(tour.flyTo).toHaveBeenNthCalledWith(2, "33333333-3333-4333-8333-333333333333");
  });

  it("looks toward an anchor in this spot", async () => {
    const tour = fakeTour();
    await runTourAction(tour, { type: "look_toward", anchorId: desk.id });
    expect(tour.lookAt).toHaveBeenCalledWith(desk.look_at);
    expect(tour.flyTo).not.toHaveBeenCalled();
  });

  it("moves to another spot instead of aiming across worlds (D-009)", async () => {
    // tour.anchors holds the current spot only, so the other spot's anchor is not in it.
    const tour = fakeTour();
    const otherSpot = "33333333-3333-4333-8333-333333333333";
    await runTourAction(tour, { type: "look_toward", anchorId: otherSpot });
    expect(tour.flyTo).toHaveBeenCalledWith(otherSpot);
    expect(tour.lookAt).not.toHaveBeenCalled();
  });

  it("validates tool output before running it", () => {
    expect(TourActionSchema.safeParse({ type: "fly_to", anchorId: desk.id }).success).toBe(true);
    expect(TourActionSchema.safeParse({ type: "teleport" }).success).toBe(false);
  });
});
