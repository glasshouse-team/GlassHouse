/**
 * GH-16 (owner: Temuri). Q&A thread rows as the browser reads them from `messages`
 * (public read + Realtime), parsed and merged. Pure, so it is unit-tested.
 */
import { z } from "zod";

export const MESSAGE_COLUMNS =
  "id, conversation_id, actor, body, sources, needs_host, answered_by, created_at";

const SourceSchema = z.object({
  type: z.enum(["fact", "rule", "manual"]),
  key: z.string(),
  quote: z.string().optional(),
});

export const QaMessageSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  actor: z.enum(["guest", "guest_agent", "host", "host_agent", "system"]),
  body: z.string(),
  sources: z.array(SourceSchema).catch([]),
  needs_host: z.boolean(),
  answered_by: z.string().nullable(),
  created_at: z.string(),
});
export type QaMessage = z.infer<typeof QaMessageSchema>;

export function parseMessages(rows: unknown[]): QaMessage[] {
  return rows.flatMap((row) => {
    const parsed = QaMessageSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Adds or replaces rows by id (an UPDATE clears `needs_host`), oldest first. */
export function mergeMessages(current: QaMessage[], incoming: QaMessage[]): QaMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

const asks = (m: QaMessage) => m.actor === "guest" || m.actor === "guest_agent";

/**
 * Display order: a host reply (its `answered_by` is the question's id) goes right under the
 * question it answers, after the host agent's "I asked the host" note, instead of at the end
 * of the thread. Everything else keeps its time order. Takes rows sorted by mergeMessages.
 */
export function threadOrder(messages: QaMessage[]): QaMessage[] {
  const questions = new Set(messages.filter(asks).map((m) => m.id));
  const replyTo = (m: QaMessage) =>
    m.actor === "host" && m.answered_by && questions.has(m.answered_by) ? m.answered_by : null;
  const replies = new Map<string, QaMessage[]>();
  for (const m of messages) {
    const to = replyTo(m);
    if (to) replies.set(to, [...(replies.get(to) ?? []), m]);
  }
  const ordered: QaMessage[] = [];
  let due: QaMessage[] = [];
  for (const m of messages) {
    if (replyTo(m)) continue;
    if (asks(m)) {
      ordered.push(...due);
      due = replies.get(m.id) ?? [];
    }
    ordered.push(m);
  }
  return [...ordered, ...due];
}

/** Suggested questions on the listing page (GH-16). */
export const SUGGESTED_QUESTIONS = [
  "Can I bring my dog?",
  "Is there parking?",
  "Is the wifi good for video calls?",
] as const;
