import { describe, expect, it } from "vitest";
import {
  applyPose,
  azimuthDir,
  clipWalls,
  composePose,
  footprintExit,
  invertPose,
  overlapArea,
  placeRooms,
  posedBounds,
  rayToWalls,
  roomFootprint,
  WALL_GAP,
  type Footprint,
  type SpotRoom,
} from "./plan";
import { rotatePoint, type Wall } from "./walls";

const DEG = Math.PI / 180;

/** Closed rectangle of walls around the origin. */
function rectWalls(minX: number, maxX: number, minZ: number, maxZ: number, angle = 0): Wall[] {
  const c = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ].map((p) => rotatePoint(p as [number, number], angle));
  return c.map((p, i) => [...p, ...c[(i + 1) % 4]] as Wall);
}

const rect = (minX: number, maxX: number, minZ: number, maxZ: number, angle = 0): Footprint => ({
  angle,
  minX,
  maxX,
  minZ,
  maxZ,
});

describe("poses", () => {
  it("azimuth 0 points along -z and 90 along +x", () => {
    expect(azimuthDir(0)[1]).toBeCloseTo(-1);
    expect(azimuthDir(90)[0]).toBeCloseTo(1);
  });

  it("invertPose undoes a pose and composePose chains them", () => {
    const pose = { x: 2, z: -1, rot: 30 * DEG };
    const p: [number, number] = [0.5, 1.5];
    const back = applyPose(invertPose(pose), applyPose(pose, p));
    expect(back[0]).toBeCloseTo(p[0]);
    expect(back[1]).toBeCloseTo(p[1]);
    const other = { x: -1, z: 3, rot: -50 * DEG };
    const chained = applyPose(composePose(other, pose), p);
    const stepwise = applyPose(other, applyPose(pose, p));
    expect(chained[0]).toBeCloseTo(stepwise[0]);
    expect(chained[1]).toBeCloseTo(stepwise[1]);
  });

  it("a pose rotation turns azimuth directions clockwise from above", () => {
    const d = applyPose({ x: 0, z: 0, rot: 90 * DEG }, azimuthDir(0));
    expect(d[0]).toBeCloseTo(azimuthDir(90)[0]);
    expect(d[1]).toBeCloseTo(azimuthDir(90)[1]);
  });
});

describe("rayToWalls", () => {
  it("returns the first wall hit", () => {
    const walls = rectWalls(-2, 3, -1, 1);
    expect(rayToWalls(walls, [0, 0], [1, 0])).toBeCloseTo(3);
    expect(rayToWalls(walls, [0, 0], [-1, 0])).toBeCloseTo(2);
    expect(rayToWalls([], [0, 0], [1, 0])).toBeNull();
  });
});

describe("roomFootprint", () => {
  it("measures a turned room around its spot", () => {
    const angle = 15 * DEG;
    const f = roomFootprint(rectWalls(-1, 3, -2, 1.5, angle), angle);
    expect(f.minX).toBeCloseTo(-1, 1);
    expect(f.maxX).toBeCloseTo(3, 1);
    expect(f.minZ).toBeCloseTo(-2, 1);
    expect(f.maxZ).toBeCloseTo(1.5, 1);
  });

  it("is not fooled by a doorway in one wall", () => {
    const walls = rectWalls(-2, 2, -2, 2).filter((_, i) => i !== 1);
    walls.push([2, -2, 2, -0.4], [2, 0.4, 2, 2], [4, -1, 4, 1]); // door in the +x wall, wall behind it
    expect(roomFootprint(walls, 0).maxX).toBeCloseTo(2, 1);
  });

  it("falls back when a side has no walls", () => {
    expect(roomFootprint([], 0, 1.5).maxX).toBe(1.5);
  });
});

describe("footprintExit", () => {
  it("is the distance to the edge along a direction", () => {
    const f = rect(-1, 2, -3, 1);
    expect(footprintExit(f, [1, 0])).toBeCloseTo(2);
    expect(footprintExit(f, [0, -1])).toBeCloseTo(3);
    expect(footprintExit(f, [Math.SQRT1_2, Math.SQRT1_2])).toBeCloseTo(Math.SQRT2);
  });
});

