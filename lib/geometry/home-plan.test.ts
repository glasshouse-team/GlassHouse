import { describe, expect, it } from "vitest";
import { buildHomePlans, NOMINAL_DOOR_WIDTH, type SpotWalls } from "./home-plan";
import type { Wall } from "./walls";

function rectWalls(minX: number, maxX: number, minZ: number, maxZ: number): Wall[] {
  return [
    [minX, minZ, maxX, minZ],
    [maxX, minZ, maxX, maxZ],
    [maxX, maxZ, minX, maxZ],
    [minX, maxZ, minX, minZ],
  ];
}

// A 4 x 2 m hall with a 2 x 2 m bathroom through a door at azimuth 90 (+x). The bathroom's
// first photo faced the other way, so its link back is at azimuth 90 too (frame turned 180).
const spots: SpotWalls[] = [
  {
    spot: "entrance",
    name: "Entrance hall",
    links: [{ to: "bathroom", azimuth: 90 }],
    walls: rectWalls(-2, 2, -1, 1),
    angle: 0,
  },
  {
    spot: "bathroom",
    name: "Bathroom",
    links: [{ to: "entrance", azimuth: 90 }],
    walls: rectWalls(-1, 1, -1, 1),
    angle: 0,
  },
];

describe("buildHomePlans", () => {
  const plans = buildHomePlans(spots);
  const hallPlan = plans.find((p) => p.spot === "entrance")!;
  const bathPlan = plans.find((p) => p.spot === "bathroom")!;

  it("builds one plan per spot with every room", () => {
    expect(plans).toHaveLength(2);
    expect(hallPlan.rooms.map((r) => r.name)).toEqual(["Entrance hall", "Bathroom"]);
    expect(hallPlan.walls).toHaveLength(8);
  });

  it("keeps each plan in its own spot's frame: its room around the origin", () => {
    const hall = hallPlan.rooms[0];
    expect(hall.label[0]).toBeCloseTo(0);
    expect(hall.label[1]).toBeCloseTo(0);
    const bath = bathPlan.rooms[1];
    expect(bath.label[0]).toBeCloseTo(0);
    expect(bath.label[1]).toBeCloseTo(0);
  });

  it("puts the bathroom beside the hall, and the hall on the bathroom's +x side in its frame", () => {
    expect(hallPlan.rooms[1].label[0]).toBeCloseTo(3.12, 2); // 2 + gap + 1
    // Seen from the bathroom (turned 180 degrees) the hall is along its azimuth 90 = +x.
    expect(bathPlan.rooms[0].label[0]).toBeCloseTo(3.12, 2);
    expect(bathPlan.rooms[0].label[1]).toBeCloseTo(0);
  });

  it("stores each room's outline with its area, and doors with a nominal width", () => {
    expect(hallPlan.rooms[0].polygon).toHaveLength(4);
    expect(hallPlan.rooms[0].area_m2).toBeCloseTo(8);
    expect(hallPlan.rooms[1].area_m2).toBeCloseTo(4);
    // The same areas in every spot's frame.
    expect(bathPlan.rooms.map((r) => r.area_m2)).toEqual(hallPlan.rooms.map((r) => r.area_m2));
    expect(hallPlan.doors).toEqual([{ at: [2.06, 0], width_m: NOMINAL_DOOR_WIDTH }]);
  });

  it("outlines an L-shaped room and labels it inside its outline", () => {
    const L: [number, number][] = [
      [-1, -1],
      [4, -1],
      [4, 1],
      [1, 1],
      [1, 3],
      [-1, 3],
    ];
    const [plan] = buildHomePlans([
      {
        spot: "living",
        name: "Living room",
        links: [],
        walls: L.map((p, i) => [...p, ...L[(i + 1) % L.length]] as Wall),
        angle: 0,
      },
    ]);
    expect(plan.rooms[0].polygon).toHaveLength(6);
    expect(plan.rooms[0].area_m2).toBeCloseTo(14);
  });

  it("gives a room without walls a footprint but no area", () => {
    const [plan] = buildHomePlans([{ spot: "x", name: "Unknown", links: [], walls: [], angle: 0 }]);
    expect(plan.rooms[0].polygon).toHaveLength(4);
    expect(plan.rooms[0].area_m2).toBeNull();
  });

  it("returns nothing without spots", () => {
    expect(buildHomePlans([])).toEqual([]);
  });
});
