/**
 * ask_host (GH-14, GH-15): the guest agent asks the host agent a question about the home, agent
 * to agent, through Temuri's askHome (GH-16, docs/CONTRACTS.md section 9). The question is saved
 * to a public-read thread, so code refuses one that names a price or the guest's private
 * amounts; askHome itself keeps the question text out of the feed (D-024). One question per run.
 */
import { tool } from "ai";
import { z } from "zod";
import type { AskHomeInput, AskHomeResult } from "@/tools/host-qa/askHome";
import { revealsPrivateAmount } from "@/tools/negotiation/tools";

export interface AskHostSide {
  listingId: string;
  guestId?: string;
  dealId?: string;
  /** The guest's target and maximum: a question naming one is refused. */
  privateAmountsCents: number[];
  /** Shared across the turns of one run, so the agent asks at most once. */
  asked: { done: boolean };
  ask: (input: AskHomeInput) => Promise<AskHomeResult>;
}

/** Any money in the text: "$500", "500 USD", "budget", "price"... */
const MONEY =
  /[$€£₾]\s?\d|\d\s?(usd|dollars?|gel|lari)\b|\b(price|budget|discount|cost|pay|cheaper)\b/i;

export function askHostTool(side: AskHostSide) {
  return tool({
    description:
      "Ask the host agent one neutral question about the home (parking, crib, check-in time, a rule). Never about price, budget or your limits. At most once.",
    inputSchema: z.object({ question: z.string().trim().min(5).max(300) }),
    execute: async ({ question }) => {
      if (side.asked.done)
        return {
          ok: false,
          code: "already_asked",
          summary: "Guest agent already asked the host agent",
        };
      if (MONEY.test(question) || revealsPrivateAmount(question, side.privateAmountsCents))
        return {
          ok: false,
          code: "money_question",
          summary: "Guest agent's question was not sent: it was about money",
        };
      side.asked.done = true;
      try {
        const result = await side.ask({
          listingId: side.listingId,
          question,
          askedBy: "guest_agent",
          guestId: side.guestId,
          dealId: side.dealId,
        });
        return {
          ok: true,
          summary: result.forwarded
            ? "Host agent passed the guest agent's question to the host"
            : "Host agent answered the guest agent's question",
          answer: result.answer,
          sources: result.sources,
          forwarded: result.forwarded,
        };
      } catch (error) {
        console.error("[ask_host] failed", error);
        return {
          ok: false,
          code: "unavailable",
          summary: "Guest agent couldn't reach the host agent",
        };
      }
    },
  });
}
