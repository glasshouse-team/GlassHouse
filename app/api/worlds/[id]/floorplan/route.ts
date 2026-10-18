import { z } from "zod";
import { getListing } from "@/lib/data/listings";
import { buildFloorPlans } from "@/lib/geometry/store-floorplans";
import { errorResponse, jsonError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { getViewer } from "@/lib/viewer";
import { checkAdminSecret, createBuildLimiter, guardResponse } from "./guard";

/** One build per version at a time, one start per version a minute (per server instance). */
const limiter = createBuildLimiter();

/**
 * POST /api/worlds/[id]/floorplan: builds the floor plans of this world's version (every spot
 * of it, GH-18) from the stored collider meshes, and stores the SVGs, floor_plans rows and room
 * anchors. Offline step after a version is imported; no World Labs calls. `pnpm floorplans` is
 * the normal path. In production this route needs the `x-admin-secret` header (guard.ts); it is
 * also host-only and rate-limited, since it rewrites SVGs and room anchors and is CPU heavy.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/worlds/[id]/floorplan">) {
  try {
    const admin = checkAdminSecret(request.headers);
    if (!admin.ok) return guardResponse(admin);
    const id = z.uuid().parse((await ctx.params).id);
    const { data: world, error } = await supabaseAdmin()
      .from("worlds")
      .select("listing_id, version")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!world) return jsonError(404, "not_found", "No world with this id.");
    const [viewer, listing] = await Promise.all([getViewer(), getListing(world.listing_id)]);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(
        403,
        "not_your_listing",
        "Only this home's host can rebuild its floor plan.",
      );
    const key = `${world.listing_id}:${world.version}`;
    const slot = limiter.acquire(key);
    if (!slot.ok) return guardResponse(slot);
    try {
      const { listingId, version, rooms, plans } = await buildFloorPlans(
        world.listing_id,
        world.version,
      );
      return Response.json({ listingId, version, rooms, plans });
    } finally {
      limiter.release(key);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
