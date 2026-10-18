/**
 * The negotiation run loop and the human steps around it (GH-15). Server only.
 *
 * Turns alternate guest agent, host agent. Each turn is one createAgent call with that side's
 * private context, its tools and a move suggested by code; the turn ends once a move went
 * through (custom stopWhen: a refused call does not end it, D-019). If the model doesn't move
 * within its steps, code plays the suggested move through the same validated tools, so a
 * rehearsal never stalls. Server code, not a tool, applies acceptanceOutcome.
 */
import { createAgent } from "@/agents/core";
import { buildGuestContext, buildHostContext, guestPrompt, hostPrompt } from "@/agents/context";
import { asData } from "@/agents/data";
import { stayRangeLabel } from "@/lib/booking";
import {
  getDeal,
  getDealMessages,
  saveDealMessage,
  updateDealIf,
  type DealMessageRow,
} from "@/lib/data/deals";
import { getAvailability, getListing, getProfile } from "@/lib/data/listings";
import { createReservation, hasOverlappingReservation } from "@/lib/data/reservations";
import { isDemoMode } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { computeQuote, stayNights } from "@/lib/pricing";
import type { Deal, DealStatus } from "@/lib/schemas/core";
import { formatCents } from "@/lib/utils";
import { askHostTool } from "@/tools/guest/host";
import { askHome } from "@/tools/host-qa/askHome";
import {
  acceptanceOutcome,
  effectiveFloorCents,
  type NegotiationPolicy,
  type OfferBy,
} from "@/lib/validators";
import { approvalPrompt, suggestMove, type Move, type PastOffer } from "./engine";
import { NEGOTIATION_LOG_INPUTS, negotiationTools, type TurnState } from "./tools";

/** A suggestion for this turn, from public offers plus this side's own private limit. */
export type Suggestion =
  | Move
  | { kind: "keep"; amountCents: number; term: string }
  | { kind: "ask_guest" }
  | { kind: "escalate" };

const roundUpToStep = (cents: number) => Math.ceil(cents / 500) * 500;

/** Host side: accept at auto-accept, never counter below the floor, keep the price if not negotiable. */
export function hostSuggestion(
  offers: PastOffer[],
  listTotalCents: number,
  nights: number,
  cleaningCents: number,
  policy: NegotiationPolicy,
): Suggestion {
  const theirs = [...offers].reverse().find((o) => o.by === "guest_agent")?.amountCents;
  if (!policy.negotiable) {
    const term = policy.allowed_terms[0];
    return term
      ? { kind: "keep", amountCents: listTotalCents, term }
      : { kind: "counter", amountCents: listTotalCents };
  }
  if (
    theirs !== undefined &&
    policy.auto_accept_total_cents !== null &&
    theirs >= policy.auto_accept_total_cents
  )
    return { kind: "accept", amountCents: theirs };
  const floor = effectiveFloorCents(policy, { listTotalCents, nights, cleaningCents });
  // A floor above the list (cheap override nights) leaves nothing to counter with: hand over.
  if (floor > listTotalCents) return { kind: "escalate" };
  const base = suggestMove("host_agent", offers, listTotalCents);
  if (base.kind === "accept" && base.amountCents >= floor) return base;
  return {
    kind: "counter",
    amountCents: Math.min(
      listTotalCents,
      Math.max(base.kind === "accept" ? floor : base.amountCents, roundUpToStep(floor)),
    ),
  };
}

/** Guest side: never past the guest's maximum; ask the guest when the host stays above it. */
export function guestSuggestion(
  offers: PastOffer[],
  listTotalCents: number,
  targetCents: number | null,
  maxCents: number,
): Suggestion {
  const base = suggestMove("guest_agent", offers, listTotalCents, targetCents);
  if (base.amountCents <= maxCents) return base;
  const mine = [...offers].reverse().find((o) => o.by === "guest_agent")?.amountCents;
  if (mine === undefined || mine < maxCents) return { kind: "counter", amountCents: maxCents };
  return { kind: "ask_guest" };
}

function describe(s: Suggestion): string {
  if (s.kind === "ask_guest") return "ask the guest (call ask_guest)";
  if (s.kind === "escalate") return "hand the deal to the host (call escalate_to_host)";
  if (s.kind === "keep")
    return `keep ${formatCents(s.amountCents)} and offer ${s.term.replace("_", " ")} (make_offer with that term)`;
  if (s.kind === "accept") return `accept their ${formatCents(s.amountCents)} (accept_offer)`;
  return `${s.kind} at ${formatCents(s.amountCents)} (make_offer with amountCents ${s.amountCents})`;
}

