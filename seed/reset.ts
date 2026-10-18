/**
 * `pnpm demo:reset` (GH-26): reads what a demo run left behind, builds the plan with
 * seed/reset-plan.ts and applies it. Server only (service-role key). Never deletes seed rows,
 * 3D, capture or X-ray rows; see DEMO_TABLES for what goes.
 */
import { supabaseAdmin } from "@/lib/supabase";
import { SEED_LISTINGS } from "./data/listings";
import { HERO_LISTINGS, SEED_COMPLETED_ACTION } from "./fixtures";
import {
  buildResetPlan,
  DEMO_TABLES,
  eventWatermark,
  type DemoTable,
  type ResetPlan,
  seedSlugList,
  type WorldPublishPlan,
} from "./reset-plan";
import { restoreHeroManual, restoreHeroPolicy } from "./seed";

/** Hero 2 carries the 3D; v1 is the gap version (D-026). */
export const DEMO_WORLD = { listing: HERO_LISTINGS.hero2, version: 1 } as const;

/** The seed's slugs, as a PostgREST list: listings outside it were added in the app. */
const SEED_SLUGS = seedSlugList(SEED_LISTINGS.map((l) => l.slug));

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`Demo reset failed at ${what}: ${error.message}`);
}

async function countRows(table: DemoTable): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from(table)
    .select("id", { count: "exact", head: true });
  check(error, `count ${table}`);
  return count ?? 0;
}

/** Reads the current state and returns the plan. Makes no writes. */
export async function planReset(): Promise<ResetPlan> {
  const db = supabaseAdmin();
  const counts = Object.fromEntries(
    await Promise.all(DEMO_TABLES.map(async (t) => [t, await countRows(t)] as const)),
  ) as Record<DemoTable, number>;

  const added = await db.from("listings").select("slug").not("slug", "in", SEED_SLUGS);
  check(added.error, "read homes added in the app");

  const seedEvents = await db.from("events").select("id").eq("action", SEED_COMPLETED_ACTION);
  check(seedEvents.error, "read seed.completed events");
  const watermark = eventWatermark((seedEvents.data ?? []).map((e) => e.id));
  let eventsAboveWatermark = 0;
  if (watermark !== null) {
    const { count, error } = await db
      .from("events")
      .select("id", { count: "exact", head: true })
      .gt("id", watermark);
    check(error, "count events");
    eventsAboveWatermark = count ?? 0;
  }

  const worlds = await db
    .from("worlds")
    .select("id, version, spot, status, spz_url, collider_mesh_url, created_at")
    .eq("listing_id", DEMO_WORLD.listing.id);
  check(worlds.error, "read hero-2 worlds");
  const worldIds = (worlds.data ?? []).map((w) => w.id);
  let gaps: { id: string; world_id: string; status: string }[] = [];
  if (worldIds.length > 0) {
    const read = await db.from("gaps").select("id, world_id, status").in("world_id", worldIds);
    check(read.error, "read hero-2 gaps");
    gaps = read.data ?? [];
  }

  return buildResetPlan({
    counts,
    eventWatermark: watermark,
    eventsAboveWatermark,
    worlds: worlds.data ?? [],
    gaps,
    version: DEMO_WORLD.version,
    addedHomes: (added.data ?? []).map((l) => l.slug),
  });
}

async function publishWorlds(plan: WorldPublishPlan): Promise<void> {
  const db = supabaseAdmin();
  if (plan.unpublishIds.length > 0) {
    const { error } = await db
      .from("worlds")
      .update({ status: "ready" })
      .in("id", plan.unpublishIds);
    check(error, "unpublish other versions");
  }
  const { error: publishError } = await db
    .from("worlds")
    .update({ status: "published", published_at: new Date().toISOString() })
    .in("id", plan.publishIds);
  check(publishError, `publish v${plan.version}`);
  const { error: listingError } = await db
    .from("listings")
    .update({ published_world_id: plan.entryWorldId })
    .eq("id", DEMO_WORLD.listing.id);
  check(listingError, "set published_world_id");
  if (plan.reopenGapIds.length > 0) {
    const { error } = await db.from("gaps").update({ status: "open" }).in("id", plan.reopenGapIds);
    check(error, "reopen gaps");
  }
}

/** Applies a plan from planReset(). Deletes demo rows, then restores hero-1 and hero-2. */
export async function applyReset(plan: ResetPlan): Promise<void> {
  const db = supabaseAdmin();
  // Reservations first (checkins cascade), then deals (messages, secrets, deal events).
  // Always delete, even at a planned 0, so rows made since planning go too.
  for (const table of DEMO_TABLES) {
    const { error } = await db.from(table).delete().not("id", "is", null);
    check(error, `delete ${table}`);
  }
  // Homes added in the app (D-043); their policies, photos, worlds and captures cascade.
  // By slug, not the planned list, so homes added since planning go too.
  const { error: homesError } = await db.from("listings").delete().not("slug", "in", SEED_SLUGS);
  check(homesError, "delete homes added in the app");
  if (plan.eventWatermark !== null) {
    const { error } = await db.from("events").delete().gt("id", plan.eventWatermark);
    check(error, "delete events");
  }
  await restoreHeroPolicy();
  await restoreHeroManual();
  if (plan.world.kind === "publish") await publishWorlds(plan.world.plan);
}

export interface SeedCounts {
  listings: number;
  reviews: number;
  listing_photos: number;
  host_policies: number;
  listing_facts: number;
}

/** Seed rows still in place, printed after a reset so a person can see nothing seeded went. */
export async function seedCounts(): Promise<SeedCounts> {
  const db = supabaseAdmin();
  const tables = [
    "listings",
    "reviews",
    "listing_photos",
    "host_policies",
    "listing_facts",
  ] as const;
  const entries = await Promise.all(
    tables.map(async (t) => {
      const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
      check(error, `count ${t}`);
      return [t, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as SeedCounts;
}
