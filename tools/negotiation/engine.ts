/**
 * Negotiation logic that needs no model or database (GH-15): the move code suggests for each
 * turn, the public notes for refused moves, and the feed lines. Everything here is built from
 * public numbers only (the list total and the offers already made), never from a host policy
 * or the guest's limits, so it may appear in prompts and in the deal room.
 */
import type { OfferBy, OfferRejectCode } from "@/lib/validators";
import { formatCents } from "@/lib/utils";

export interface PastOffer {
  by: OfferBy;
  amountCents: number;
}
export interface Move {
  kind: "offer" | "counter" | "accept";
  amountCents: number;
}

/** Suggested amounts are whole $5 steps. */
const STEP_CENTS = 500;
/** When the two sides are this close, the side whose turn it is accepts. */
const CLOSE_GAP_CENTS = 1_500;

const floorToStep = (cents: number) => Math.floor(cents / STEP_CENTS) * STEP_CENTS;

/**
 * The move code suggests for `side`, from the offers so far (oldest first): the guest opens at
 * its target (or 10% off the list), then each side meets the other halfway, rounded down to
 * $5, and accepts once the gap is $15 or less. The demo goes $470, $495, $480, accept.
 * The model may deviate, but only within what validateOffer allows.
 */
export function suggestMove(
  side: OfferBy,
  offers: PastOffer[],
  listTotalCents: number,
  guestTargetCents: number | null = null,
): Move {
  const latest = (by: OfferBy) => [...offers].reverse().find((o) => o.by === by)?.amountCents;
  const theirs = latest(side === "guest_agent" ? "host_agent" : "guest_agent");
  const mine = latest(side) ?? (side === "host_agent" ? listTotalCents : undefined);
  if (side === "guest_agent" && mine === undefined) {
    const opening = guestTargetCents ?? floorToStep(listTotalCents * 0.9);
    return { kind: "offer", amountCents: Math.min(opening, listTotalCents) };
  }
  if (theirs === undefined || mine === undefined)
    return { kind: "offer", amountCents: mine ?? listTotalCents };
  if (Math.abs(mine - theirs) <= CLOSE_GAP_CENTS) return { kind: "accept", amountCents: theirs };
  return { kind: "counter", amountCents: floorToStep((mine + theirs) / 2) };
}

/**
 * What the deal room shows for a refused move. No amounts: the refusal reason can name the
 * host's floor or the guest's maximum, and both sides read the deal room (D-019).
 */
export const REFUSAL_NOTES: Record<OfferRejectCode, string> = {
  invalid_amount: "An offer amount wasn't valid, so it wasn't sent.",
  above_list: "An offer above the list price wasn't sent.",
  round_limit: "The round limit was reached.",
  missing_policy: "The host's agent rules weren't available.",
  missing_guest_max: "The guest's limit wasn't available.",
  not_negotiable: "This host keeps the list price; the host agent can offer an extra instead.",
  below_floor: "That price is below what this host allows, so the host agent tried again.",
  term_not_allowed: "That extra isn't one this host offers.",
  above_guest_max: "That's more than the guest wants to pay, so the guest agent tried again.",
};

const ACTOR = { guest_agent: "Guest agent", host_agent: "Host agent" } as const;

/** "-$50" or "+$10" against the list total; "" when equal. */
export function differenceFromList(amountCents: number, listTotalCents: number): string {
  const diff = amountCents - listTotalCents;
  if (diff === 0) return "";
  return diff < 0 ? `-${formatCents(-diff)}` : `+${formatCents(diff)}`;
}

/** Feed line for a money move, e.g. "Guest agent offered $470 for Nov 9 to Nov 13 (-$50)". */
export function moveSummary(by: OfferBy, move: Move, listTotalCents: number, stay: string): string {
  const diff = differenceFromList(move.amountCents, listTotalCents);
  const amount = `${formatCents(move.amountCents)}${diff ? ` (${diff})` : ""}`;
  if (move.kind === "accept") return `${ACTOR[by]} accepted ${amount} for ${stay}`;
  if (move.kind === "counter") return `${ACTOR[by]} countered at ${amount}`;
  return `${ACTOR[by]} offered ${amount} for ${stay}`;
}

/** "Approve $480 for Nov 9 to Nov 13 (-$40, 7.7% off)?" for the host's toast and queue. */
export function approvalPrompt(amountCents: number, listTotalCents: number, stay: string): string {
  const off = listTotalCents - amountCents;
  const pct = ((off / listTotalCents) * 100).toFixed(1);
  return off > 0
    ? `Approve ${formatCents(amountCents)} for ${stay} (-${formatCents(off)}, ${pct}% off)?`
    : `Approve ${formatCents(amountCents)} for ${stay}?`;
}
