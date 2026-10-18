/**
 * Builds and stores the floor plans of one world version (owner: Temuri, GH-18). Server and
 * scripts only. Reads each spot's collider from OUR storage (never World Labs), extracts straight
 * walls, outlines each room (v2: outline + m2 area), places the rooms by the spot graph, then per
 * spot world: uploads media/worlds/{id}/floorplan.svg, replaces its floor_plans row (v2) and its
 * auto room anchor. Runs offline (`pnpm floorplans`, POST /api/worlds/[id]/floorplan), never on a
 * view. A host calibration (one real measurement, calibrate.ts) is kept across rebuilds: it is
 * re-applied to the new outlines.
 */
import { logEvent } from "@/lib/events";
import { FloorPlanSchema, SpotLinkSchema, Vec3Schema, type FloorPlan } from "@/lib/schemas/world";
import { BUCKETS, publicMediaUrl, supabaseAdmin, type Db } from "@/lib/supabase";
import { z } from "zod";
import {
  calibrateRooms,
  calibrationLine,
  computeCalibration,
  measurementOf,
  planCalibration,
  totalArea,
  type Calibration,
} from "./calibrate";
import { colliderToThree } from "./collider";
import { buildHomePlans, type HomePlan, type SpotWalls } from "./home-plan";
import { renderPlanSvg, type PlanShape } from "./svg";
import { colliderWalls } from "./walls";

/** Eye height of a room anchor (GH-18 build notes). */
export const ROOM_ANCHOR_HEIGHT = 1.6;

export interface FloorPlanBuild {
  listingId: string;
  version: number;
  rooms: number;
  plans: { worldId: string; spot: string; walls: number; svgUrl: string | null }[];
  /** Each room's area (m2, calibrated when the version is) and the total. */
  areas: { room: string; area_m2: number | null }[];
  totalArea: number | null;
  /** The host calibration re-applied to this build, if any. */
  calibration: Calibration | null;
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

type PlanRooms = FloorPlan["rooms"];

/**
 * The floor_plans row for one spot's plan (validated against the contract schema): v2 room
 * outlines and areas, calibrated by `calibration` when there is one.
 */
export function floorPlanRow(
  worldId: string,
  plan: HomePlan,
  svgUrl: string | null,
  calibration: Calibration | null = null,
) {
  const rooms = calibrateRooms(
    plan.rooms.map(({ name, label, polygon, area_m2 }) => ({ name, label, polygon, area_m2 })),
    calibration,
  );
  return FloorPlanSchema.omit({ id: true }).parse({
    world_id: worldId,
    svg_url: svgUrl,
    rooms,
    walls: plan.walls,
    doors: plan.doors,
    total_area_m2: totalArea(rooms),
    scale_source: calibration ? "host-calibrated" : "marble-metric",
    version: "v2",
    status: "ready",
  });
}

/** Open gaps of a world as hatch circles on its plan. */
async function planGaps(db: Db, worldId: string) {
  const { data: gapRows } = await db
    .from("gaps")
    .select("position, radius_m")
    .eq("world_id", worldId)
    .in("status", ["open", "requested"]);
  return (gapRows ?? []).flatMap((g) => {
    const p = Vec3Schema.safeParse(g.position);
    return p.success
      ? [{ at: [p.data.x, p.data.z] as [number, number], radius_m: g.radius_m }]
      : [];
  });
}

/**
 * Renders one spot's plan SVG (its room highlighted, gaps hatched, areas, scale bar and the
 * calibration note) and, unless `dryRun`, uploads it. The URL gets a fresh `?v=` (CDN cache).
 */
async function storePlanSvg(
  db: Db,
  worldId: string,
  shape: PlanShape,
  options: { highlight: string; calibration: Calibration | null; stamp: number; dryRun: boolean },
): Promise<{ svg: string; svgUrl: string | null }> {
  const { calibration } = options;
  const svg = renderPlanSvg(shape, {
    highlight: options.highlight,
    gaps: await planGaps(db, worldId),
    scale: calibration?.scale ?? 1,
    note: calibration ? calibrationLine(calibration) : "Plan is approximate",
    totalArea: totalArea(shape.rooms.map((r) => ({ area_m2: r.area_m2 ?? null }))),
  });
  if (options.dryRun) return { svg, svgUrl: null };
  const path = `worlds/${worldId}/floorplan.svg`;
  const upload = await db.storage.from(BUCKETS.media).upload(path, svg, {
    contentType: "image/svg+xml",
    upsert: true,
  });
  if (upload.error) throw new Error(`Could not upload ${path}: ${upload.error.message}`);
  return { svg, svgUrl: `${publicMediaUrl(path)}?v=${options.stamp}` };
}

/** The calibration stored on any current plan of these worlds (they all carry the same one). */
async function storedCalibration(db: Db, worldIds: string[]): Promise<Calibration | null> {
  if (worldIds.length === 0) return null;
  const { data } = await db
    .from("floor_plans")
    .select("rooms")
    .in("world_id", worldIds)
    .eq("status", "ready");
  for (const row of data ?? []) {
    const rooms = FloorPlanSchema.shape.rooms.safeParse(row.rooms);
    const found = rooms.success ? planCalibration(rooms.data) : null;
    if (found) return found;
  }
  return null;
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

  // Keep the host's calibration: the same measurement against the new outlines.
  let calibration: Calibration | null = null;
  const previous = await storedCalibration(
    db,
    worlds.map((w) => w.id),
  );
  if (previous) {
    const again = computeCalibration(plans[0].rooms, measurementOf(previous));
    if (again.ok) calibration = again.calibration;
    else console.warn(`[floorplans] dropped the calibration (${again.message})`);
  }

  const svgs = new Map<string, string>();
  const firstRow = floorPlanRow(worlds[0].id, plans[0], null, calibration);
  const result: FloorPlanBuild = {
    listingId,
    version,
    rooms: spots.length,
    plans: [],
    areas: firstRow.rooms.map((r) => ({ room: r.name, area_m2: r.area_m2 })),
    totalArea: firstRow.total_area_m2,
    calibration,
  };
  const stamp = Date.now();
  for (const plan of plans) {
    const world = bySpot.get(plan.spot)!;
    const name = world.spot_label ?? world.spot;
    const row = floorPlanRow(world.id, plan, null, calibration);
    const { svg, svgUrl } = await storePlanSvg(
      db,
      world.id,
      { walls: row.walls, rooms: row.rooms },
      { highlight: name, calibration, stamp, dryRun },
    );
    svgs.set(plan.spot, svg);

    if (!dryRun) {
      const del = await db.from("floor_plans").delete().eq("world_id", world.id);
      if (del.error) throw new Error(`Could not clear old floor plans: ${del.error.message}`);
      const ins = await db.from("floor_plans").insert({ ...row, svg_url: svgUrl });
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
      summary: `Built the floor plan of v${version} from the 3D: ${spots.length} rooms${result.totalArea !== null ? `, ${result.totalArea} m² in total` : ""}${skipped.length ? `, ${skipped.length} without a collider` : ""}`,
      listing_id: listingId,
      payload: {
        version,
        rooms: spots.map((s) => s.name),
        areas: result.areas,
        total_area_m2: result.totalArea,
        calibrated: calibration !== null,
        skipped,
      },
    });
  }
  return { ...result, svgs };
}

