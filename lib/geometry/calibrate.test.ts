import { describe, expect, it } from "vitest";
import {
  calibrateRooms,
  calibrationLine,
  computeCalibration,
  measurementOf,
  planCalibration,
  roomLength,
  SCALE_LIMITS,
  totalArea,
  type Measurement,
} from "./calibrate";
import { boxCorners } from "./rooms";
import type { Point2 } from "./slice";

const DEG = Math.PI / 180;

// A bedroom 4 m long and 2.9 m wide, turned 30 degrees, and an L-shaped living room.
const bedroom = boxCorners({ angle: 30 * DEG, minX: -2, maxX: 2, minZ: -1.45, maxZ: 1.45 });
const living: Point2[] = [
  [5, -2],
  [10, -2],
  [10, 0],
  [8, 0],
  [8, 2],
  [5, 2],
];
const rooms = [
  { name: "Bedroom", label: [0, 0] as Point2, polygon: bedroom, area_m2: 11.6 },
  { name: "Living room", label: [6, 0] as Point2, polygon: living, area_m2: 16 },
  { name: "Balcony", label: [12, 0] as Point2, polygon: null, area_m2: null },
];
const m = (over: Partial<Measurement> = {}): Measurement => ({
  room: "Bedroom",
  axis: "width",
  meters: 3.2,
  by: "Giorgi",
  at: "2026-10-18T12:00:00.000Z",
  ...over,
});

describe("roomLength", () => {
  it("measures the width and length along the room's own axes", () => {
    expect(roomLength(bedroom, "width")).toBeCloseTo(2.9, 6);
    expect(roomLength(bedroom, "length")).toBeCloseTo(4, 6);
    expect(roomLength(living, "width")).toBeCloseTo(4);
    expect(roomLength(living, "length")).toBeCloseTo(5);
  });
});

describe("computeCalibration", () => {
  it("is real / measured along the chosen axis, matching the room name loosely", () => {
    const r = computeCalibration(rooms, m({ room: " bedroom " }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calibration.room).toBe("Bedroom");
    expect(r.calibration.measured_m).toBeCloseTo(2.9, 3);
    expect(r.calibration.scale).toBeCloseTo(3.2 / 2.9, 4);
    expect(r.calibration.by).toBe("Giorgi");
    const byLength = computeCalibration(rooms, m({ axis: "length", meters: 3.6 }));
    expect(byLength.ok && byLength.calibration.scale).toBeCloseTo(0.9, 4);
  });

  it("refuses an unknown room, a room without an outline and implausible scales", () => {
    expect(computeCalibration(rooms, m({ room: "Garage" }))).toMatchObject({
      ok: false,
      code: "unknown_room",
    });
    expect(computeCalibration(rooms, m({ room: "Balcony" }))).toMatchObject({
      ok: false,
      code: "no_outline",
    });
    const tooBig = 2.9 * SCALE_LIMITS.max * 1.01;
    expect(computeCalibration(rooms, m({ meters: tooBig }))).toMatchObject({
      ok: false,
      code: "out_of_range",
    });
    expect(computeCalibration(rooms, m({ meters: 1 }))).toMatchObject({ code: "out_of_range" });
    expect(computeCalibration([], m())).toMatchObject({ code: "unknown_room" });
  });
});

describe("calibrateRooms and totalArea", () => {
  const result = computeCalibration(rooms, m({ meters: 2.9 * 1.1 }));
  const calibration = result.ok ? result.calibration : null;

  it("scales every room's area by the square of the scale, from its polygon", () => {
    const out = calibrateRooms(rooms, calibration);
    expect(out[0].area_m2).toBeCloseTo(11.6 * 1.21, 1);
    expect(out[1].area_m2).toBeCloseTo(16 * 1.21, 2);
    expect(out[2].area_m2).toBeNull();
    expect(totalArea(out)).toBeCloseTo((11.6 + 16) * 1.21, 0);
  });

  it("stores the calibration only on the measured room, and drops an old one", () => {
    const out = calibrateRooms(rooms, calibration);
    expect(out[0].calibration).toEqual(calibration);
    expect(out[1].calibration).toBeUndefined();
    expect(planCalibration(out)).toEqual(calibration);
    const reset = calibrateRooms(out, null);
    expect(planCalibration(reset)).toBeNull();
    expect(reset[1].area_m2).toBe(16);
    // Inputs are not changed.
    expect(rooms[1].area_m2).toBe(16);
  });

  it("keeps the measurement to re-apply after a rebuild", () => {
    expect(measurementOf(calibration!)).toEqual(m({ meters: 2.9 * 1.1 }));
  });

  it("is null without areas", () => {
    expect(totalArea([{ area_m2: null }])).toBeNull();
    expect(totalArea([])).toBeNull();
  });
});

describe("calibrationLine", () => {
  it("says where the scale comes from", () => {
    const r = computeCalibration(rooms, m());
    expect(calibrationLine(r.ok ? r.calibration : null)).toBe(
      "Calibrated from: Bedroom width 3.2 m",
    );
    expect(calibrationLine(null)).toBe("Approximate (not calibrated)");
  });
});
