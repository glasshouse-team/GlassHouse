/**
 * Logs plain async functions to the activity feed (owner: Beka, GH-12).
 * Agent tools are logged automatically by createAgent (agents/core.ts); use this for
 * everything else: Verifier scripts, API actions, human approvals.
 */
import { logEvent } from "@/lib/events";
import type { AgentName } from "@/lib/schemas/core";

export interface WithEventOptions<A extends unknown[], R> {
  /** Dot-separated action, e.g. "xray.run". Failures are logged as "<action>.failed". */
  action: string;
  actorName: string;
  actorType?: "human" | "agent" | "system";
  agent?: AgentName;
  /** One feed line, past tense, at most 140 characters. */
  summarize: (result: R, ...args: A) => string;
  /** Which listing or deal the call belongs to, from its arguments. */
  scope?: (...args: A) => { listingId?: string; dealId?: string };
}

export function withEvent<A extends unknown[], R>(
  options: WithEventOptions<A, R>,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const actorType = options.actorType ?? (options.agent ? "agent" : "system");
  return async (...args: A) => {
    const scope = options.scope?.(...args) ?? {};
    try {
      const result = await fn(...args);
      await logEvent({
        actor_type: actorType,
        actor_name: options.actorName,
        agent: options.agent,
        action: options.action,
        summary: options.summarize(result, ...args),
        listing_id: scope.listingId,
        deal_id: scope.dealId,
      });
      return result;
    } catch (error) {
      await logEvent({
        actor_type: actorType,
        actor_name: options.actorName,
        agent: options.agent,
        action: `${options.action}.failed`,
        summary: `${options.actorName}: ${options.action} failed`,
        listing_id: scope.listingId,
        deal_id: scope.dealId,
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  };
}