/** Which side a message's actor speaks for (a person counts for their side). */
function sideOf(actor: string): OfferBy | null {
  if (actor === "guest_agent" || actor === "guest") return "guest_agent";
  if (actor === "host_agent" || actor === "host") return "host_agent";
  return null;
}

/** The side to move: the opposite of the last money move; the guest opens. */
export function nextSide(
  messages: Pick<DealMessageRow, "actor" | "type" | "amount_cents">[],
): OfferBy {
  const last = [...messages]
    .reverse()
    .find(
      (m) =>
        (m.type === "offer" || m.type === "counter" || m.type === "accept") &&
        m.amount_cents !== null &&
        sideOf(m.actor) !== null,
    );
  if (!last) return "guest_agent";
  return sideOf(last.actor) === "guest_agent" ? "host_agent" : "guest_agent";
}

function offersFrom(messages: DealMessageRow[]): PastOffer[] {
  return messages
    .filter((m) => (m.type === "offer" || m.type === "counter") && m.amount_cents !== null)
    .filter(
      (m) =>
        m.actor === "guest_agent" ||
        m.actor === "host_agent" ||
        m.actor === "host" ||
        m.actor === "guest",
    )
    .map((m) => ({
      by: m.actor === "guest_agent" || m.actor === "guest" ? "guest_agent" : "host_agent",
      amountCents: m.amount_cents!,
    }));
}

export interface RunOptions {
  /** Pause between turns so people can read (1.5 s in demo mode). */
  pauseMs?: number;
  /** Safety cap on turns in one run. */
  maxTurns?: number;
}

/** Runs turns until the deal leaves `open`. Returns the final status. */
export async function runNegotiation(
  dealId: string,
  options: RunOptions = {},
): Promise<DealStatus> {
  const pauseMs = options.pauseMs ?? (isDemoMode() ? 1_500 : 0);
  let deal = await getDeal(dealId);
  if (!deal) throw new Error(`Deal ${dealId} not found`);
  const [host, guest, guestProfile] = await Promise.all([
    buildHostContext(deal.listing_id, "negotiate"),
    buildGuestContext(dealId),
    getProfile(deal.guest_id),
  ]);
  const hostProfile = await getProfile(host.listing.host_id);
  const policy = host.policy!;
  const nights = stayNights(deal.check_in, deal.check_out).length;
  const cleaningCents = host.listing.cleaning_fee_cents;
  const stay = stayRangeLabel(deal.check_in, deal.check_out);
  const names = { guest: guestProfile?.name ?? "the guest", host: hostProfile?.name ?? "the host" };
  const askedHost = { done: false };

  for (let turn = 0; turn < (options.maxTurns ?? 12) && deal.status === "open"; turn++) {
    if (deal.rounds >= policy.max_rounds) {
      const expired = await updateDealIf(
        dealId,
        { status: "open", rounds: deal.rounds },
        { status: "expired" },
      );
      if (!expired) break;
      deal = expired;
      await logEvent({
        actor_type: "system",
        actor_name: "Glasshouse",
        action: "deal.expired",
        deal_id: dealId,
        listing_id: deal.listing_id,
        summary: `The deal reached its round limit; ${names.guest} can still accept the last offer`,
      });
      break;
    }
    if (turn > 0 && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));

    const messages = await getDealMessages(dealId);
    const side = nextSide(messages);
    const offers = offersFrom(messages);
    const theirLast = [...messages]
      .reverse()
      .find(
        (m) =>
          (m.type === "offer" || m.type === "counter") &&
          m.amount_cents !== null &&
          sideOf(m.actor) !== side,
      );
    const theirs = theirLast?.amount_cents ?? null;
    const suggestion =
      side === "host_agent"
        ? hostSuggestion(offers, deal.list_total_cents, nights, cleaningCents, policy)
        : guestSuggestion(
            offers,
            deal.list_total_cents,
            guest.guestTargetCents,
            guest.guestMaxCents,
          );

    const state: TurnState = { outcome: null };
    const roundsAtStart = deal.rounds;
    const tools = negotiationTools(
      {
        by: side,
        listTotalCents: deal.list_total_cents,
        nights,
        cleaningCents,
        round: deal.rounds + 1,
        maxRounds: policy.max_rounds,
        moveKind:
          side === "guest_agent" && !offers.some((o) => o.by === "guest_agent")
            ? "offer"
            : "counter",
        theirLastCents: theirs,
        closeEnough: suggestion.kind === "accept",
        theirLastTerms: (theirLast?.terms ?? {}) as Record<string, boolean | number | string>,
        stay,
        ...(side === "host_agent"
          ? {
              policy,
              privateAmountsCents: [
                policy.floor_nightly_cents,
                effectiveFloorCents(policy, {
                  listTotalCents: deal.list_total_cents,
                  nights,
                  cleaningCents,
                }),
                ...(policy.auto_accept_total_cents !== null
                  ? [policy.auto_accept_total_cents]
                  : []),
              ],
            }
          : { guestMaxCents: guest.guestMaxCents, privateAmountsCents: [guest.guestMaxCents] }),
        stillCurrent: async () => {
          const now = await getDeal(dealId);
          return now?.status === "open" && now.rounds === roundsAtStart;
        },
        save: (message) => saveDealMessage(dealId, message),
      },
      state,
    );
    const agent = createAgent({
      name: side === "guest_agent" ? "guest" : "host",
      system:
        side === "guest_agent" ? guestPrompt(guest, names.guest) : hostPrompt(host, names.host),
      tools:
        side === "guest_agent"
          ? {
              ...tools,
              ask_host: askHostTool({
                listingId: deal.listing_id,
                guestId: deal.guest_id,
                dealId,
                privateAmountsCents: [
                  guest.guestMaxCents,
                  ...(guest.guestTargetCents ? [guest.guestTargetCents] : []),
                ],
                asked: askedHost,
                ask: askHome,
              }),
            }
          : tools,
      stopWhen: () => state.outcome !== null,
      maxSteps: 4,
      effort: "low",
      dealId,
      listingId: deal.listing_id,
      logInputs: NEGOTIATION_LOG_INPUTS,
    });
    const prompt = [
      asData("deal", {
        stay,
        guests: deal.guests,
        list_total_usd: deal.list_total_cents / 100,
        round: deal.rounds + 1,
        offers_so_far: offers.map((o) => ({
          by: o.by === "guest_agent" ? "guest agent" : "host agent",
          total_usd: o.amountCents / 100,
        })),
      }),
      `Suggested move: ${describe(suggestion)}. Make exactly one move with your tools, with a short reason.`,
    ].join("\n\n");
    try {
      await agent.generate({ prompt });
    } catch (error) {
      console.error("[negotiation] turn failed", error);
    }
    if (!state.outcome)
      await playSuggestion(tools as unknown as Record<string, Tool>, suggestion, {
        by: side,
        dealId,
        listingId: deal.listing_id,
      });
    if (!state.outcome) break;

    deal = await applyOutcome(deal, side, state.outcome, policy, names, stay);
    if (!deal) break;
  }
  return deal?.status ?? "open";
}

