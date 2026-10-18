/**
 * `pnpm demo:reset [--dry-run]` (GH-26): deletes what demo runs left (deals, reservations,
 * Q&A conversations, trip briefs, and events logged after the latest seed.completed),
 * deletes homes hosts added in the app (D-043), restores hero-1's policy and manual, and
 * publishes hero 2 v1, the gap version (D-026).
 * `--dry-run` prints the plan and writes nothing. Logic: seed/reset.ts, seed/reset-plan.ts.
 */
import { parseArgs } from "node:util";
import { describePlan } from "../seed/reset-plan";
import { applyReset, DEMO_WORLD, planReset, seedCounts } from "../seed/reset";

async function main() {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
  const plan = await planReset();
  const dryRun = values["dry-run"];
  console.log(dryRun ? "Dry run, nothing is written. Would:" : "Resetting the demo:");
  for (const line of describePlan(plan, DEMO_WORLD.listing.slug)) console.log(`  - ${line}`);
  if (dryRun) return;

  await applyReset(plan);
  console.log("Seed rows kept:");
  console.table(await seedCounts());
  console.log("Demo ready");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
