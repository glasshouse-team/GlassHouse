/**
 * CONTRACT FILE (GH-5 / GH-13, owner: Beka). The security boundary between the agents.
 *
 * - The host agent sees the host policy ONLY in "negotiate" mode, never the guest's maximum.
 * - The guest agent sees the deal secrets (target, max), never the host policy.
 * Build these server-side with supabaseAdmin(); never send them to the browser.
 */
import { NotImplementedError } from "@/lib/errors";
import type { Deal, HostPolicy, Listing, TripBrief } from "@/lib/schemas/core";
import type { XrayResult } from "@/lib/schemas/verifier";

export interface HostContext {
  listing: Listing;
  facts: XrayResult | null;
  houseManual: string;
  /** Present only when mode = "negotiate". */
  policy?: HostPolicy;
}

export interface GuestContext {
  deal: Deal;
  listing: Listing;
  facts: XrayResult | null;
  brief: TripBrief | null;
  guestTargetCents: number | null;
  guestMaxCents: number;
}

export async function buildHostContext(
  listingId: string,
  mode: "qa" | "negotiate",
): Promise<HostContext> {
  throw new NotImplementedError("GH-13", `buildHostContext(${listingId}, ${mode})`);
}

export async function buildGuestContext(dealId: string): Promise<GuestContext> {
  throw new NotImplementedError("GH-13", `buildGuestContext(${dealId})`);
}
