/**
 * Database and storage access for /api/captures (GH-22). Server only: uses the service role.
 * Kept apart from the routes so route tests can mock it.
 */
import type { Json, Tables } from "@/lib/database.types";
import { BUCKETS, createSignedUpload, supabaseAdmin, type SignedUpload } from "@/lib/supabase";
import type { StoredFile } from "./schema";

export type CaptureRow = Tables<"captures">;

export interface NewCaptureRow {
  id: string;
  listing_id: string;
  kind: "walkthrough" | "ring" | "fill_in";
  raw_url: string;
  duration_s: number | null;
  size_bytes: number;
  room_markers: unknown[];
  heading_track: unknown[];
  quality_flags: string[];
  gap_id: string | null;
}

/** Inserts the capture with status "uploading". */
export async function insertCapture(row: NewCaptureRow): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("captures")
    .insert({
      ...row,
      room_markers: row.room_markers as Json,
      heading_track: row.heading_track as Json,
      quality_flags: row.quality_flags as Json,
      status: "uploading",
    });
  if (error) throw new Error(`Could not save the capture: ${error.message}`);
}

export async function getCapture(id: string): Promise<CaptureRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("captures")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load capture ${id}: ${error.message}`);
  return data;
}

/**
 * Moves a capture to `status` only while it still has status `from`, so two PATCHes in a race
 * cannot both succeed. Resolves true when this call changed the row.
 */
export async function setCaptureStatus(
  id: string,
  status: "uploaded" | "failed" | "uploading",
  from: "uploading" | "failed",
): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("captures")
    .update({ status })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) throw new Error(`Could not update capture ${id}: ${error.message}`);
  return (data ?? []).length > 0;
}

/** One signed upload URL per object path in the private `captures` bucket. */
export async function signUploads(paths: readonly string[]): Promise<SignedUpload[]> {
  return Promise.all(paths.map((path) => createSignedUpload("captures", path)));
}

/** The files (name and bytes) stored under a folder of the `captures` bucket. */
export async function listCaptureFiles(folder: string): Promise<StoredFile[]> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKETS.captures)
    .list(folder.replace(/\/$/, ""), { limit: 100 });
  if (error) throw new Error(`Could not list ${folder}: ${error.message}`);
  return (data ?? [])
    .filter((f) => f.id !== null)
    .map((f) => {
      const size = (f.metadata as { size?: unknown } | null)?.size;
      return { name: f.name, size: typeof size === "number" ? size : null };
    });
}

/**
 * Moves a gap to `requested` when its fill-in capture starts (GH-19 Record now), only while it is
 * still `open` (a filled or dismissed gap keeps its status; a second capture changes nothing).
 * Resolves the gap's room when this call changed the row, else null.
 */
export async function requestGapFill(gapId: string): Promise<{ room: string | null } | null> {
  const { data, error } = await supabaseAdmin()
    .from("gaps")
    .update({ status: "requested" })
    .eq("id", gapId)
    .eq("status", "open")
    .select("room");
  if (error) throw new Error(`Could not update gap ${gapId}: ${error.message}`);
  return data?.[0] ? { room: data[0].room } : null;
}

/** The listing a gap belongs to (through its world), or null when the gap does not exist. */
export async function gapListingId(gapId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data: gap, error } = await db
    .from("gaps")
    .select("world_id")
    .eq("id", gapId)
    .maybeSingle();
  if (error) throw new Error(`Could not load gap ${gapId}: ${error.message}`);
  if (!gap) return null;
  const { data: world, error: worldError } = await db
    .from("worlds")
    .select("listing_id")
    .eq("id", gap.world_id)
    .maybeSingle();
  if (worldError) throw new Error(`Could not load world ${gap.world_id}: ${worldError.message}`);
  return world?.listing_id ?? null;
}
