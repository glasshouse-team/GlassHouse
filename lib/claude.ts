import { anthropic } from "@ai-sdk/anthropic";
import { settings } from "./env";

/**
 * Claude models through the AI SDK (v7, docs in node_modules/ai/docs).
 * - agentModel: guest and host agents, negotiation, hard vision (Sonnet 5.5)
 * - bulkModel: X-ray and other bulk checks (Haiku 5.5)
 * The provider reads ANTHROPIC_API_KEY from the environment at call time.
 */
export function agentModel() {
  return anthropic(settings.agentModel);
}

export function bulkModel() {
  return anthropic(settings.bulkModel);
}
