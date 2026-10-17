/**
 * Seeds the demo dataset (GH-7). Idempotent: every row has a fixed or slug-derived id, so
 * each run updates the same rows. `scripts/seed.ts` runs `seed()`; the demo reset (GH-26)
 * reuses `restoreHeroPolicy()` and `restoreHeroManual()`. Server only (service-role key).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { logEvent } from "@/lib/events";
import { XrayResultSchema } from "@/lib/schemas/verifier";
import { BUCKETS, publicMediaUrl, supabaseAdmin } from "@/lib/supabase";
import { SEED_LISTINGS, type SeedListing } from "./data/listings";
import { DEMO_PROFILES, HERO_LISTINGS, SEED_COMPLETED_ACTION } from "./fixtures";
import {
  availabilityRows,
  heroFactsRow,
  isPhotoName,
  listingId,
  listingRow,
  photoRows,
  policyRow,
  reviewRows,
  withWasherFact,
  type SeedPhoto,
} from "./rows";

/** Local photos for non-hero listings: `seed/photos/<slug>/NN-room.jpg` (git-ignored). */
const LOCAL_PHOTOS_DIR = path.join(process.cwd(), "seed", "photos");

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface SeedSummaryRow {
  slug: string;
  city: string;
  nightly: string;
  negotiable: boolean;
  reviews: number;
  photos: number;
}

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`Seed failed at ${what}: ${error.message}`);
}

const photoFolder = (id: string) => `listings/${id}/photos`;

/** Uploads `seed/photos/<slug>/` (if present) to the listing's Storage folder. */
async function uploadLocalPhotos(slug: string, id: string): Promise<number> {
  const dir = path.join(LOCAL_PHOTOS_DIR, slug);
  const names = await readdir(dir).catch(() => [] as string[]);
  const photos = names.filter(isPhotoName);
  for (const name of photos) {
    const body = await readFile(path.join(dir, name));
    const contentType = CONTENT_TYPES[path.extname(name).toLowerCase()];
    const { error } = await supabaseAdmin()
      .storage.from(BUCKETS.media)
      .upload(`${photoFolder(id)}/${name}`, body, { contentType, upsert: true });
    check(error, `upload ${slug}/${name}`);
  }
  return photos.length;
}

/** Mirrors the listing's Storage folder into `listing_photos` (hero photos come from GH-6). */
async function syncPhotos(id: string) {
  const db = supabaseAdmin();
  const { data: files, error } = await db.storage
    .from(BUCKETS.media)
    .list(photoFolder(id), { limit: 100 });
  check(error, `list photos of ${id}`);
  const rows = photoRows(
    id,
    (files ?? []).map((f) => f.name),
    (name) => publicMediaUrl(`${photoFolder(id)}/${name}`),
  );
  let saved: SeedPhoto[] = [];
  if (rows.length > 0) {
    const { data, error: upsertError } = await db
      .from("listing_photos")
      .upsert(rows, { onConflict: "listing_id,sort" })
      .select("id, room_label");
    check(upsertError, `listing_photos of ${id}`);
    saved = data ?? [];
  }
  // Drop uploaded photos that are gone from Storage (capture frames from GH-22 stay).
  const stale = db.from("listing_photos").delete().eq("listing_id", id).eq("source", "upload");
  const { error: deleteError } =
    rows.length > 0
      ? await stale.not("sort", "in", `(${rows.map((r) => r.sort).join(",")})`)
      : await stale;
  check(deleteError, `stale listing_photos of ${id}`);
  return saved;
}

async function upsertPolicy(listing: SeedListing): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("host_policies")
    .upsert(policyRow(listing), { onConflict: "listing_id" });
  check(error, `host_policies of ${listing.slug}`);
}

async function upsertReviews(listing: SeedListing): Promise<number> {
  const db = supabaseAdmin();
  const rows = reviewRows(listing);
  const { error } = await db.from("reviews").upsert(rows, { onConflict: "id" });
  check(error, `reviews of ${listing.slug}`);
  const { error: deleteError } = await db
    .from("reviews")
    .delete()
    .eq("listing_id", listingId(listing.slug))
    .not("id", "in", `(${rows.map((r) => r.id).join(",")})`);
  check(deleteError, `stale reviews of ${listing.slug}`);
  return rows.length;
}

