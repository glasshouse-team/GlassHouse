/**
 * Negotiation tools (GH-15). Every money tool runs validateOffer BEFORE anything is saved. A
 * refusal is a tool result `{ ok: false, code, summary }`, never an error, so the agent can
 * try again (D-019); the deal room gets a grey `rejected` note from the code, with no amount.
 * The host policy and the guest's maximum live in this server-side closure: the model never
 * sees them, and only `amountCents` and `terms` may reach the feed (D-024).
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { DealActor, DealMessageType, OfferTerms } from "@/lib/schemas/core";
import { validateOffer, type NegotiationPolicy, type OfferBy } from "@/lib/validators";
import { moveSummary, REFUSAL_NOTES, type Move } from "./engine";

/** Extras an agent may put on the table (the host's `allowed_terms` decide which pass). */
const TERMS = ["late_checkout", "early_checkin"] as const;

export interface DealMessageDraft {
  actor: DealActor;
  type: DealMessageType;
  amount_cents: number | null;
  terms: OfferTerms;
  body: string;
}

/** What this turn ended with; null while the agent is still trying. */
export type TurnOutcome =
  | { type: "offer" | "counter" | "accept"; amountCents: number; terms: OfferTerms }
  | { type: "decline" | "escalate" | "question"; body: string };

export interface TurnSide {
  by: OfferBy;
  /** Public deal numbers. */
  listTotalCents: number;
  nights: number;
  cleaningCents: number;
  /** 1-based round this turn's message would be. */
  round: number;
  maxRounds: number;
  /** "offer" for the guest's opening move, "counter" after that. */
  moveKind: "offer" | "counter";
  /** The other side's latest offer: what accept_offer accepts, with its extras. */
  theirLastCents: number | null;
  theirLastTerms?: OfferTerms;
  /** "Nov 9 to Nov 13", for feed lines. */
  stay: string;
  /** Host side only. Never passed to the guest side. */
  policy?: NegotiationPolicy;
  /** Guest side only. Never passed to the host side. */
  guestMaxCents?: number;
  /**
   * This side's private amounts (host: floor, effective floor, auto-accept; guest: maximum).
   * A reason the model wrote that names one is not shown to the other side.
   */
  privateAmountsCents?: number[];
  /**
   * The code's suggestion is to accept (the gap is $15 or less): a counter is refused while
   * accepting their offer would pass the rules, so the deal closes instead of drifting.
   */
  closeEnough?: boolean;
  /** Re-reads the deal just before a move is saved: false when it moved on meanwhile. */
  stillCurrent?: () => Promise<boolean>;
  save: (message: DealMessageDraft) => Promise<void>;
}

export interface TurnState {
  outcome: TurnOutcome | null;
  /** Set synchronously when a move is claimed, so two parallel tool calls can't both move. */
  claimed?: boolean;
}

const ACTOR = { guest_agent: "Guest agent", host_agent: "Host agent" } as const;

function termsRecord(terms: readonly string[]): OfferTerms {
  return Object.fromEntries(terms.map((t) => [t, true]));
}

/** Every way an amount can be written: 50000, 500, $500, 500.00, 50,000. */
function amountForms(cents: number): string[] {
  const dollars = cents / 100;
  const forms = [String(cents), cents.toLocaleString("en-US"), dollars.toFixed(2)];
  if (Number.isInteger(dollars)) forms.push(String(dollars), dollars.toLocaleString("en-US"));
  return forms;
}

/** True when model-written text names one of this side's private amounts. */
export function revealsPrivateAmount(text: string, privateAmountsCents: number[] = []): boolean {
  return privateAmountsCents.some((cents) =>
    amountForms(cents).some((form) =>
      new RegExp(`(^|[^\\d.,])${form.replace(/[.,]/g, (c) => `\\${c}`)}(?![\\d])`).test(text),
    ),
  );
}

/** What the deal room shows for moves that end a turn without a price. Code-written (D-019). */
const EXIT_BODIES = {
  question: "The guest agent asked the guest how to go on.",
  escalate: "The host agent asked the host to decide.",
  decline: "The host agent declined this deal.",
} as const;

