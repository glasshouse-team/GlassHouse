/**
 * Deals for the negotiation (GH-15). Server only (service role). `deal_secrets` (the guest's
 * target and maximum) is written here and read only by buildGuestContext; nothing in this file
 * returns it. Status changes are conditional updates, so two runs or two taps can't both win.
 */
import type { Json, Tables } from "@/lib/database.types";
import { DealMessageSchema, DealSchema, type Deal, type DealStatus } from "@/lib/schemas/core";
import { supabaseAdmin } from "@/lib/supabase";
import type { DealMessageDraft } from "@/tools/negotiation/tools";

export type DealMessageRow = Tables<"deal_messages">;

const DEAL_COLUMNS =
  "id, listing_id, guest_id, check_in, check_out, guests, status, list_total_cents, current_offer_cents, final_total_cents, final_terms, rounds";

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`Could not ${what}: ${error.message}`);
}

export interface NewDeal {
  listingId: string;
  guestId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  listTotalCents: number;
  targetCents: number | null;
  maxCents: number;
}

/** Opens a deal and stores the guest's private limits next to it. */
export async function createDeal(deal: NewDeal): Promise<string> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("deals")
    .insert({
      listing_id: deal.listingId,
      guest_id: deal.guestId,
      check_in: deal.checkIn,
      check_out: deal.checkOut,
      guests: deal.guests,
      list_total_cents: deal.listTotalCents,
      status: "open",
    })
    .select("id")
    .single();
  check(error, "open the deal");
  const secrets = await db.from("deal_secrets").insert({
    deal_id: data!.id,
    guest_target_cents: deal.targetCents,
    guest_max_cents: deal.maxCents,
  });
  if (secrets.error) {
    await db.from("deals").delete().eq("id", data!.id);
    check(secrets.error, "save the guest's limits");
  }
  return data!.id;
}

/** The guest's live deal on this home, if any (the database allows one at a time). */
export async function getLiveDealId(listingId: string, guestId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .select("id")
    .eq("listing_id", listingId)
    .eq("guest_id", guestId)
    .in("status", ["open", "agreed_pending_host", "escalated"])
    .maybeSingle();
  check(error, "look up live deals");
  return data?.id ?? null;
}

export async function getDeal(id: string): Promise<Deal | null> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  check(error, `load deal ${id}`);
  return data ? DealSchema.parse(data) : null;
}

export async function getDealMessages(dealId: string): Promise<DealMessageRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("deal_messages")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at");
  check(error, "load the deal messages");
  return data ?? [];
}

export async function saveDealMessage(dealId: string, message: DealMessageDraft): Promise<void> {
  const row = DealMessageSchema.parse({ deal_id: dealId, ...message });
  const { error } = await supabaseAdmin()
    .from("deal_messages")
    .insert({ ...row, terms: row.terms as Json });
  check(error, "save the deal message");
}

export interface DealPatch {
  status?: DealStatus;
  rounds?: number;
  current_offer_cents?: number | null;
  final_total_cents?: number | null;
  final_terms?: Record<string, unknown>;
}

/**
 * Updates a deal only if it is still in the state the caller saw (status and, if given, the
 * round count). Returns the updated deal, or null when someone else moved it first.
 */
export async function updateDealIf(
  id: string,
  expect: { status: DealStatus; rounds?: number },
  patch: DealPatch,
): Promise<Deal | null> {
  const { final_terms, ...rest } = patch;
  let query = supabaseAdmin()
    .from("deals")
    .update({
      ...rest,
      ...(final_terms ? { final_terms: final_terms as Json } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", expect.status);
  if (expect.rounds !== undefined) query = query.eq("rounds", expect.rounds);
  const { data, error } = await query.select(DEAL_COLUMNS).maybeSingle();
  check(error, "update the deal");
  return data ? DealSchema.parse(data) : null;
}

export interface PendingApproval {
  deal: Deal;
  listingTitle: string;
}

/** Deals on the host's homes that wait for the host's tap. */
export async function getPendingApprovals(hostId: string): Promise<PendingApproval[]> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .select(`${DEAL_COLUMNS}, listings!inner(title, host_id)`)
    .eq("status", "agreed_pending_host")
    .eq("listings.host_id", hostId)
    .order("updated_at", { ascending: false });
  check(error, "load the approvals");
  return (data ?? []).map(({ listings, ...deal }) => ({
    deal: DealSchema.parse(deal),
    listingTitle: listings.title,
  }));
}
