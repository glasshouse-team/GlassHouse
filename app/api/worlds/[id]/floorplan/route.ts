import { z } from "zod";
import { buildFloorPlans } from "@/lib/geometry/store-floorplans";
import { errorResponse, jsonError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/worlds/[id]/floorplan: builds the floor plans of this world's version (every spot
 * of it, GH-18) from the stored collider meshes, and stores the SVGs, floor_plans rows and room
 * anchors. Offline step after a version is imported; no World Labs calls.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/worlds/[id]/floorplan">) {
  try {
    const id = z.uuid().parse((await ctx.params).id);
    const { data: world, error } = await supabaseAdmin()
      .from("worlds")
      .select("listing_id, version")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!world) return jsonError(404, "not_found", "No world with this id.");
    const { listingId, version, rooms, plans } = await buildFloorPlans(
      world.listing_id,
      world.version,
    );
    return Response.json({ listingId, version, rooms, plans });
  } catch (error) {
    return errorResponse(error);
  }
}
