/** Trip and check-in reads and writes for GH-23 (service role, server only, owner: Beka). */
import type { Json, Tables } from "@/lib/database.types";
import { StoredCheckinReportSchema, type StoredCheckinReport } from "@/lib/schemas/checkin";
import { supabaseAdmin } from "@/lib/supabase";

export type ReservationRow = Tables<"reservations">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`Could not load ${what}: ${error.message}`);
}

/** A reservation by id, or null (also for an id that is not a uuid). */
export async function getReservation(id: string): Promise<ReservationRow | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabaseAdmin()
    .from("reservations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  check(error, "reservation");
  return data;
}

/** The facts the X-ray found in the listing's photos (an empty list if it never ran). */
export async function getListingFacts(listingId: string): Promise<unknown[]> {
  const { data, error } = await supabaseAdmin()
    .from("listing_facts")
    .select("facts")
    .eq("listing_id", listingId)
    .maybeSingle();
  check(error, "listing facts");
  return Array.isArray(data?.facts) ? data.facts : [];
}

export interface CheckinView {
  id: string;
  status: string;
  created_at: string;
  report: StoredCheckinReport | null;
}

/** The latest check-in of a reservation, with its report validated, or null. */
export async function getLatestCheckin(reservationId: string): Promise<CheckinView | null> {
  const { data, error } = await supabaseAdmin()
    .from("checkins")
    .select("id, status, created_at, report")
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  check(error, "check-in");
  if (!data) return null;
  const report = StoredCheckinReportSchema.safeParse(data.report);
  return { ...data, report: report.success ? report.data : null };
}

export async function createCheckin(reservationId: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("checkins")
    .insert({ reservation_id: reservationId, status: "pending" })
    .select("id")
    .single();
  if (error) throw new Error(`Could not save the check-in: ${error.message}`);
  return data.id;
}

export async function finishCheckin(
  id: string,
  result: { status: "ready"; report: StoredCheckinReport } | { status: "failed" },
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("checkins")
    .update({
      status: result.status,
      report: result.status === "ready" ? (result.report as unknown as Json) : null,
    })
    .eq("id", id);
  if (error) throw new Error(`Could not save the check-in report: ${error.message}`);
}
