/**
 * Floor plan reads for the listing card and the tour minimap (owner: Temuri, GH-18). Server only
 * (service-role client). The published version is the version of listings.published_world_id.
 */
import { z } from "zod";
import { FloorPlanSchema } from "@/lib/schemas/world";
import { supabaseAdmin } from "@/lib/supabase";
import { pickRoomAnchors } from "./links";

const StoredPlan = FloorPlanSchema.pick({
  world_id: true,
  svg_url: true,
  rooms: true,
  walls: true,
  doors: true,
});
export type StoredPlan = z.infer<typeof StoredPlan>;

export interface PlanSpot {
  worldId: string;
  spot: string;
  name: string;
  /** Room anchor the tour starts at for this room (links.ts), or null. */
  anchorId: string | null;
}

export interface ListingFloorPlans {
  version: number;
  spots: PlanSpot[];
  /** Plan per world id; each is the whole home in that spot world's frame. */
  plans: Map<string, StoredPlan>;
}

/** Prefer the entrance, then the spot with most links: where a visitor starts. */
const START_SPOTS = ["entrance", "hall", "hallway"];

/** Floor plans of the listing's published world version, or null when there are none. */
export async function getListingFloorPlans(listingId: string): Promise<ListingFloorPlans | null> {
  const db = supabaseAdmin();
  const { data: listing } = await db
    .from("listings")
    .select("published_world_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing?.published_world_id) return null;
  const { data: published } = await db
    .from("worlds")
    .select("version")
    .eq("id", listing.published_world_id)
    .maybeSingle();
  if (!published) return null;
  const { data: worlds } = await db
    .from("worlds")
    .select("id, spot, spot_label, links")
    .eq("listing_id", listingId)
    .eq("version", published.version)
    .order("spot");
  if (!worlds?.length) return null;
  const worldIds = worlds.map((w) => w.id);
  const [{ data: rows }, { data: anchorRows }] = await Promise.all([
    db
      .from("floor_plans")
      .select("world_id, svg_url, rooms, walls, doors, status, created_at")
      .in("world_id", worldIds)
      .eq("status", "ready")
      .order("created_at", { ascending: false }),
    db
      .from("anchors")
      .select("id, world_id, kind, source, created_at")
      .in("world_id", worldIds)
      .eq("kind", "room"),
  ]);
  const roomAnchors = pickRoomAnchors(anchorRows ?? []);
  const plans = new Map<string, StoredPlan>();
  for (const row of rows ?? []) {
    if (plans.has(row.world_id)) continue; // newest first
    const parsed = StoredPlan.safeParse(row);
    if (parsed.success) plans.set(row.world_id, parsed.data);
  }
  if (plans.size === 0) return null;
  const linkCount = (links: unknown) => (Array.isArray(links) ? links.length : 0);
  const ordered = [...worlds].sort((a, b) => {
    const ra = START_SPOTS.indexOf(a.spot);
    const rb = START_SPOTS.indexOf(b.spot);
    if (ra !== rb) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    return linkCount(b.links) - linkCount(a.links);
  });
  return {
    version: published.version,
    spots: ordered.map((w) => ({
      worldId: w.id,
      spot: w.spot,
      name: w.spot_label ?? w.spot,
      anchorId: roomAnchors.get(w.id) ?? null,
    })),
    plans,
  };
}

/** The plan of one spot world (for the tour minimap), or null. */
export async function getWorldFloorPlan(worldId: string): Promise<StoredPlan | null> {
  const { data } = await supabaseAdmin()
    .from("floor_plans")
    .select("world_id, svg_url, rooms, walls, doors")
    .eq("world_id", worldId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const parsed = StoredPlan.safeParse(data);
  return parsed.success ? parsed.data : null;
}
