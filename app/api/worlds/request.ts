/**
 * Body and checks for POST /api/worlds (GH-22 "Generate my 3D home", D-038). Pure, tested in
 * request.test.ts.
 */
import { z } from "zod";
import { RoomMarkerSchema } from "@/lib/schemas/world";

export const GenerateWorldSchema = z.object({
  listingId: z.uuid(),
  captureIds: z.array(z.uuid()).min(1).max(40),
});
export type GenerateWorld = z.infer<typeof GenerateWorldSchema>;

export interface CaptureForGeneration {
  id: string;
  listing_id: string;
  status: string;
  kind: string;
  room_markers: unknown;
}

export type CaptureCheck =
  { ok: true; rooms: string[] } | { ok: false; status: 404 | 409; code: string; message: string };

const Markers = z.array(RoomMarkerSchema).catch([]);

/**
 * Every requested capture must exist, belong to this listing and be uploaded. Returns the rooms
 * the captures cover, in first-seen order, for the feed line.
 */
export function checkCaptures(
  listingId: string,
  ids: readonly string[],
  rows: readonly CaptureForGeneration[],
): CaptureCheck {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rooms: string[] = [];
  for (const id of new Set(ids)) {
    const row = byId.get(id);
    if (!row || row.listing_id !== listingId)
      return {
        ok: false,
        status: 404,
        code: "capture_not_found",
        message: "A capture is missing.",
      };
    if (row.status !== "uploaded")
      return {
        ok: false,
        status: 409,
        code: "capture_not_uploaded",
        message: "Every capture must finish uploading first.",
      };
    for (const m of Markers.parse(row.room_markers))
      if (!rooms.includes(m.room)) rooms.push(m.room);
  }
  return { ok: true, rooms };
}

/** Feed line, e.g. "Giorgi asked for a new 3D home from 3 captures (Entrance, Kitchen, Bath)". */
export function generationRequestSummary(
  name: string,
  captureCount: number,
  rooms: readonly string[],
): string {
  const what = captureCount === 1 ? "1 capture" : `${captureCount} captures`;
  const where = rooms.length
    ? ` (${rooms.slice(0, 3).join(", ")}${rooms.length > 3 ? "…" : ""})`
    : "";
  return `${name} asked for a new 3D home from ${what}${where}`;
}
