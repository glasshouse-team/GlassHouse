/**
 * Inserts one test event so you can watch it arrive in an open feed (GH-12: within 2 seconds,
 * no refresh). Usage: pnpm exec tsx --env-file-if-exists=.env.local scripts/ping-event.ts [listingId]
 * With a listing id it also shows on that listing's page and the host dashboard.
 * `pnpm demo:reset` (GH-26) clears it with the other events after the seed.
 */
import { supabaseAdmin } from "../lib/supabase";

async function main() {
  const listingId = process.argv[2] ?? null;
  const time = new Date().toISOString().slice(11, 19);
  const { data, error } = await supabaseAdmin()
    .from("events")
    .insert({
      actor_type: "system",
      actor_name: "System",
      action: "system.ping",
      listing_id: listingId,
      summary: `Test ping at ${time} UTC`,
    })
    .select("id, created_at")
    .single();
  if (error) throw new Error(error.message);
  console.log(
    `Sent event ${data.id} at ${data.created_at}. Delete it with: delete from events where action = 'system.ping';`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
