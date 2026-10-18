/** Request shape and message helpers for POST /api/ask-space (GH-20). */
import { z } from "zod";
import { asData } from "@/agents/data";

export const NOT_READY_MESSAGE =
  "The 3D for this home isn't ready yet, so I can't show you around. Try again once the host's tour is published.";

export const MAX_QUESTION = 500;
/** Earlier turns the agent sees, text only. */
export const HISTORY = 6;

const MessageSchema = z.object({
  id: z.string().max(200),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.looseObject({ type: z.string() })).max(100),
});
export type ChatMessage = z.infer<typeof MessageSchema>;

export const AskSpaceBodySchema = z.object({
  /** Listing uuid or slug. */
  listingId: z.string().min(1).max(100),
  /** The spot world the guest stands in (useTour().worldId). */
  worldId: z.uuid().nullish(),
  version: z.number().int().positive().nullish(),
  messages: z.array(MessageSchema).min(1).max(60),
});

/** The text of a UI message. Tool parts are dropped: the browser could have edited them. */
export function messageText(message: ChatMessage): string {
  return message.parts
    .filter(
      (p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string",
    )
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export const textMessage = (id: string, role: "user" | "assistant", text: string) => ({
  id,
  role,
  parts: [{ type: "text" as const, text }],
});

/** The last question, or "" when the last message isn't the guest's. */
export function lastQuestion(messages: ChatMessage[]): string {
  const last = messages.at(-1);
  return last?.role === "user" ? messageText(last).slice(0, MAX_QUESTION) : "";
}

/**
 * The earlier turns the agent sees: the last few, as text, guest turns wrapped as data. The
 * newest message is replaced by `prompt` (home data plus the wrapped question).
 */
export function agentMessages(messages: ChatMessage[], prompt: string) {
  const last = messages.at(-1)!;
  const history = messages
    .slice(0, -1)
    .slice(-HISTORY)
    .map((m) => ({ m, text: messageText(m) }))
    .filter(({ text }) => text);
  // The conversation the model sees starts with a guest turn.
  while (history[0]?.m.role === "assistant") history.shift();
  const turns = history.map(({ m, text }) =>
    textMessage(
      m.id,
      m.role,
      m.role === "user" ? asData("guest question", text.slice(0, MAX_QUESTION)) : text,
    ),
  );
  return [...turns, textMessage(last.id, "user", prompt)];
}
