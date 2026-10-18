/**
 * One negotiation loop per deal at a time (GH-15). The conditional updates in lib/data/deals.ts
 * already stop two loops from both moving the deal; this lock also stops the second one from
 * starting, so it can't save a duplicate message before losing that race. Per server instance,
 * which is enough for the demo's single deployment.
 */
import { runNegotiation, type RunOptions } from "./flow";

const running = new Set<string>();

export function isRunning(dealId: string): boolean {
  return running.has(dealId);
}

/** Runs the loop unless one already runs for this deal. Returns false when it was busy. */
export async function runOnce(dealId: string, options?: RunOptions): Promise<boolean> {
  if (running.has(dealId)) return false;
  running.add(dealId);
  try {
    await runNegotiation(dealId, options);
  } catch (error) {
    console.error("[negotiation] run failed", error);
  } finally {
    running.delete(dealId);
  }
  return true;
}
