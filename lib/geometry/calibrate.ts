/**
 * Floor plan calibration from one known measurement (owner: Temuri, GH-18 v2). The host enters
 * one real length of one room ("Bedroom is 3.2 m wide"); scale = real / measured along that
 * room's own axes, and it applies to every room of the version: all spot plans of a version share
 * one metric frame (D-009, D-040), so one ratio corrects them all. Plan geometry stays in the
 * 3D's meters (the minimap dot is the camera position); only the areas, the scale bar and the
 * text use the scale. Areas grow with the square of the scale.
 */
import type { z } from "zod";
import { FloorPlanCalibrationSchema, type FloorPlanCalibration } from "@/lib/schemas/world";
import type { Point2 } from "./slice";
import { polygonArea, polygonExtents } from "./rooms";

export const CalibrationAxis = FloorPlanCalibrationSchema.shape.axis;
export type CalibrationAxis = z.infer<typeof CalibrationAxis>;

/** A scale outside this range means a wrong room or a typo rather than a 3D that is off. */
export const SCALE_LIMITS = { min: 0.5, max: 2 } as const;

/** Stored with the measured room in floor_plans.rooms (FloorPlanSchema). */
export type Calibration = FloorPlanCalibration;

/** What the host entered, and who and when. */
export type Measurement = Omit<Calibration, "measured_m" | "scale">;

/** The measurement behind a stored calibration (to re-apply it to rebuilt outlines). */
export function measurementOf({ room, axis, meters, by, at }: Calibration): Measurement {
  return { room, axis, meters, by, at };
}

interface PlanRoomLike {
  name: string;
  polygon: Point2[] | null;
  area_m2: number | null;
}

/** A room's width (shorter side) or length (longer side) along its own axes, 3D meters. */
export function roomLength(polygon: Point2[], axis: CalibrationAxis): number {
  const e = polygonExtents(polygon);
  return axis === "width" ? e.width : e.length;
}

export type CalibrationResult =
  | { ok: true; calibration: Calibration }
  | { ok: false; code: "unknown_room" | "no_outline" | "out_of_range"; message: string };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The scale from one measurement of one room of the plan. */
export function computeCalibration(rooms: PlanRoomLike[], m: Measurement): CalibrationResult {
  const room = rooms.find((r) => sameName(r.name, m.room));
  if (!room) {
    return {
      ok: false,
      code: "unknown_room",
      message: `No room "${m.room}" on this plan. Rooms: ${rooms.map((r) => r.name).join(", ")}.`,
    };
  }
  if (!room.polygon || room.polygon.length < 3 || room.area_m2 === null) {
    return { ok: false, code: "no_outline", message: `The ${room.name} has no measured outline.` };
  }
  const measured = roomLength(room.polygon, m.axis);
  if (!(measured > 0)) {
    return { ok: false, code: "no_outline", message: `The ${room.name} has no measured outline.` };
  }
  const scale = m.meters / measured;
  if (scale < SCALE_LIMITS.min || scale > SCALE_LIMITS.max) {
    return {
      ok: false,
      code: "out_of_range",
      message: `The 3D measures the ${room.name} ${m.axis} at ${measured.toFixed(2)} m; ${m.meters} m is too far off. Check the room and the number.`,
    };
  }
  return {
    ok: true,
    calibration: {
      ...m,
      room: room.name,
      measured_m: Math.round(measured * 1000) / 1000,
      scale: Math.round(scale * 10000) / 10000,
    },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rooms with areas at `scale` (from their polygons in 3D meters) and the calibration stored on
 * the measured room only. Rooms without an area keep none.
 */
export function calibrateRooms<R extends PlanRoomLike>(
  rooms: R[],
  calibration: Calibration | null,
): (R & { calibration?: Calibration })[] {
  const scale = calibration?.scale ?? 1;
  return rooms.map((r) => {
    const copy: R & { calibration?: Calibration } = { ...r };
    delete copy.calibration;
    copy.area_m2 =
      r.area_m2 === null || !r.polygon ? null : round2(polygonArea(r.polygon) * scale * scale);
    if (calibration && sameName(r.name, calibration.room)) copy.calibration = calibration;
    return copy;
  });
}

/** Sum of the known room areas (m2, one decimal), or null when no room has one. */
export function totalArea(rooms: { area_m2: number | null }[]): number | null {
  const known = rooms.filter((r) => r.area_m2 !== null);
  return known.length ? round1(known.reduce((s, r) => s + r.area_m2!, 0)) : null;
}

/** The calibration stored on a plan's rooms, if any. */
export function planCalibration(rooms: { calibration?: Calibration | null }[]): Calibration | null {
  return rooms.find((r) => r.calibration)?.calibration ?? null;
}

/** "Calibrated from: Bedroom width 3.2 m" or "Approximate (not calibrated)". */
export function calibrationLine(calibration: Calibration | null): string {
  return calibration
    ? `Calibrated from: ${calibration.room} ${calibration.axis} ${calibration.meters} m`
    : "Approximate (not calibrated)";
}
