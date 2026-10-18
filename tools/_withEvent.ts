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
  /** Detail kept with a successful event (the feed shows it in the row's drawer). */
  payload?: (result: R, ...args: A) => Record<string, unknown>;
}

export function withEvent<A extends unknown[], R>(
  options: WithEventOptions<A, R>,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const actorType = options.actorType ?? (options.agent ? "agent" : "system");
  return async (...args: A) => {
    const scope = options.scope?.(...args) ?? {};
    const base = {
      actor_type: actorType,
      actor_name: options.actorName,
      agent: options.agent,
      listing_id: scope.listingId,
      deal_id: scope.dealId,
    };
    let result: R;
    try {
      result = await fn(...args);
    } catch (error) {
      await logEvent({
        ...base,
        action: `${options.action}.failed`,
        summary: `${options.actorName}: ${options.action} failed`,
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
    // The work is done: a broken summary must not turn it into a failure for the caller.
    let summary = `${options.actorName}: ${options.action}`;
    let payload: Record<string, unknown> | undefined;
    try {
      summary = options.summarize(result, ...args);
      payload = options.payload?.(result, ...args);
    } catch (error) {
      console.warn(`[withEvent] could not describe ${options.action}:`, error);
    }
    await logEvent({ ...base, action: options.action, summary, payload });
    return result;
  };
}