type Tool = { execute: (input: unknown, options: unknown) => Promise<unknown> };
const callOptions = { toolCallId: "code-fallback", messages: [] };

/**
 * Code plays the suggested move when the model didn't; the tools still validate it. These calls
 * bypass createAgent, so the move (or its refusal) is logged here like an agent tool call, with
 * the same public inputs only (D-024).
 */
async function playSuggestion(
  tools: Record<string, Tool>,
  s: Suggestion,
  where: { by: OfferBy; dealId: string; listingId: string },
) {
  const reason = "Suggested by Glasshouse to keep the deal moving.";
  let name: string;
  let input: Record<string, unknown>;
  if (s.kind === "escalate") {
    name = "escalate_to_host";
    input = { reason };
  } else if (s.kind === "ask_guest") {
    name = "ask_guest";
    input = { question: "The host's best price is above your limit. Accept it anyway?" };
  } else if (s.kind === "accept") {
    name = "accept_offer";
    input = { reason };
  } else {
    name = "make_offer";
    input = { amountCents: s.amountCents, terms: s.kind === "keep" ? [s.term] : [], reason };
  }
  const tool = tools[name];
  if (!tool) return;
  let result: { ok?: boolean; summary?: string };
  try {
    result = (await tool.execute(input, callOptions)) as { ok?: boolean; summary?: string };
  } catch (error) {
    console.error("[negotiation] fallback move failed", error);
    result = {
      ok: false,
      summary: `${where.by === "guest_agent" ? "Guest" : "Host"} agent's move failed`,
    };
  }
  await logEvent({
    actor_type: "agent",
    actor_name: where.by === "guest_agent" ? "Guest agent" : "Host agent",
    agent: where.by === "guest_agent" ? "guest" : "host",
    action: `tool.${name}`,
    summary:
      result.summary ?? `${where.by === "guest_agent" ? "Guest" : "Host"} agent used ${name}`,
    deal_id: where.dealId,
    listing_id: where.listingId,
    payload: {
      ok: result.ok === true,
      fallback: true,
      ...(name === "make_offer" && result.ok === true
        ? { input: { amountCents: input.amountCents, terms: input.terms } }
        : {}),
    },
  });
  // Code's move refused too (e.g. a floor above every price): hand over instead of stalling.
  if (result.ok !== true && name !== "escalate_to_host" && name !== "ask_guest") {
    const handOver = where.by === "host_agent" ? "escalate_to_host" : "ask_guest";
    await playSuggestion(
      tools,
      where.by === "host_agent" ? { kind: "escalate" } : { kind: "ask_guest" },
      where,
    );
    void handOver;
  }
}

