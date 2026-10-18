/**
 * CONTRACT (GH-16, owner: Temuri). The host agent answers one question about a listing.
 * Used by the Ask-this-home route (/api/qa) and, read-only, by Beka's guest-agent tool
 * `ask_host` (GH-14, GH-15) for agent-to-agent questions. Server only.
 *
 * Flow: save the question → the host agent answers from facts, house rules and the manual
 * (`buildHostContext(id, "qa")`, no policy), declines price questions with fixed text, or
 * forwards → save the reply. Every step lands in the activity feed.
 */
import { z } from "zod";
import { buildHostContext, type HostContext } from "@/agents/context";
import { logEvent } from "@/lib/events";
import { DEMO_PROFILES } from "@/seed/fixtures";
import { runHostQa, type QaOutcome, type RunQaOptions } from "./agent";
import { supabaseQaStore, type QaStore } from "./store";

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

export const AskHomeInputSchema = z.object({
  listingId: z.uuid(),
  question: z.string().trim().min(2).max(500),
  askedBy: z.enum(["guest", "guest_agent"]),
  guestId: z.uuid().optional(),
  dealId: z.uuid().optional(),
  conversationId: z.uuid().optional(),
});

export interface AskHomeDeps {
  store: QaStore;
  loadContext: (listingId: string) => Promise<HostContext>;
  run: (context: HostContext, question: string, options: RunQaOptions) => Promise<QaOutcome>;
}

const defaultDeps = (): AskHomeDeps => ({
  store: supabaseQaStore(),
  loadContext: (listingId) => buildHostContext(listingId, "qa"),
  run: runHostQa,
});

function guestName(guestId: string | undefined): string {
  const demo = Object.values(DEMO_PROFILES).find((p) => p.id === guestId);
  return demo?.name ?? "A guest";
}

function quoted(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return `"${flat.length > max ? `${flat.slice(0, max - 1)}…` : flat}"`;
}

/** The waiting line the guest sees while the host has the question. */
export function forwardedNote(hostName: string): string {
  return `I don't have that in the house rules or manual, so I asked ${hostName}. You'll see the reply here.`;
}

export async function askHomeWith(deps: AskHomeDeps, raw: AskHomeInput): Promise<AskHomeResult> {
  const input = AskHomeInputSchema.parse(raw);
  const context = await deps.loadContext(input.listingId);
  const hostName = await deps.store.hostName(context.listing.host_id);
  const { store } = deps;
  const scope = { listing_id: input.listingId, deal_id: input.dealId };
  const agentAsks = input.askedBy === "guest_agent";

  const conversationId = await store.conversation(
    input.listingId,
    input.guestId,
    input.conversationId,
  );
  const questionId = await store.addMessage({
    conversationId,
    actor: input.askedBy,
    body: input.question,
  });
  // The guest agent's question stays out of the public summary: it could carry the
  // guest's private numbers (D-024). A guest's own question is shown in the thread anyway.
  await logEvent({
    ...scope,
    actor_type: agentAsks ? "agent" : "human",
    actor_name: agentAsks ? "Guest agent" : guestName(input.guestId),
    agent: agentAsks ? "guest" : null,
    action: "qa.asked",
    summary: agentAsks
      ? "Guest agent asked the host agent a question"
      : `${guestName(input.guestId)} asked the host agent ${quoted(input.question)}`,
    payload: { conversationId, messageId: questionId, agentToAgent: agentAsks },
  });

  let outcome: QaOutcome;
  try {
    outcome = await deps.run(context, input.question, {
      asker: input.askedBy,
      hostName,
      dealId: input.dealId,
    });
  } catch (error) {
    // A model or network failure must not turn into a guess: the host gets the question.
    console.error("[askHome] host agent failed, forwarding:", error);
    outcome = { kind: "forwarded", fallback: true };
  }

  if (outcome.kind === "forwarded") {
    await store.setNeedsHost(questionId, true);
    await store.addMessage({ conversationId, actor: "host_agent", body: forwardedNote(hostName) });
    if (outcome.fallback) {
      await logEvent({
        ...scope,
        actor_type: "agent",
        actor_name: "Host agent",
        agent: "host",
        action: "qa.forwarded",
        summary: `Host agent forwarded a question to ${hostName}`,
        payload: { conversationId, messageId: questionId, agentToAgent: agentAsks },
      });
    }
    return { conversationId, messageId: questionId, answer: null, sources: [], forwarded: true };
  }

  const sources = outcome.kind === "answered" ? outcome.sources : [];
  const messageId = await store.addMessage({
    conversationId,
    actor: "host_agent",
    body: outcome.answer,
    sources,
    answeredBy: "host_agent",
  });
  return { conversationId, messageId, answer: outcome.answer, sources, forwarded: false };
}

export async function askHome(input: AskHomeInput): Promise<AskHomeResult> {
  return askHomeWith(defaultDeps(), input);
}
