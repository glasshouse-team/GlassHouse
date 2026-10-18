/**
 * What Ask the space (GH-20) knows about one version of a home: its spot worlds, the anchors
 * of all of them (the tour is per spot, D-009, so fly_to may jump to another spot), the gaps
 * and the X-ray facts. Server only (service role).
 */
import { z } from "zod";
import { getListing } from "@/lib/data/listings";
import { FactSchema } from "@/lib/schemas/verifier";
import { AnchorSchema, GapSchema, type Anchor, type Gap } from "@/lib/schemas/world";
import { supabaseAdmin } from "@/lib/supabase";
import type { Space, SpaceFact } from "@/tools/guest/space";

/** Spot worlds a guest can stand in. */
const VIEWABLE = ["ready", "published"];
/** Kept small: the model reads every anchor. */
const MAX_ANCHORS = 60;

export interface SpaceRequest {
  /** Listing uuid or slug. */
  listingId: string;
  /** The spot world the guest stands in (useTour().worldId); also picks the version. */
  worldId?: string | null;
  version?: number | null;
}

export type SpaceLookup =
  | { status: "no_listing" }
  | { status: "no_3d"; listingId: string; listingTitle: string }
  | { status: "ready"; space: Space };

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`Could not load ${what}: ${error.message}`);
}

function parseRows<T>(schema: z.ZodType<T>, rows: unknown[], what: string): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    else console.warn(`[space] skipped a bad ${what} row`);
  }
  return out;
}

/** The version to show: asked for, else the current spot's, else published, else the newest viewable. */
async function resolveVersion(
  listingId: string,
  publishedWorldId: string | null,
  request: SpaceRequest,
): Promise<number | null> {
  if (request.version) return request.version;
  const db = supabaseAdmin();
  for (const worldId of [request.worldId, publishedWorldId]) {
    if (!worldId) continue;
    const { data, error } = await db
      .from("worlds")
      .select("version")
      .eq("id", worldId)
      .eq("listing_id", listingId)
      .maybeSingle();
    check(error, "world");
    if (data) return data.version;
  }
  const { data, error } = await db
    .from("worlds")
    .select("version")
    .eq("listing_id", listingId)
    .in("status", VIEWABLE)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  check(error, "worlds");
  return data?.version ?? null;
}

export async function loadSpace(request: SpaceRequest): Promise<SpaceLookup> {
  const listing = await getListing(request.listingId);
  if (!listing) return { status: "no_listing" };
  const noSpace = { status: "no_3d", listingId: listing.id, listingTitle: listing.title } as const;

  const version = await resolveVersion(listing.id, listing.published_world_id, request);
  if (version === null) return noSpace;

  const db = supabaseAdmin();
  const worlds = await db
    .from("worlds")
    .select("id, spot, spot_label")
    .eq("listing_id", listing.id)
    .eq("version", version)
    .in("status", VIEWABLE)
    .order("spot");
  check(worlds.error, "spot worlds");
  const spots = (worlds.data ?? []).map((w) => ({
    worldId: w.id,
    spot: w.spot,
    label: w.spot_label,
  }));
  if (spots.length === 0) return noSpace;

  const ids = spots.map((s) => s.worldId);
  const [anchors, gaps, facts] = await Promise.all([
    db
      .from("anchors")
      .select("id, world_id, name, kind, room, position, look_at, source")
      .in("world_id", ids)
      .order("created_at")
      .limit(MAX_ANCHORS),
    db
      .from("gaps")
      .select(
        "id, world_id, room, issue, description, severity, position, view_dir, radius_m, screenshot_url, status, filled_by_capture",
      )
      .in("world_id", ids)
      .in("status", ["open", "requested"]),
    db.from("listing_facts").select("facts").eq("listing_id", listing.id).maybeSingle(),
  ]);
  check(anchors.error, "anchors");
  check(gaps.error, "gaps");
  check(facts.error, "listing facts");

  if ((anchors.data ?? []).length >= MAX_ANCHORS)
    console.warn(`[space] ${listing.slug} v${version}: only the first ${MAX_ANCHORS} anchors used`);
  const anchorRows: Anchor[] = parseRows(AnchorSchema, anchors.data ?? [], "anchor");
  if (anchorRows.length === 0) return noSpace;
  const gapRows: Gap[] = parseRows(GapSchema, gaps.data ?? [], "gap");
  const factRows: SpaceFact[] = parseRows(
    FactSchema,
    Array.isArray(facts.data?.facts) ? facts.data.facts : [],
    "fact",
  ).map((f) => ({ key: f.key, value: f.value, confidence: f.confidence }));

  return {
    status: "ready",
    space: {
      listingId: listing.id,
      listingTitle: listing.title,
      version,
      currentWorldId: ids.includes(request.worldId ?? "") ? request.worldId! : null,
      spots,
      anchors: anchorRows,
      gaps: gapRows,
      facts: factRows,
    },
  };
}