/**
 * Makes sure hero-1 has the `washer` fact "Ask this home" cites. The seed's own row (model
 * "seed") is rewritten with the latest photos; a real X-ray row (GH-9) is kept and only gets
 * the washer fact appended when the X-ray did not find one.
 */
async function seedHeroFacts(photos: SeedPhoto[]) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("listing_facts")
    .select("model, facts")
    .eq("listing_id", HERO_LISTINGS.hero1.id)
    .maybeSingle();
  check(error, "read hero-1 facts");
  if (!data || data.model === "seed") {
    const { error: upsertError } = await db
      .from("listing_facts")
      .upsert(heroFactsRow(photos), { onConflict: "listing_id" });
    check(upsertError, "hero-1 facts");
    return;
  }
  const facts = XrayResultSchema.shape.facts.safeParse(data.facts);
  if (!facts.success || facts.data.some((f) => f.key === "washer")) return;
  const { error: updateError } = await db
    .from("listing_facts")
    .update({ facts: withWasherFact(facts.data, photos) })
    .eq("listing_id", HERO_LISTINGS.hero1.id);
  check(updateError, "hero-1 washer fact");
}

function heroOne(): SeedListing {
  const hero = SEED_LISTINGS.find((l) => l.slug === HERO_LISTINGS.hero1.slug);
  if (!hero) throw new Error("hero-1 is missing from seed/data/listings.ts");
  return hero;
}

/** Puts hero-1's negotiation policy back to the fixture numbers (GH-26 reset). */
export async function restoreHeroPolicy(): Promise<void> {
  await upsertPolicy(heroOne());
}

/** Puts hero-1's house manual back, dropping lines saved from Q&A (GH-26 reset). */
export async function restoreHeroManual(): Promise<void> {
  const hero = heroOne();
  const { error } = await supabaseAdmin()
    .from("listings")
    .update({ house_manual: hero.house_manual })
    .eq("id", listingId(hero.slug));
  check(error, "hero-1 house manual");
}

/** Seeds everything and logs `seed.completed` last. Returns one summary row per listing. */
export async function seed(
  today = new Date().toISOString().slice(0, 10),
): Promise<SeedSummaryRow[]> {
  const db = supabaseAdmin();

  const profiles = Object.values(DEMO_PROFILES).map(({ id, role, name }) => ({
    id,
    role,
    name,
    avatar_url: null,
  }));
  check((await db.from("profiles").upsert(profiles, { onConflict: "id" })).error, "profiles");

  const listings = SEED_LISTINGS.map(listingRow);
  check((await db.from("listings").upsert(listings, { onConflict: "slug" })).error, "listings");

  const availability = SEED_LISTINGS.flatMap((l) => availabilityRows(l, today));
  check(
    (await db.from("availability").upsert(availability, { onConflict: "listing_id,date" })).error,
    "availability",
  );

  const summary: SeedSummaryRow[] = [];
  let reviewCount = 0;
  for (const listing of SEED_LISTINGS) {
    const id = listingId(listing.slug);
    await upsertPolicy(listing);
    const reviews = await upsertReviews(listing);
    reviewCount += reviews;
    await uploadLocalPhotos(listing.slug, id);
    const photos = await syncPhotos(id);
    if (id === HERO_LISTINGS.hero1.id) await seedHeroFacts(photos);
    summary.push({
      slug: listing.slug,
      city: listing.city,
      nightly: `$${listing.base_price_cents / 100}`,
      negotiable: listing.policy.negotiable,
      reviews,
      photos: photos.length,
    });
  }

  // Last step: GH-26's reset deletes every event logged after this one.
  await logEvent({
    actor_type: "system",
    actor_name: "Seed",
    action: SEED_COMPLETED_ACTION,
    summary: `Seeded ${SEED_LISTINGS.length} listings and ${reviewCount} reviews`,
  });
  return summary;
}
