/**
 * GH-16 (owner: Temuri). The host answers a forwarded question (QuestionsWaiting). The reply
 * goes into the guest's thread, the question leaves the waiting list, and with
 * `saveToManual` the Q&A is appended to the manual's "## Host answers" part, so the agent
 * answers it from a source next time (the learning loop). Server only.
 */
import { z } from "zod";
import { logEvent } from "@/lib/events";
import { appendHostAnswer } from "./sources";
import { supabaseQaStore, type QaStore } from "./store";

export const HostReplyInputSchema = z.object({
  messageId: z.uuid(),
  answer: z.string().trim().min(1).max(600),
  saveToManual: z.boolean().default(false),
});
export type HostReplyInput = z.input<typeof HostReplyInputSchema>;

export class QaReplyError extends Error {
  constructor(
    readonly status: 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface HostReplyResult {
  messageId: string;
  conversationId: string;
  savedToManual: boolean;
}

export async function hostReplyWith(
  store: QaStore,
  raw: HostReplyInput,
  /** The profile replying; must own the listing. */
  hostId: string,
): Promise<HostReplyResult> {
  const input = HostReplyInputSchema.parse(raw);
  const question = await store.question(input.messageId);
  if (!question) throw new QaReplyError(404, "That question does not exist.");
  if (question.hostId !== hostId) throw new QaReplyError(403, "Only this home's host can reply.");
  // Claim the question first, so two replies at once cannot both go through.
  if (!question.needsHost || !(await store.markAnswered(question.id, "host")))
    throw new QaReplyError(409, "This question was already answered.");

  let messageId: string;
  try {
    // The manual first: appendHostAnswer skips a line it already has, so a retry after a
    // failed message insert does not add the answer twice.
    if (input.saveToManual) {
      const manual = appendHostAnswer(question.houseManual, question.body, input.answer);
      if (manual !== question.houseManual) await store.setHouseManual(question.listingId, manual);
    }
    // The reply's `answered_by` holds the question's id, so the thread shows it under it.
    messageId = await store.addMessage({
      conversationId: question.conversationId,
      actor: "host",
      body: input.answer,
      answeredBy: question.id,
    });
  } catch (error) {
    // Nothing reached the guest: put the question back on the waiting list so the host can retry.
    await store.setNeedsHost(question.id, true).catch((rollback: unknown) => {
      console.warn("[hostReply] could not reopen the question:", rollback);
    });
    throw error;
  }

  // The reply is delivered; a failed name lookup must not turn it into an error.
  const name = await store.hostName(hostId).catch(() => "The host");
  await logEvent({
    actor_type: "human",
    actor_name: `${name} (host)`,
    action: "qa.host_replied",
    summary: input.saveToManual
      ? `${name} answered a forwarded question and saved it to the house manual`
      : `${name} answered a forwarded question`,
    listing_id: question.listingId,
    payload: { conversationId: question.conversationId, questionId: question.id, messageId },
  });
  return { messageId, conversationId: question.conversationId, savedToManual: input.saveToManual };
}

export async function hostReply(raw: HostReplyInput, hostId: string): Promise<HostReplyResult> {
  return hostReplyWith(supabaseQaStore(), raw, hostId);
}
