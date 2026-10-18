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
  it("flies to known anchors and ignores unknown ones", async () => {
    const tour = fakeTour();
    await runTourAction(tour, { type: "fly_to", anchorId: desk.id });
    await runTourAction(tour, { type: "fly_to", anchorId: "missing" });
    expect(tour.flyTo).toHaveBeenCalledTimes(1);
  });

  it("looks toward an anchor's look_at point", async () => {
    const tour = fakeTour();
    await runTourAction(tour, { type: "look_toward", anchorId: desk.id });
    expect(tour.lookAt).toHaveBeenCalledWith(desk.look_at);
  });

  it("moves to another spot instead of aiming across worlds (D-009)", async () => {
    const tour = fakeTour();
    const balcony: Anchor = {
      ...desk,
      id: "33333333-3333-4333-8333-333333333333",
      world_id: "44444444-4444-4444-8444-444444444444",
      name: "balcony door",
      room: "Bedroom",
    };
    tour.anchors.push(balcony);
    await runTourAction(tour, { type: "look_toward", anchorId: balcony.id });
    expect(tour.flyTo).toHaveBeenCalledWith(balcony.id);
    expect(tour.lookAt).not.toHaveBeenCalled();
  });

  it("validates tool output before running it", () => {
    expect(TourActionSchema.safeParse({ type: "fly_to", anchorId: desk.id }).success).toBe(true);
    expect(TourActionSchema.safeParse({ type: "teleport" }).success).toBe(false);
  });
});
