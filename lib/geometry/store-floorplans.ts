/**
 * Builds and stores the floor plans of one world version (owner: Temuri, GH-18). Server and
 * scripts only. Reads each spot's collider from OUR storage (never World Labs), extracts straight
 * walls, places the rooms by the spot graph, then per spot world: uploads
 * media/worlds/{id}/floorplan.svg, replaces its floor_plans row (v1, marble-metric) and its auto
 * room anchor. Runs offline (`pnpm floorplans`, POST /api/worlds/[id]/floorplan), never on a view.
 */
import { logEvent } from "@/lib/events";
import { FloorPlanSchema, SpotLinkSchema, Vec3Schema } from "@/lib/schemas/world";
import { BUCKETS, publicMediaUrl, supabaseAdmin } from "@/lib/supabase";
import { z } from "zod";
import { colliderToThree } from "./collider";
import { buildHomePlans, type HomePlan, type SpotWalls } from "./home-plan";
import { renderPlanSvg } from "./svg";
import { colliderWalls } from "./walls";

/** Eye height of a room anchor (GH-18 build notes). */
export const ROOM_ANCHOR_HEIGHT = 1.6;

export interface FloorPlanBuild {
  listingId: string;
  version: number;
  rooms: number;
  plans: { worldId: string; spot: string; walls: number; svgUrl: string | null }[];
}

interface WorldRow {
  id: string;
  spot: string;
  spot_label: string | null;
  links: unknown;
  collider_mesh_url: string | null;
  metric_scale_factor: number | null;
}

/** True when a URL points at our Supabase storage (assets are served from there, D-009). */
export function isOurStorage(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base) && url.startsWith(`${base!.replace(/\/$/, "")}/storage/`);
}

async function loadCollider(url: string): Promise<Uint8Array> {
  if (!isOurStorage(url)) {
    throw new Error(`Collider is not in our storage (${url}); import the world first (GH-10).`);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the collider ${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Spot walls of every world in the version that has a collider. */
async function spotWalls(worlds: WorldRow[]): Promise<{ spots: SpotWalls[]; skipped: string[] }> {
  const spots: SpotWalls[] = [];
  const skipped: string[] = [];
  const cache = new Map<string, Promise<Uint8Array>>();
  for (const w of worlds) {
    if (!w.collider_mesh_url || !w.metric_scale_factor) {
      skipped.push(w.spot);
      continue;
    }
    if (!cache.has(w.collider_mesh_url)) {
      cache.set(w.collider_mesh_url, loadCollider(w.collider_mesh_url));
    }
    const bytes = await cache.get(w.collider_mesh_url)!;
    // colliderToThree transforms in place: give it a copy so shared assets stay raw.
    const mesh = colliderToThree(bytes.slice(), w.metric_scale_factor);
    const { walls, angle } = colliderWalls(mesh.positions, mesh.index);
    spots.push({
      spot: w.spot,
      name: w.spot_label ?? w.spot,
      links: z.array(SpotLinkSchema).catch([]).parse(w.links),
      walls,
      angle,
    });
  }
  return { spots, skipped };
}

/** The floor_plans row for one spot's plan (validated against the contract schema). */
export function floorPlanRow(worldId: string, plan: HomePlan, svgUrl: string | null) {
  return FloorPlanSchema.omit({ id: true }).parse({
    world_id: worldId,
    svg_url: svgUrl,
    rooms: plan.rooms.map(({ name, label, polygon, area_m2 }) => ({
      name,
      label,
      polygon,
      area_m2,
    })),
    walls: plan.walls,
    doors: plan.doors,
    total_area_m2: null,
    scale_source: "marble-metric",
    version: "v1",
    status: "ready",
  });
}

/**
 * Builds the plans of a listing's world version and stores them. `dryRun` computes and returns
 * the SVGs without writing anything.
 */
export async function buildFloorPlans(
  listingId: string,
  version: number,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<FloorPlanBuild & { svgs: Map<string, string> }> {
  const db = supabaseAdmin();
  const { data: worlds, error } = await db
    .from("worlds")
    .select("id, spot, spot_label, links, collider_mesh_url, metric_scale_factor, status")
    .eq("listing_id", listingId)
    .eq("version", version)
    .in("status", ["ready", "published"])
    .order("spot");
  if (error) throw new Error(`Could not load worlds: ${error.message}`);
  if (!worlds?.length) throw new Error(`No ready worlds for listing ${listingId} v${version}`);

  const { spots, skipped } = await spotWalls(worlds);
  if (spots.length === 0) throw new Error(`No world of v${version} has a stored collider`);
  const plans = buildHomePlans(spots);
  const bySpot = new Map(worlds.map((w) => [w.spot, w]));

  const svgs = new Map<string, string>();
  const result: FloorPlanBuild = { listingId, version, rooms: spots.length, plans: [] };
  const stamp = Date.now();
  for (const plan of plans) {
    const world = bySpot.get(plan.spot)!;
    const name = world.spot_label ?? world.spot;
    const { data: gapRows } = await db
      .from("gaps")
      .select("position, radius_m")
      .eq("world_id", world.id)
      .in("status", ["open", "requested"]);
    const gaps = (gapRows ?? []).flatMap((g) => {
      const p = Vec3Schema.safeParse(g.position);
      return p.success ? [{ at: [p.data.x, p.data.z] as [number, number], radius_m: g.radius_m }] : [];
    });
    const svg = renderPlanSvg(plan, { highlight: name, gaps });
    svgs.set(plan.spot, svg);
    let svgUrl: string | null = null;

    if (!dryRun) {
      const path = `worlds/${world.id}/floorplan.svg`;
      const upload = await db.storage.from(BUCKETS.media).upload(path, svg, {
        contentType: "image/svg+xml",
        upsert: true,
      });
      if (upload.error) throw new Error(`Could not upload ${path}: ${upload.error.message}`);
      // Storage's CDN caches for an hour: a new query string per build.
      svgUrl = `${publicMediaUrl(path)}?v=${stamp}`;

      const row = floorPlanRow(world.id, plan, svgUrl);
      const del = await db.from("floor_plans").delete().eq("world_id", world.id);
      if (del.error) throw new Error(`Could not clear old floor plans: ${del.error.message}`);
      const ins = await db.from("floor_plans").insert(row);
      if (ins.error) throw new Error(`Could not save the floor plan: ${ins.error.message}`);

      // One auto room anchor per spot world, at the spot (where the splat is sharpest).
      const delAnchors = await db
        .from("anchors")
        .delete()
        .eq("world_id", world.id)
        .eq("kind", "room")
        .eq("source", "auto");
      if (delAnchors.error) throw new Error(`Could not clear anchors: ${delAnchors.error.message}`);
      const anchor = await db.from("anchors").insert({
        world_id: world.id,
        name,
        kind: "room",
        room: name,
        position: { x: 0, y: ROOM_ANCHOR_HEIGHT, z: 0 },
        look_at: null,
        source: "auto",
      });
      if (anchor.error) throw new Error(`Could not save the room anchor: ${anchor.error.message}`);
    }
    result.plans.push({
      worldId: world.id,
      spot: plan.spot,
      walls: plan.walls.length,
      svgUrl,
    });
  }

  if (!dryRun) {
    await logEvent({
      actor_type: "system",
      actor_name: "Floor plan builder",
      action: "floorplan.built",
      summary: `Built the floor plan of v${version} from the 3D: ${spots.length} rooms${skipped.length ? `, ${skipped.length} without a collider` : ""}`,
      listing_id: listingId,
      payload: { version, rooms: spots.map((s) => s.name), skipped },
    });
  }
  return { ...result, svgs };
}
