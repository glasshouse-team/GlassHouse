/**
 * `pnpm seed`: seeds ~12 listings (2 hero homes), reviews, house rules, host policies,
 * availability and photos. Idempotent; run it as often as you like. Logic: seed/seed.ts.
 */
import { seed } from "../seed/seed";

async function main() {
  const summary = await seed();
  console.table(summary);
  const missing = summary.filter((row) => row.photos === 0).map((row) => row.slug);
  if (missing.length > 0) {
    console.log(`No photos yet for: ${missing.join(", ")} (see seed/PHOTOS.md).`);
  }
  console.log("Seed done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
