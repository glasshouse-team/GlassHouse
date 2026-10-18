import { z } from "zod";
import { isDemoMode } from "@/lib/env";
import { errorResponse, jsonError } from "@/lib/http";
import { finalizeWorld } from "@/lib/marble-worlds";
import { supabaseAdmin } from "@/lib/supabase";
import { requireHost, worldErrorResponse } from "../../_lib/host";

/** Copying a finished world's assets (splats up to 50 MB) can take a while. */
export const maxDuration = 300;

/**
 * GET /api/worlds/[id]/status (owner: Temuri, GH-10): the host page polls this every 15 s
 * while a spot row is `generating`. It checks the operation and, when done, copies every
 * asset into media/worlds/{id}/, sets `ready` and logs it. In DEMO_MODE, or for a row that
 * is not generating, it only reads our database.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/worlds/[id]/status">) {
  try {
    const id = z.uuid().parse((await ctx.params).id);
    const { data: row } = await supabaseAdmin()
      .from("worlds")
      .select("listing_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) return jsonError(404, "not_found", "This 3D version does not exist.");
    const host = await requireHost(row.listing_id);
    if (host instanceof Response) return host;

    const result = await finalizeWorld(id, { demo: isDemoMode() });
    if (!result) return jsonError(404, "not_found", "This 3D version does not exist.");
    const { row: world, changed, progress, pollError } = result;
    return Response.json({
      id: world.id,
      version: world.version,
      spot: world.spot,
      status: world.status,
      error: world.error,
      thumbnail_url: world.thumbnail_url,
      spz_url: world.spz_url,
      changed,
      progress,
      pollError,
    });
  } catch (error) {
    return worldErrorResponse(error) ?? errorResponse(error);
  }
}
