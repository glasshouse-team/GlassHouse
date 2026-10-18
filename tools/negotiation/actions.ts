/**
 * What people do in a deal (GH-15): the host approves or declines an agreed price or counters
 * in person; the guest stops or accepts the host's last offer. Each is a conditional update, so
 * a tap that lost a race does nothing, and each lands in the feed. Server only.
 */
import { buildHostContext } from "@/agents/context";
import { stayRangeLabel } from "@/lib/booking";
import { getDeal, getDealMessages, saveDealMessage, updateDealIf } from "@/lib/data/deals";
import { logEvent } from "@/lib/events";
import type { Deal, DealStatus } from "@/lib/schemas/core";
import { formatCents } from "@/lib/utils";
import { acceptanceOutcome } from "@/lib/validators";
import type { Viewer } from "@/lib/viewer";
import { bookDeal } from "./flow";

export class DealActionError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function load(dealId: string): Promise<Deal> {
  const deal = await getDeal(dealId);
  if (!deal) throw new DealActionError(404, "not_found", "This deal does not exist.");
  return deal;
}

async function hostOfDeal(deal: Deal, viewer: Viewer) {
  const host = await buildHostContext(deal.listing_id, "negotiate");
  if (viewer.role !== "host" || host.listing.host_id !== viewer.profileId)
    throw new DealActionError(403, "not_your_listing", "Only this home's host can do that.");
  return host;
}

function ownGuest(deal: Deal, viewer: Viewer) {
  if (viewer.role !== "guest" || deal.guest_id !== viewer.profileId)
    throw new DealActionError(403, "not_your_deal", "Only the guest of this deal can do that.");
}

const lost = () =>
  new DealActionError(409, "deal_moved", "The deal changed a moment ago. Look at it again.");

/** The host approves the agreed price: the reservation is created with the discount line. */
export async function approve(dealId: string, viewer: Viewer): Promise<string> {
  const deal = await load(dealId);
  await hostOfDeal(deal, viewer);
  const approved = await updateDealIf(
    dealId,
    { status: "agreed_pending_host" },
    { status: "approved" },
  );
  if (!approved) throw lost();
  try {
    return await bookDeal(approved, viewer.name);
  } catch (error) {
    await updateDealIf(dealId, { status: "approved" }, { status: "declined" });
    throw new DealActionError(
      409,
      "cannot_book",
      error instanceof Error ? error.message : "Could not book.",
    );
  }
}

/** The host declines the agreed price. */
export async function decline(dealId: string, viewer: Viewer): Promise<void> {
  const deal = await load(dealId);
  await hostOfDeal(deal, viewer);
  if (!(await updateDealIf(dealId, { status: "agreed_pending_host" }, { status: "declined" })))
    throw lost();
  await saveDealMessage(dealId, {
    actor: "host",
    type: "decline",
    amount_cents: null,
    terms: {},
    body: `${viewer.name} declined this price.`,
  });
  await logEvent({
    actor_type: "human",
    actor_name: `${viewer.name} (host)`,
    action: "deal.declined",
    deal_id: dealId,
    listing_id: deal.listing_id,
    summary: `${viewer.name} declined ${formatCents(deal.final_total_cents ?? 0)} for ${stayRangeLabel(deal.check_in, deal.check_out)}`,
  });
}

/**
 * The host counters in person; the guest agent answers on the next run. Deliberately not
 * checked by validateOffer: the agent rules limit the host's agent, not the host, who may
 * price below their own floor. The amount is still bounded (above $0, up to the list), and the
 * round limit still applies to the agents' turns that follow (the run expires the deal).
 */
