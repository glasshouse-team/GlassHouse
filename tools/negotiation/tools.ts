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
  /** The other side's latest offer: what accept_offer accepts. */
  theirLastCents: number | null;
  /** "Nov 9 to Nov 13", for feed lines. */
  stay: string;
  /** Host side only. Never passed to the guest side. */
  policy?: NegotiationPolicy;
  /** Guest side only. Never passed to the host side. */
  guestMaxCents?: number;
  save: (message: DealMessageDraft) => Promise<void>;
}

export interface TurnState {
  outcome: TurnOutcome | null;
}

const ACTOR = { guest_agent: "Guest agent", host_agent: "Host agent" } as const;

function termsRecord(terms: readonly string[]): OfferTerms {
  return Object.fromEntries(terms.map((t) => [t, true]));
}

/** The tools for one side's turn. `state.outcome` is set by the first move that went through. */
export function negotiationTools(side: TurnSide, state: TurnState): ToolSet {
  const who = ACTOR[side.by];

  async function money(move: Move, terms: OfferTerms, body: string) {
    if (state.outcome)
      return { ok: false as const, code: "turn_over", summary: `${who} already moved this turn` };
    const check = validateOffer({
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
    if (!check.ok) {
      await side.save({
        actor: side.by,
        type: "rejected",
        amount_cents: null,
        terms: {},
        body: REFUSAL_NOTES[check.code],
      });
      return {
        ok: false as const,
        code: check.code,
        summary: `${who}'s move was refused by the rules (${check.code}); it tries again`,
      };
    }
    await side.save({
      actor: side.by,
      type: move.kind,
      amount_cents: move.amountCents,
      terms,
      body,
    });
    state.outcome = { type: move.kind, amountCents: move.amountCents, terms };
    return {
      ok: true as const,
      summary: moveSummary(side.by, move, side.listTotalCents, side.stay),
    };
  }

  async function exit(type: "decline" | "escalate" | "question", body: string, summary: string) {
    if (state.outcome)
      return { ok: false as const, code: "turn_over", summary: `${who} already moved this turn` };
    await side.save({ actor: side.by, type, amount_cents: null, terms: {}, body });
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
      return money({ kind: "accept", amountCents: side.theirLastCents }, {}, reason.trim());
    },
  });

  if (side.by === "host_agent") {
    return {
      make_offer,
      accept_offer,
      decline: tool({
        description: "End the negotiation without a deal.",
        inputSchema: z.object({ reason: z.string() }),
        execute: ({ reason }) => exit("decline", reason.trim(), `${who} declined the deal`),
      }),
      escalate_to_host: tool({
        description: "Hand the deal to the host in person, for something only they can decide.",
        inputSchema: z.object({ reason: z.string() }),
        execute: ({ reason }) => exit("escalate", reason.trim(), `${who} asked the host to decide`),
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
      execute: ({ question }) =>
        exit("question", question.trim(), `${who} asked the guest a question`),
    }),
  };
}

/** Only these tool inputs may reach the public feed (D-024). */
export const NEGOTIATION_LOG_INPUTS = {
  make_offer: ["amountCents", "terms"],
};