/** The stored plans of one world version: one row per spot world that has a ready plan. */
export interface VersionPlans {
  listingId: string;
  version: number;
  plans: {
    worldId: string;
    name: string;
    walls: FloorPlan["walls"];
    rooms: PlanRooms;
  }[];
}

/** Loads the current ready plan of every spot world of a version (newest row per world). */
export async function loadVersionPlans(listingId: string, version: number): Promise<VersionPlans> {
  const db = supabaseAdmin();
  const { data: worlds, error } = await db
    .from("worlds")
    .select("id, spot, spot_label")
    .eq("listing_id", listingId)
    .eq("version", version)
    .order("spot");
  if (error) throw new Error(`Could not load worlds: ${error.message}`);
  const ids = (worlds ?? []).map((w) => w.id);
  const { data: rows, error: rowsError } = ids.length
    ? await db
        .from("floor_plans")
        .select("world_id, rooms, walls, status, created_at")
        .in("world_id", ids)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (rowsError) throw new Error(`Could not load floor plans: ${rowsError.message}`);
  const Row = FloorPlanSchema.pick({ world_id: true, rooms: true, walls: true });
  const plans: VersionPlans["plans"] = [];
  const seen = new Set<string>();
  for (const raw of rows ?? []) {
    if (seen.has(raw.world_id)) continue; // newest first
    seen.add(raw.world_id);
    const row = Row.safeParse(raw);
    const world = worlds!.find((w) => w.id === raw.world_id)!;
    if (row.success) {
      plans.push({
        worldId: row.data.world_id,
        name: world.spot_label ?? world.spot,
        walls: row.data.walls,
        rooms: row.data.rooms,
      });
    }
  }
  return { listingId, version, plans };
}

export interface CalibrationSaved {
  calibration: Calibration;
  areas: { room: string; area_m2: number | null }[];
  totalArea: number | null;
  plans: number;
}

/**
 * Applies a calibration to every plan of the version: calibrated areas and total, the
 * calibration on the measured room, `scale_source = "host-calibrated"`, and a re-rendered SVG.
 * Geometry stays in the 3D's meters.
 */
export async function saveCalibration(
  version: VersionPlans,
  calibration: Calibration,
): Promise<CalibrationSaved> {
  const db = supabaseAdmin();
  const stamp = Date.now();
  let areas: CalibrationSaved["areas"] = [];
  let total: number | null = null;
  for (const plan of version.plans) {
    const rooms = calibrateRooms(plan.rooms, calibration);
    total = totalArea(rooms);
    areas = rooms.map((r) => ({ room: r.name, area_m2: r.area_m2 }));
    const { svgUrl } = await storePlanSvg(
      db,
      plan.worldId,
      { walls: plan.walls, rooms },
      { highlight: plan.name, calibration, stamp, dryRun: false },
    );
    const update = await db
      .from("floor_plans")
      .update({
        rooms,
        total_area_m2: total,
        scale_source: "host-calibrated",
        svg_url: svgUrl,
      })
      .eq("world_id", plan.worldId)
      .eq("status", "ready");
    if (update.error) throw new Error(`Could not save the calibration: ${update.error.message}`);
  }
  return { calibration, areas, totalArea: total, plans: version.plans.length };
}