describe("clipWalls", () => {
  it("drops walls outside the room and short clutter deep inside", () => {
    const f = rect(-2, 2, -2, 2);
    const kept = clipWalls(
      [
        [-2, -2, 2, -2], // edge: kept
        [3, -1, 3, 1], // next room: dropped
        [0, 0, 0.3, 0], // clutter: dropped
        [-1, 0, 1, 0], // long interior wall: kept
      ],
      f,
    );
    expect(kept).toEqual([
      [-2, -2, 2, -2],
      [-1, 0, 1, 0],
    ]);
  });
});

describe("placeRooms", () => {
  const square = rect(-1, 1, -1, 1);

  it("puts a linked room through the doorway with matching back link", () => {
    const rooms: SpotRoom[] = [
      { spot: "entrance", name: "Hall", links: [{ to: "kitchen", azimuth: 90 }], footprint: square },
      // The kitchen's frame is turned: its link back points at azimuth 0 (its -z).
      { spot: "kitchen", name: "Kitchen", links: [{ to: "entrance", azimuth: 0 }], footprint: square },
    ];
    const { poses, doors } = placeRooms(rooms);
    const kitchen = poses.get("kitchen")!;
    // Hall exit at x = 1, gap, kitchen half width 1: kitchen spot at x = 2 + gap.
    expect(kitchen.x).toBeCloseTo(2 + WALL_GAP);
    expect(kitchen.z).toBeCloseTo(0);
    // Kitchen azimuth 0 must point back at the hall (home azimuth 270): rot = 270 degrees.
    const back = applyPose({ ...kitchen, x: 0, z: 0 }, azimuthDir(0));
    expect(back[0]).toBeCloseTo(-1);
    expect(back[1]).toBeCloseTo(0);
    expect(doors).toHaveLength(1);
    expect(doors[0].at[0]).toBeCloseTo(1 + WALL_GAP / 2);
  });

  it("snaps a slightly-off room onto the root's wall axes", () => {
    const rooms: SpotRoom[] = [
      { spot: "entrance", name: "Hall", links: [{ to: "bed", azimuth: 0 }], footprint: square },
      { spot: "bed", name: "Bed", links: [{ to: "entrance", azimuth: 172 }], footprint: square },
    ];
    const pose = placeRooms(rooms).poses.get("bed")!;
    expect(Math.abs(Math.sin(2 * pose.rot))).toBeLessThan(1e-9); // a multiple of 90 degrees
    const raw = placeRooms(rooms, { manhattan: false }).poses.get("bed")!;
    expect(raw.rot / DEG).toBeCloseTo(8);
  });

  it("pushes a room that would overlap another one further out", () => {
    const rooms: SpotRoom[] = [
      {
        spot: "entrance",
        name: "Hall",
        links: [
          { to: "a", azimuth: 90 },
          { to: "b", azimuth: 100 },
        ],
        footprint: square,
      },
      { spot: "a", name: "A", links: [{ to: "entrance", azimuth: 270 }], footprint: square },
      { spot: "b", name: "B", links: [{ to: "entrance", azimuth: 280 }], footprint: square },
    ];
    const { poses } = placeRooms(rooms, { manhattan: false });
    const a = posedBounds(square, poses.get("a")!, 0);
    const b = posedBounds(square, poses.get("b")!, 0);
    expect(overlapArea(a, b)).toBeLessThanOrEqual(0.25);
  });

  it("places rooms the graph does not reach to the right", () => {
    const rooms: SpotRoom[] = [
      { spot: "entrance", name: "Hall", links: [], footprint: square },
      { spot: "attic", name: "Attic", links: [], footprint: square },
    ];
    const attic = placeRooms(rooms).poses.get("attic")!;
    expect(attic.x).toBeGreaterThan(2);
  });
});
