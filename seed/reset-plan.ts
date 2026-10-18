/**
 * The pure part of `pnpm demo:reset` (GH-26): what to delete and which world version to
 * publish, worked out from rows the script read. No database access here, so it is tested
 * in seed/reset-plan.test.ts; seed/reset.ts reads the rows and applies the plan.
 */

/**
 * Tables the seed never writes, so every row in them was made by a demo run or a test
 * (D-032). Deleting them cascades to deal_messages, deal_secrets and deal events (deals),
 * checkins (reservations) and messages (conversations). Seed tables (listings, photos,
 * reviews, policies, availability) and 3D, capture and X-ray rows are never deleted, except
 * for homes a host added in the app (D-043): those listings go, with everything under them.
 */
export const DEMO_TABLES = ["reservations", "deals", "conversations", "trip_briefs"] as const;
export type DemoTable = (typeof DEMO_TABLES)[number];

/** Spot keys that count as the way in; the tour starts at the entry spot (D-009). */
const ENTRY_SPOTS = ["entrance", "entry", "hall", "hallway", "corridor"];

/** World statuses whose assets are in our storage and can be shown. */
const SHOWABLE = new Set(["ready", "published"]);

export interface ResetWorld {
  id: string;
  version: number;
  spot: string;
  status: string;
  spz_url: string | null;
  collider_mesh_url: string | null;
  created_at: string;
}

export interface ResetGap {
  id: string;
  world_id: string;
  status: string;
}

export interface WorldPublishPlan {
  version: number;
  /** `listings.published_world_id`: the entry spot of the version. */
  entryWorldId: string;
  entrySpot: string;
  /** Spot worlds of the version that become `published`. */
  publishIds: string[];
  /** Spot worlds of other versions that were `published` and go back to `ready`. */
  unpublishIds: string[];
  /** The version's `requested` or `filled` gaps, back to `open` for the gap demo. */
  reopenGapIds: string[];
}

export type WorldStep =
  { kind: "publish"; plan: WorldPublishPlan } | { kind: "skip"; reason: string };

export interface ResetPlan {
  /** Rows to delete per demo table. */
  deletions: Record<DemoTable, number>;
  /** Homes hosts added in the app (slugs not in the seed), deleted with their rows (D-043). */
  addedHomes: string[];
  /** Events with an id above this are deleted; null when the seed never logged its event. */
  eventWatermark: number | null;
  eventsToDelete: number;
  world: WorldStep;
}

/** The latest `seed.completed` event id, or null when there is none. */
export function eventWatermark(seedEventIds: number[]): number | null {
  return seedEventIds.length > 0 ? Math.max(...seedEventIds) : null;
}

/** The spot the tour starts at: an entrance-like spot, otherwise the first one generated. */
export function pickEntrySpot<W extends Pick<ResetWorld, "spot" | "created_at">>(worlds: W[]): W {
  if (worlds.length === 0) throw new Error("pickEntrySpot needs at least one world");
  for (const name of ENTRY_SPOTS) {
    const hit = worlds.find((w) => w.spot.toLowerCase() === name);
    if (hit) return hit;
  }
  return [...worlds].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.spot.localeCompare(b.spot),
  )[0]!;
}

/** How to publish `version` of a listing's worlds, or why it cannot be done yet. */
export function planWorldPublish(
  worlds: ResetWorld[],
  gaps: ResetGap[],
  version: number,
): WorldStep {
  if (worlds.length === 0) return { kind: "skip", reason: "no worlds exist yet" };
  const spots = worlds.filter(
    (w) =>
      w.version === version &&
      SHOWABLE.has(w.status) &&
      Boolean(w.spz_url) &&
      Boolean(w.collider_mesh_url),
  );
  if (spots.length === 0) {
    return {
      kind: "skip",
      reason: `v${version} has no ready spot world with a splat and collider yet`,
    };
  }
  const entry = pickEntrySpot(spots);
  const ids = new Set(spots.map((w) => w.id));
  return {
    kind: "publish",
    plan: {
      version,
      entryWorldId: entry.id,
      entrySpot: entry.spot,
      publishIds: spots.map((w) => w.id),
      unpublishIds: worlds
        .filter((w) => w.version !== version && w.status === "published")
        .map((w) => w.id),
      reopenGapIds: gaps
        .filter((g) => ids.has(g.world_id) && (g.status === "requested" || g.status === "filled"))
        .map((g) => g.id),
    },
  };
}

/** Assembles the whole plan from what the script counted and read. */
export function buildResetPlan(input: {
  counts: Record<DemoTable, number>;
  /** From eventWatermark(). */
  eventWatermark: number | null;
  /** Events with an id above the watermark. */
  eventsAboveWatermark: number;
  worlds: ResetWorld[];
  gaps: ResetGap[];
  version: number;
  /** Slugs of listings that are not in the seed. */
  addedHomes?: string[];
}): ResetPlan {
  return {
    deletions: { ...input.counts },
    addedHomes: [...(input.addedHomes ?? [])].sort(),
    eventWatermark: input.eventWatermark,
    eventsToDelete: input.eventWatermark === null ? 0 : input.eventsAboveWatermark,
    world: planWorldPublish(input.worlds, input.gaps, input.version),
  };
}

/** Lines that describe the plan, printed by `--dry-run` and before a real run. */
export function describePlan(plan: ResetPlan, listingSlug: string): string[] {
  const lines = DEMO_TABLES.map(
    (t) => `delete ${plan.deletions[t]} ${t} (all; the seed makes none)`,
  );
  lines.push(
    plan.addedHomes.length === 0
      ? "keep listings: no homes were added in the app"
      : `delete ${plan.addedHomes.length} homes added in the app, with their rows: ${plan.addedHomes.join(", ")}`,
  );
  lines.push(
    plan.eventWatermark === null
      ? "keep events: no seed.completed event found (run pnpm seed first)"
      : `delete ${plan.eventsToDelete} events with id > ${plan.eventWatermark} (the latest seed.completed)`,
  );
  lines.push("restore hero-1 host policy (HERO_1_POLICY) and house manual (drops Q&A answers)");
  if (plan.world.kind === "skip") {
    lines.push(`skip publishing ${listingSlug}: ${plan.world.reason}`);
  } else {
    const p = plan.world.plan;
    lines.push(
      `publish ${listingSlug} v${p.version}: ${p.publishIds.length} spot worlds, entry spot "${p.entrySpot}"`,
      `move ${p.unpublishIds.length} published worlds of other versions to ready`,
      `reopen ${p.reopenGapIds.length} requested or filled gaps of v${p.version}`,
    );
  }
  return lines;
}
