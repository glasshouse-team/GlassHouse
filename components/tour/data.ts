/**
 * Server-side reads for the tour page and its launcher card (GH-11). Server only: uses the
 * service-role client, but returns only public-read tables (worlds, anchors, gaps, floor_plans).
 * Asset URLs are our storage copies; the viewer never touches World Labs.
 */
import {
  AnchorSchema,
  GapSchema,
  WorldSchema,
  type Anchor,
  type Gap,
  type World,
} from "@/lib/schemas/world";
import { getWorldFloorPlan } from "@/components/floorplan/data";
import { hasSupabaseEnv, supabaseAdmin } from "@/lib/supabase";
import { pickTourVersion, type TourVersion } from "./spots";
import type { TourPlans } from "./minimap";

export interface TourData {
  listing: { id: string; title: string };
  tour: TourVersion | null;
  anchors: Anchor[];
  gaps: Gap[];
}

function parseRows<T>(
  rows: unknown[] | null,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
): T[] {
  return (rows ?? []).flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

async function loadVersion(listingId: string, version: number | null) {
  const db = supabaseAdmin();
  const [{ data: listing }, { data: rows }] = await Promise.all([
    db.from("listings").select("id, title, published_world_id").eq("id", listingId).maybeSingle(),
    db.from("worlds").select("*").eq("listing_id", listingId),
  ]);
  if (!listing) return null;
  const worlds = parseRows<World>(rows, WorldSchema);
  const tour = pickTourVersion(worlds, {
    version,
    publishedWorldId: listing.published_world_id,
    storageOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  });
  return { listing: { id: listing.id, title: listing.title }, tour };
}

/** The tour of a listing: `version` for host preview, else the published one. */
export async function loadTour(
  listingId: string,
  version: number | null,
): Promise<TourData | null> {
  if (!hasSupabaseEnv()) return null;
  const base = await loadVersion(listingId, version);
  if (!base) return null;
  if (!base.tour) return { ...base, anchors: [], gaps: [] };
  const ids = base.tour.worlds.map((w) => w.id);
  const db = supabaseAdmin();
  const [{ data: anchors }, { data: gaps }] = await Promise.all([
    db.from("anchors").select("*").in("world_id", ids).order("created_at"),
    db.from("gaps").select("*").in("world_id", ids),
  ]);
  return {
    ...base,
    anchors: parseRows<Anchor>(anchors, AnchorSchema),
    gaps: parseRows<Gap>(gaps, GapSchema),
  };
}

/**
 * The minimap's floor plans (GH-18 floor_plans rows, newest ready one per spot world), keyed
 * by world id. Spots without a plan are left out; a failed read means no minimap, not an error.
 */
export async function loadTourPlans(worlds: Pick<World, "id">[]): Promise<TourPlans> {
  if (!hasSupabaseEnv()) return {};
  const rows = await Promise.all(
    worlds.map((w) =>
      getWorldFloorPlan(w.id).catch((error: unknown) => {
        console.error("[tour] floor plan", w.id, error);
        return null;
      }),
    ),
  );
  return Object.fromEntries(rows.flatMap((plan) => (plan ? [[plan.world_id, plan]] : [])));
}

export interface LauncherData {
  thumbnailUrl: string | null;
  rooms: string[];
}

/** What the listing page's tour card shows: the entry room's picture and the rooms. */
export async function loadLauncher(listingId: string): Promise<LauncherData | null> {
  if (!hasSupabaseEnv()) return null;
  const base = await loadVersion(listingId, null).catch(() => null);
  if (!base?.tour) return null;
  const entry =
    base.tour.worlds.find((w) => w.spot === base.tour!.entrySpot) ?? base.tour.worlds[0];
  return {
    thumbnailUrl: entry.thumbnail_url ?? entry.pano_url,
    rooms: base.tour.worlds.map((w) => w.spot_label ?? w.spot),
  };
}
