/**
 * CONTRACT (GH-16, owner: Temuri). The host agent answers one question about a listing.
 * Used by the Ask-this-home route (/api/qa) and, read-only, by Beka's guest-agent tool
 * `ask_host` (GH-14, GH-15) for agent-to-agent questions. Server only.
 */
import { NotImplementedError } from "@/lib/errors";

export interface AnswerSource {
  type: "fact" | "rule" | "manual";
  /** X-ray fact key, house-rule key, or a short manual section name. */
  key: string;
  /** The exact words the answer relies on. */
  quote?: string;
}

export interface AskHomeInput {
  listingId: string;
  question: string;
  askedBy: "guest" | "guest_agent";
  guestId?: string;
  /** Set when the guest agent asks during a negotiation, so the feed groups it with the deal. */
  dealId?: string;
  /** Reuse an existing Q&A thread; a new `conversations` row (kind "qa") is created if omitted. */
  conversationId?: string;
}

export interface AskHomeResult {
  conversationId: string;
  /** The `messages` row holding the answer, or the forwarded question. */
  messageId: string;
  /** null when the agent could not answer from sources and forwarded the question. */
  answer: string | null;
  sources: AnswerSource[];
  forwarded: boolean;
}

export async function askHome(input: AskHomeInput): Promise<AskHomeResult> {
  throw new NotImplementedError("GH-16", `askHome(${input.listingId})`);
}