export async function hostCounter(
  dealId: string,
  viewer: Viewer,
  amountCents: number,
): Promise<void> {
  const deal = await load(dealId);
  await hostOfDeal(deal, viewer);
  if (amountCents <= 0 || amountCents > deal.list_total_cents)
    throw new DealActionError(
      400,
      "bad_amount",
      "Counter with a price above $0 and up to the list price.",
    );
  const from = deal.status;
  if (!["open", "escalated", "agreed_pending_host"].includes(from))
    throw new DealActionError(409, "deal_closed", "This negotiation has already ended.");
  const moved = await updateDealIf(
    dealId,
    { status: from, rounds: deal.rounds },
    {
      status: "open",
      rounds: deal.rounds + 1,
      current_offer_cents: amountCents,
      final_total_cents: null,
    },
  );
  if (!moved) throw lost();
  await saveDealMessage(dealId, {
    actor: "host",
    type: "counter",
    amount_cents: amountCents,
    terms: {},
    body: `${viewer.name} countered in person.`,
  });
  await logEvent({
    actor_type: "human",
    actor_name: `${viewer.name} (host)`,
    action: "deal.countered",
    deal_id: dealId,
    listing_id: deal.listing_id,
    summary: `${viewer.name} countered at ${formatCents(amountCents)} in person`,
  });
}

/** The guest stops the negotiation. */
export async function stop(dealId: string, viewer: Viewer): Promise<void> {
  const deal = await load(dealId);
  ownGuest(deal, viewer);
  const from = deal.status;
  if (!["open", "escalated", "expired"].includes(from))
    throw new DealActionError(409, "deal_closed", "This negotiation has already ended.");
  if (!(await updateDealIf(dealId, { status: from }, { status: "declined" }))) throw lost();
  await saveDealMessage(dealId, {
    actor: "guest",
    type: "info",
    amount_cents: null,
    terms: {},
    body: `${viewer.name} stopped the negotiation.`,
  });
  await logEvent({
    actor_type: "human",
    actor_name: `${viewer.name} (guest)`,
    action: "deal.stopped",
    deal_id: dealId,
    listing_id: deal.listing_id,
    summary: `${viewer.name} stopped the negotiation`,
  });
}

/**
 * The guest accepts the host's last offer, for example after the round limit or when the
 * guest agent asked. The host's own rules decide whether it books now or waits for approval.
 */
export async function acceptLast(dealId: string, viewer: Viewer): Promise<DealStatus> {
  const deal = await load(dealId);
  ownGuest(deal, viewer);
  const from = deal.status;
  if (!["open", "escalated", "expired"].includes(from))
    throw new DealActionError(409, "deal_closed", "This negotiation has already ended.");
  const last = [...(await getDealMessages(dealId))]
    .reverse()
    .find(
      (m) =>
        (m.actor === "host_agent" || m.actor === "host") &&
        (m.type === "offer" || m.type === "counter") &&
        m.amount_cents !== null,
    );
  if (!last?.amount_cents)
    throw new DealActionError(409, "no_offer", "The host hasn't made an offer yet.");
  const { policy } = await buildHostContext(deal.listing_id, "negotiate");
  const status = acceptanceOutcome(last.amount_cents, policy!);
  const agreed = await updateDealIf(
    dealId,
    { status: from, rounds: deal.rounds },
    {
      status,
      rounds: deal.rounds + 1,
      current_offer_cents: last.amount_cents,
      final_total_cents: last.amount_cents,
      final_terms: (last.terms ?? {}) as Record<string, unknown>,
    },
  );
  if (!agreed) throw lost();
  await saveDealMessage(dealId, {
    actor: "guest",
    type: "accept",
    amount_cents: last.amount_cents,
    terms: {},
    body: `${viewer.name} accepted the host's offer.`,
  });
  await logEvent({
    actor_type: "human",
    actor_name: `${viewer.name} (guest)`,
    action: "deal.accepted",
    deal_id: dealId,
    listing_id: deal.listing_id,
    summary: `${viewer.name} accepted ${formatCents(last.amount_cents)} for ${stayRangeLabel(deal.check_in, deal.check_out)}`,
  });
  if (status === "approved") await bookDeal(agreed, "Host's agent rules (auto-accept)");
  return status;
}