/** The tools for one side's turn. `state.outcome` is set by the first move that went through. */
export function negotiationTools(side: TurnSide, state: TurnState): ToolSet {
  const who = ACTOR[side.by];

  const turnOver = {
    ok: false as const,
    code: "turn_over",
    summary: `${who} already moved this turn`,
  };

  const rules = (move: Move, terms: OfferTerms) =>
    validateOffer({
      by: side.by,
      kind: move.kind,
      amountCents: move.amountCents,
      listTotalCents: side.listTotalCents,
      nights: side.nights,
      cleaningCents: side.cleaningCents,
      round: side.round,
      maxRounds: side.maxRounds,
      terms,
      ...(side.by === "host_agent"
        ? { policy: side.policy }
        : { guestMaxCents: side.guestMaxCents }),
    });

  async function money(move: Move, terms: OfferTerms, body: string) {
    if (state.outcome || state.claimed) return turnOver;
    if (
      side.closeEnough &&
      move.kind !== "accept" &&
      side.theirLastCents !== null &&
      rules({ kind: "accept", amountCents: side.theirLastCents }, side.theirLastTerms ?? {}).ok
    )
      return {
        ok: false as const,
        code: "accept_instead",
        summary: `${who} was asked to accept: the offers are close`,
      };
    const check = rules(move, terms);
    if (!check.ok) {
      await side.save({
        actor: side.by,
        type: "rejected",
        amount_cents: null,
        terms: {},
        body: REFUSAL_NOTES[check.code],
      });
      // The code goes back to the agent only; the public summary names no reason (D-019, D-024).
      return {
        ok: false as const,
        code: check.code,
        summary: `${who}'s move was refused by the rules; it tries again`,
      };
    }
    if (state.outcome || state.claimed) return turnOver;
    state.claimed = true;
    if (side.stillCurrent && !(await side.stillCurrent()))
      return {
        ok: false as const,
        code: "deal_moved",
        summary: `The deal moved on before ${who} could`,
      };
    try {
      await side.save({
        actor: side.by,
        type: move.kind,
        amount_cents: move.amountCents,
        terms,
        body: revealsPrivateAmount(body, side.privateAmountsCents) ? "" : body,
      });
    } catch (error) {
      state.claimed = false;
      throw error;
    }
    state.outcome = { type: move.kind, amountCents: move.amountCents, terms };
    return {
      ok: true as const,
      summary: moveSummary(side.by, move, side.listTotalCents, side.stay),
    };
  }

  /**
   * Ends the turn without a price. The model's text stays with this side's agent: the deal room,
   * which both sides read, gets a code-written line (the text could name a private limit).
   */
  async function exit(type: "decline" | "escalate" | "question", summary: string) {
    if (state.outcome || state.claimed) return turnOver;
    state.claimed = true;
    if (side.stillCurrent && !(await side.stillCurrent()))
      return {
        ok: false as const,
        code: "deal_moved",
        summary: `The deal moved on before ${who} could`,
      };
    const body = EXIT_BODIES[type];
    try {
      await side.save({ actor: side.by, type, amount_cents: null, terms: {}, body });
    } catch (error) {
      state.claimed = false;
      throw error;
    }
    state.outcome = { type, body };
    return { ok: true as const, summary };
  }

  const make_offer = tool({
    description:
      "Offer or counter a total for the stay (nights + cleaning) in cents, with an honest short reason. Code checks it against the rules; a refusal comes back as ok: false.",
    inputSchema: z.object({
      amountCents: z.number().int(),
      terms: z.array(z.enum(TERMS)).describe("Extras offered with the price; usually empty"),
      reason: z.string().describe("One sentence the other side reads"),
    }),
    execute: ({ amountCents, terms, reason }) =>
      money({ kind: side.moveKind, amountCents }, termsRecord(terms), reason.trim()),
  });

  const accept_offer = tool({
    description: "Accept the other side's latest offer as it stands.",
    inputSchema: z.object({ reason: z.string().describe("One short sentence") }),
    execute: async ({ reason }) => {
      if (side.theirLastCents === null)
        return {
          ok: false as const,
          code: "nothing_to_accept",
          summary: `${who} had no offer to accept`,
        };
      return money(
        { kind: "accept", amountCents: side.theirLastCents },
        side.theirLastTerms ?? {},
        reason.trim(),
      );
    },
  });

  if (side.by === "host_agent") {
    return {
      make_offer,
      accept_offer,
      decline: tool({
        description: "End the negotiation without a deal.",
        inputSchema: z.object({ reason: z.string() }),
        execute: () => exit("decline", `${who} declined the deal`),
      }),
      escalate_to_host: tool({
        description: "Hand the deal to the host in person, for something only they can decide.",
        inputSchema: z.object({ reason: z.string() }),
        execute: () => exit("escalate", `${who} asked the host to decide`),
      }),
    };
  }
  return {
    make_offer,
    accept_offer,
    ask_guest: tool({
      description:
        "Ask the guest in person, for example when the host's best price is above what they want to pay.",
      inputSchema: z.object({ question: z.string() }),
      execute: () => exit("question", `${who} asked the guest a question`),
    }),
  };
}

/** Only these tool inputs may reach the public feed (D-024). */
export const NEGOTIATION_LOG_INPUTS = {
  make_offer: ["amountCents", "terms"],
};
