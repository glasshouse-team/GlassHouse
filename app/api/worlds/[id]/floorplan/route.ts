import { z } from "zod";
import { getListing } from "@/lib/data/listings";
import { buildFloorPlans } from "@/lib/geometry/store-floorplans";
import { errorResponse, jsonError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { getViewer } from "@/lib/viewer";

/**
 * POST /api/worlds/[id]/floorplan: builds the floor plans of this world's version (every spot
 * of it, GH-18) from the stored collider meshes, and stores the SVGs, floor_plans rows and room
 * anchors. Offline step after a version is imported; no World Labs calls. Only the listing's
 * host can rebuild its plans (it rewrites SVGs and room anchors).
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
    const [viewer, listing] = await Promise.all([getViewer(), getListing(world.listing_id)]);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(
        403,
        "not_your_listing",
        "Only this home's host can rebuild its floor plan.",
      );
    const { listingId, version, rooms, plans } = await buildFloorPlans(
      world.listing_id,
      world.version,
    );
    return Response.json({ listingId, version, rooms, plans });
  } catch (error) {
    return errorResponse(error);
  }
}
