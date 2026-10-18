/**
 * Pure helpers for the Ask-the-space panel (GH-20): read the tool results out of the chat
 * messages and decide which tour actions still have to run.
 */
import { z } from "zod";
import { TourActionSchema, type TourAction } from "./actions";

/** Hero 2 demo questions (D-026); the panel shows them before the first question. */
export const SUGGESTED_QUESTIONS = [
  "Where would I work?",
  "Where's the washing machine?",
  "Show me the bed",
  "What's in the kitchen?",
  "Is there a TV?",
];

/** A tool result as the server sends it (tools/guest/space.ts). Refusals carry no action. */
const SpaceResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    action: TourActionSchema,
    shown: z.string(),
    honestyNote: z.string().optional(),
  }),
  z.object({ ok: z.literal(false) }),
]);

export interface ShownResult {
  toolCallId: string;
  action: TourAction;
  shown: string;
  honestyNote?: string;
}

/** Loose shape of a UI message part, so this works without the server's tool types. */
export interface PartLike {
  type: string;
  toolCallId?: string;
  state?: string;
  output?: unknown;
}

/** The successful, valid tool results of one message, in order. */
export function shownResults(parts: readonly PartLike[]): ShownResult[] {
  const out: ShownResult[] = [];
  for (const part of parts) {
    if (!part.type.startsWith("tool-") || part.state !== "output-available" || !part.toolCallId)
      continue;
    const parsed = SpaceResultSchema.safeParse(part.output);
    if (!parsed.success || !parsed.data.ok) continue;
    const { action, shown, honestyNote } = parsed.data;
    out.push({
      toolCallId: part.toolCallId,
      action,
      shown,
      ...(honestyNote ? { honestyNote } : {}),
    });
  }
  return out;
}

/** Results not run yet; marks them as run in `done` so each action runs once per toolCallId. */
export function takeNewActions(
  messages: readonly { role: string; parts: readonly PartLike[] }[],
  done: Set<string>,
): TourAction[] {
  const fresh: TourAction[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const result of shownResults(message.parts)) {
      if (done.has(result.toolCallId)) continue;
      done.add(result.toolCallId);
      fresh.push(result.action);
    }
  }
  return fresh;
}
