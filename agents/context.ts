/**
 * CONTRACT FILE (GH-5 / GH-13, owner: Beka). The security boundary between the agents.
 *
 * - The host agent sees the host policy ONLY in "negotiate" mode, never the guest's maximum.
 * - The guest agent sees the deal secrets (target, max), never the host policy.
 * Build these server-side with supabaseAdmin(); never send them to the browser.
 *
 * Each builder is a loader that reads explicit columns (the guest side never even queries
 * host_policies; the host side never queries deal_secrets) and a pure function that turns
 * the rows into the context, so the boundary is unit-tested (agents/context.test.ts).
 */
import { z } from "zod";
import {
  Cents,
  DealSchema,
  HostPolicySchema,
  ListingSchema,
  TripBriefSchema,
  type Deal,
  type HostPolicy,
  type Listing,
  type TripBrief,
} from "@/lib/schemas/core";
import { XrayResultSchema, type XrayResult } from "@/lib/schemas/verifier";
import { supabaseAdmin } from "@/lib/supabase";
import { formatCents } from "@/lib/utils";
import { loadPrompt } from "./load-prompt";

export interface HostContext {
  listing: Listing;
  facts: XrayResult | null;
  houseManual: string;
  /** Present only when mode = "negotiate". */
  policy?: HostPolicy;
}

export interface GuestContext {
  deal: Deal;
  /** `house_manual` is blank: it can hold door codes; guests ask the host agent instead. */
  listing: Listing;
  facts: XrayResult | null;
  brief: TripBrief | null;
  guestTargetCents: number | null;
  guestMaxCents: number;
}

const LISTING_COLUMNS =
  "id, host_id, slug, title, description, city, neighborhood, lat, lng, property_type, max_guests, bedrooms, beds, baths, base_price_cents, weekend_price_cents, cleaning_fee_cents, currency, amenities, house_rules, house_manual, status, published_world_id, rating, review_count";
const FACT_COLUMNS = "facts, contradictions, missing_photos";
const POLICY_COLUMNS =
  "listing_id, negotiable, floor_nightly_cents, max_discount_pct, auto_accept_total_cents, long_stay_rules, gap_night_pct, max_rounds, allowed_terms";
const DEAL_COLUMNS =
  "id, listing_id, guest_id, check_in, check_out, guests, status, list_total_cents, current_offer_cents, final_total_cents, final_terms, rounds";
const SECRET_COLUMNS = "guest_target_cents, guest_max_cents";

const DealSecretsSchema = z.object({
  guest_target_cents: Cents.nullable(),
  guest_max_cents: Cents,
});

function parseFacts(row: unknown): XrayResult | null {
  return row ? (XrayResultSchema.safeParse(row).data ?? null) : null;
}

function loaded<T>(result: { data: T | null; error: { message: string } | null }, what: string) {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  return result.data;
}

// ---------- Host side ----------

export interface HostContextRows {
  listing: unknown;
  facts: unknown;
  /** Only read in "negotiate" mode. */
  policy?: unknown;
}

export function toHostContext(rows: HostContextRows, mode: "qa" | "negotiate"): HostContext {
  const listing = ListingSchema.parse(rows.listing);
  const context: HostContext = {
    listing,
    facts: parseFacts(rows.facts),
    houseManual: listing.house_manual,
  };
  if (mode === "negotiate") {
    if (!rows.policy) throw new Error(`Listing ${listing.id} has no agent rules to negotiate with`);
    context.policy = HostPolicySchema.parse(rows.policy);
  }
  return context;
}

export async function buildHostContext(
  listingId: string,
  mode: "qa" | "negotiate",
): Promise<HostContext> {
  const db = supabaseAdmin();
  const [listing, facts, policy] = await Promise.all([
    db.from("listings").select(LISTING_COLUMNS).eq("id", listingId).maybeSingle(),
    db.from("listing_facts").select(FACT_COLUMNS).eq("listing_id", listingId).maybeSingle(),
    mode === "negotiate"
      ? db.from("host_policies").select(POLICY_COLUMNS).eq("listing_id", listingId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const listingRow = loaded(listing, `listing ${listingId}`);
  if (!listingRow) throw new Error(`Listing ${listingId} not found`);
  return toHostContext(
    {
      listing: listingRow,
      facts: loaded(facts, "listing facts"),
      policy: loaded(policy, "host policy"),
    },
    mode,
  );
}

// ---------- Guest side ----------

export interface GuestContextRows {
  deal: unknown;
  listing: unknown;
  facts: unknown;
  secrets: unknown;
  /** `trip_briefs.parsed` of the guest's newest brief, if any. */
  brief: unknown;
}

export function toGuestContext(rows: GuestContextRows): GuestContext {
  const listing = ListingSchema.parse(rows.listing);
  const secrets = DealSecretsSchema.parse(rows.secrets);
  return {
    deal: DealSchema.parse(rows.deal),
    listing: { ...listing, house_manual: "" },
    facts: parseFacts(rows.facts),
    brief: rows.brief ? (TripBriefSchema.safeParse(rows.brief).data ?? null) : null,
    guestTargetCents: secrets.guest_target_cents,
    guestMaxCents: secrets.guest_max_cents,
  };
}

export async function buildGuestContext(dealId: string): Promise<GuestContext> {
  const db = supabaseAdmin();
  const [deal, secrets] = await Promise.all([
    db.from("deals").select(DEAL_COLUMNS).eq("id", dealId).maybeSingle(),
    db.from("deal_secrets").select(SECRET_COLUMNS).eq("deal_id", dealId).maybeSingle(),
  ]);
  const dealRow = loaded(deal, `deal ${dealId}`);
  if (!dealRow) throw new Error(`Deal ${dealId} not found`);
  const secretRow = loaded(secrets, "deal secrets");
  if (!secretRow) throw new Error(`Deal ${dealId} has no guest limits`);

  const [listing, facts, brief] = await Promise.all([
    db.from("listings").select(LISTING_COLUMNS).eq("id", dealRow.listing_id).maybeSingle(),
    db
      .from("listing_facts")
      .select(FACT_COLUMNS)
      .eq("listing_id", dealRow.listing_id)
      .maybeSingle(),
    db
      .from("trip_briefs")
      .select("parsed")
      .eq("guest_id", dealRow.guest_id)
      .not("parsed", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const listingRow = loaded(listing, `listing ${dealRow.listing_id}`);
  if (!listingRow) throw new Error(`Listing ${dealRow.listing_id} not found`);
  return toGuestContext({
    deal: dealRow,
    listing: listingRow,
    facts: loaded(facts, "listing facts"),
    secrets: secretRow,
    brief: loaded(brief, "trip brief")?.parsed ?? null,
  });
}

// ---------- System prompts from a context ----------

/** The host agent's negotiation prompt. It names allowed terms, never a policy number (D-019). */
export function hostPrompt(context: HostContext, hostName: string): string {
  return loadPrompt("host", {
    host_name: hostName,
    listing_title: context.listing.title,
    allowed_terms: context.policy?.allowed_terms.join(", ") || "none",
  });
}

/** The guest agent's negotiation prompt, with the guest's own private target and maximum. */
export function guestPrompt(context: GuestContext, guestName: string): string {
  return loadPrompt("guest", {
    guest_name: guestName,
    target: context.guestTargetCents === null ? "not set" : formatCents(context.guestTargetCents),
    max: formatCents(context.guestMaxCents),
  });
}
