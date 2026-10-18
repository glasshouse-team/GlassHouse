/**
 * Runs the Verifier X-ray on seed listings (GH-9, owner: Temuri). See docs/tickets/GH-9.md.
 *
 *   pnpm xray                                  every listing with photos, saved to listing_facts
 *   pnpm xray --listing hero-2 --model agent   one listing with Sonnet
 *   pnpm xray --runs 3                         eval: 3 runs each, scored against
 *                                              tools/verifier/fixtures/xray-expected.json, not saved
 *   --save        also save eval runs (the last run wins)
 *   --price 1,5   USD per million input,output tokens, to print the cost
 *
 * Default model: Sonnet on the hero homes, Haiku elsewhere.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { supabaseAdmin } from "@/lib/supabase";
import { ExpectedSchema, scoreRun } from "@/tools/verifier/xray-score";
import { runXray, xrayListing, type XrayModel, type XrayUsage } from "@/tools/verifier/xray";

const { values } = parseArgs({
  options: {
    listing: { type: "string" },
    model: { type: "string" },
    runs: { type: "string", default: "1" },
    save: { type: "boolean", default: false },
    price: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) fail("--runs must be a whole number, 1 or more");
if (values.model && values.model !== "bulk" && values.model !== "agent")
  fail("--model must be bulk (Haiku) or agent (Sonnet)");
const model = values.model as XrayModel | undefined;
const price = values.price?.split(",").map(Number);
if (price && (price.length !== 2 || price.some((n) => !Number.isFinite(n))))
  fail("--price takes two numbers: USD per million input and output tokens, e.g. --price 1,5");
const save = runs === 1 || values.save;

const expected = ExpectedSchema.parse(
  JSON.parse(
    readFileSync(path.join(process.cwd(), "tools/verifier/fixtures/xray-expected.json"), "utf8"),
  ),
);

async function main() {
  const db = supabaseAdmin();
  let query = db.from("listings").select("id, slug, listing_photos(count)").order("slug");
  if (values.listing) query = query.eq("slug", values.listing);
  const { data: listings, error } = await query;
  if (error) fail(`Could not load listings: ${error.message}`);
  if (!listings?.length) fail(values.listing ? `No listing "${values.listing}"` : "No listings");

  const total: XrayUsage = { inputTokens: 0, outputTokens: 0 };
  const lieTally = new Map<string, number>();
  let invented = 0;
  let skipped = 0;

  for (const listing of listings) {
    const photos = listing.listing_photos[0]?.count ?? 0;
    if (photos === 0) {
      console.log(`- ${listing.slug}: no photos, skipped (seed/PHOTOS.md)`);
      skipped++;
      continue;
    }
    for (let run = 1; run <= runs; run++) {
      const options = { model, save };
      const result = await (save ? runXray : xrayListing)(listing.id, options);
      total.inputTokens += result.usage.inputTokens;
      total.outputTokens += result.usage.outputTokens;
      const score = scoreRun(result.result, expected[listing.slug]);
      for (const lie of score.caught) lieTally.set(lie, (lieTally.get(lie) ?? 0) + 1);
      invented += score.invented.length;

      const tag = runs > 1 ? ` run ${run}/${runs}` : "";
      console.log(
        `- ${listing.slug}${tag} (${result.model}, ${result.photoCount} photos): ` +
          `${result.result.facts.length} facts, ${result.result.contradictions.length} contradictions, ` +
          `${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens`,
      );
      for (const c of result.result.contradictions)
        console.log(`    contradiction [${c.severity}]: "${c.claim}": ${c.finding}`);
      if (score.caught.length) console.log(`    caught: ${score.caught.join(", ")}`);
      if (score.missed.length) console.log(`    MISSED: ${score.missed.join(", ")}`);
      if (score.invented.length) console.log(`    INVENTED: ${score.invented.join(" | ")}`);
      if (score.wrongFacts.length) console.log(`    wrong facts: ${score.wrongFacts.join("; ")}`);
      if (result.result.missing_photos.length)
        console.log(`    not shown: ${result.result.missing_photos.join(", ")}`);
    }
  }

  console.log("");
  for (const [slug, want] of Object.entries(expected)) {
    for (const lie of want.lies) {
      const ran = listings.some((l) => l.slug === slug && (l.listing_photos[0]?.count ?? 0) > 0);
      console.log(
        ran
          ? `Lie "${lie.name}" (${slug}): caught in ${lieTally.get(lie.name) ?? 0} of ${runs} runs`
          : `Lie "${lie.name}" (${slug}): not run`,
      );
    }
  }
  console.log(`Invented contradictions: ${invented}. Skipped without photos: ${skipped}.`);
  const tokens = `${total.inputTokens} input + ${total.outputTokens} output tokens`;
  console.log(
    price
      ? `Total: ${tokens} = $${((total.inputTokens * price[0] + total.outputTokens * price[1]) / 1e6).toFixed(3)}`
      : `Total: ${tokens} (add --price <in>,<out> for the cost)`,
  );
  if (!save) console.log("Eval runs were not saved (add --save).");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
