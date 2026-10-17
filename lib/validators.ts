/**
 * Negotiation money rules, enforced in code (owner: Beka, GH-13 / GH-15).
 * Every make_offer / accept_offer tool calls validateOffer BEFORE anything is saved.
 * A rejection goes back to the agent as a tool error so it must try again.
 */
import type { HostPolicy } from "./schemas/core";

export type NegotiationPolicy = Pick<
  HostPolicy,
  | "negotiable"
  | "floor_nightly_cents"
  | "max_discount_pct"
  | "auto_accept_total_cents"
  | "allowed_terms"
>;

export type OfferBy = "guest_agent" | "host_agent";
export type OfferKind = "offer" | "counter" | "accept";

export interface OfferCheckInput {
  by: OfferBy;
  kind: OfferKind;
  /** Proposed host subtotal (nights + cleaning) in cents. */
  amountCents: number;
  /** computeQuote(...).hostSubtotalCents for the deal's dates. */
  listTotalCents: number;
  nights: number;
  cleaningCents: number;
  /** The round this message would be (1-based). */
  round: number;
  maxRounds: number;
  terms?: Record<string, unknown>;
  /** Required when by = host_agent. Never passed on the guest side. */
  policy?: NegotiationPolicy;
  /** Required when by = guest_agent. Never passed on the host side. */
  guestMaxCents?: number;
}

export type OfferRejectCode =
  | "invalid_amount"
  | "above_list"
  | "round_limit"
  | "missing_policy"
  | "missing_guest_max"
  | "not_negotiable"
  | "below_floor"
  | "term_not_allowed"
  | "above_guest_max";

export type OfferCheck = { ok: true } | { ok: false; code: OfferRejectCode; reason: string };

const reject = (code: OfferRejectCode, reason: string): OfferCheck => ({ ok: false, code, reason });

/**
 * Lowest total the host agent may offer or accept:
 * the higher of (nights x floor + cleaning) and (list total minus the max discount).
 */
export function effectiveFloorCents(
  policy: Pick<NegotiationPolicy, "floor_nightly_cents" | "max_discount_pct">,
  {
    listTotalCents,
    nights,
    cleaningCents,
  }: { listTotalCents: number; nights: number; cleaningCents: number },
): number {
  const byNightlyFloor = nights * policy.floor_nightly_cents + cleaningCents;
  const byMaxDiscount = Math.ceil(listTotalCents * (1 - policy.max_discount_pct / 100));
  return Math.max(byNightlyFloor, byMaxDiscount);
}

export function validateOffer(input: OfferCheckInput): OfferCheck {
  const { by, kind, amountCents, listTotalCents, round, maxRounds } = input;

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return reject("invalid_amount", "The amount must be a positive whole number of cents.");
  }
  if (amountCents > listTotalCents) {
    return reject("above_list", "The amount is above the listed total; offers can only go down.");
  }
  if (round > maxRounds) {
    return reject("round_limit", `The negotiation is limited to ${maxRounds} rounds.`);
  }

  if (by === "host_agent") {
    const policy = input.policy;
    if (!policy) return reject("missing_policy", "Host offers need the host policy (server bug).");

    if (!policy.negotiable && amountCents !== listTotalCents) {
      return reject(
        "not_negotiable",
        "This host does not negotiate on price. Keep the listed total and offer an allowed term instead.",
      );
    }
    const floor = effectiveFloorCents(policy, input);
    if (amountCents < floor) {
      return reject(
        "below_floor",
        `That is below the host's minimum of ${floor} cents. Counter at or above it, or decline.`,
      );
    }
    const terms = Object.entries(input.terms ?? {}).filter(([, value]) => Boolean(value));
    const notAllowed = terms
      .map(([key]) => key)
      .filter((key) => !policy.allowed_terms.includes(key));
    if (notAllowed.length > 0) {
      return reject("term_not_allowed", `The host has not allowed: ${notAllowed.join(", ")}.`);
    }
    return { ok: true };
  }

  // Guest side
  if (input.guestMaxCents == null) {
    return reject("missing_guest_max", "Guest offers need the guest's maximum (server bug).");
  }
  if (amountCents > input.guestMaxCents) {
    return reject(
      "above_guest_max",
      kind === "accept"
        ? "This is above the guest's maximum. Ask the guest with ask_guest before accepting."
        : "This is above the guest's maximum. Offer less or ask the guest.",
    );
  }
  return { ok: true };
}

/** What happens when the host agent accepts an amount that passed validateOffer. */
export function acceptanceOutcome(
  amountCents: number,
  policy: Pick<NegotiationPolicy, "auto_accept_total_cents">,
): "approved" | "agreed_pending_host" {
  const auto = policy.auto_accept_total_cents;
  return auto != null && amountCents >= auto ? "approved" : "agreed_pending_host";
}