async function applyOutcome(
  deal: Deal,
  side: OfferBy,
  outcome: NonNullable<TurnState["outcome"]>,
  policy: NegotiationPolicy,
  names: { guest: string; host: string },
  stay: string,
): Promise<Deal | null> {
  const expect = { status: "open" as const, rounds: deal.rounds };
  const rounds = deal.rounds + 1;
  if (outcome.type === "offer" || outcome.type === "counter")
    return updateDealIf(deal.id, expect, { rounds, current_offer_cents: outcome.amountCents });
  if (outcome.type === "accept") {
    const status = acceptanceOutcome(outcome.amountCents, policy);
    const agreed = await updateDealIf(deal.id, expect, {
      rounds,
      status,
      current_offer_cents: outcome.amountCents,
      final_total_cents: outcome.amountCents,
      final_terms: outcome.terms,
    });
    if (!agreed) return null;
    if (status === "approved") {
      try {
        await bookDeal(agreed, `${names.host}'s agent rules (auto-accept)`);
      } catch (error) {
        const declined = await updateDealIf(
          deal.id,
          { status: "approved" },
          { status: "declined" },
        );
        await logEvent({
          actor_type: "system",
          actor_name: "Glasshouse",
          action: "deal.booking_failed",
          deal_id: deal.id,
          listing_id: deal.listing_id,
          summary: `Couldn't book at ${formatCents(outcome.amountCents)}: ${error instanceof Error ? error.message : "booking failed"}`,
        });
        return declined ?? agreed;
      }
    } else {
      await logEvent({
        actor_type: "system",
        actor_name: "Glasshouse",
        action: "deal.agreed",
        deal_id: deal.id,
        listing_id: deal.listing_id,
        summary: `Agents agreed on ${formatCents(outcome.amountCents)} for ${stay}; waiting for ${names.host}`,
        payload: { prompt: approvalPrompt(outcome.amountCents, deal.list_total_cents, stay) },
      });
    }
    return agreed;
  }
  const status: DealStatus = outcome.type === "decline" ? "declined" : "escalated";
  void side;
  return updateDealIf(deal.id, expect, { rounds, status });
}

/** Creates the reservation for an approved deal, with the agreed discount (computeQuote). */
export async function bookDeal(deal: Deal, approvedBy: string): Promise<string> {
  const listing = await getListing(deal.listing_id);
  if (!listing) throw new Error("The home is no longer listed");
  if (await hasOverlappingReservation(deal.listing_id, deal.check_in, deal.check_out))
    throw new Error("These dates were booked in the meantime");
  const { overrides } = await getAvailability(deal.listing_id, deal.check_in);
  const agreed = deal.final_total_cents ?? deal.list_total_cents;
  const quote = computeQuote({
    listing,
    checkIn: deal.check_in,
    checkOut: deal.check_out,
    overrides,
    discountCents: Math.max(0, deal.list_total_cents - agreed),
  });
  const id = await createReservation({
    listing_id: deal.listing_id,
    guest_id: deal.guest_id,
    deal_id: deal.id,
    check_in: deal.check_in,
    check_out: deal.check_out,
    guests: deal.guests,
    nightly_total_cents: quote.nightlyTotalCents,
    cleaning_cents: quote.cleaningCents,
    discount_cents: quote.discountCents,
    service_fee_cents: quote.serviceFeeCents,
    total_cents: quote.totalCents,
    terms: deal.final_terms,
    status: "confirmed",
  });
  await logEvent({
    actor_type: approvedBy.includes("auto-accept") ? "system" : "human",
    actor_name: approvedBy,
    action: "deal.booked",
    deal_id: deal.id,
    listing_id: deal.listing_id,
    summary: `Booked ${listing.title} at ${formatCents(agreed)} for ${stayRangeLabel(deal.check_in, deal.check_out)}, ${formatCents(quote.totalCents)} with fees`,
    payload: {
      reservationId: id,
      totalCents: quote.totalCents,
      discountCents: quote.discountCents,
    },
  });
  return id;
}
