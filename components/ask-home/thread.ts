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

/** Suggested questions on the listing page (GH-16). */
export const SUGGESTED_QUESTIONS = [
  "Can I bring my dog?",
  "Is there parking?",
  "Is the wifi good for video calls?",
] as const;
