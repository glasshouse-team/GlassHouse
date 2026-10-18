/** Reservation writes for POST /api/reservations (service role, server only). */
import type { TablesInsert } from "@/lib/database.types";
import { supabaseAdmin } from "@/lib/supabase";

/** True when a confirmed reservation overlaps the stay (check-out day is free for the next guest). */
export async function hasOverlappingReservation(
  listingId: string,
  checkIn: string,
  checkOut: string,
): Promise<boolean> {
  const { count, error } = await supabaseAdmin()
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId)
    .eq("status", "confirmed")
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);
  if (error) throw new Error(`Could not check reservations: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function createReservation(row: TablesInsert<"reservations">): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("reservations")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the reservation: ${error.message}`);
  return data.id;
}
