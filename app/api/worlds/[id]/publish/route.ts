import { z } from "zod";
import { errorResponse, jsonError } from "@/lib/http";
import { publishWorldRow } from "@/lib/marble-worlds";
import { supabaseAdmin } from "@/lib/supabase";
import { requireHost, worldErrorResponse } from "../../_lib/host";

/**
 * POST /api/worlds/[id]/publish (owner: Temuri, GH-10): publishes the version this spot row
 * belongs to. Its rows become `published`, the previous version's rows `archived`,
 * `listings.published_world_id` points at the entry spot, and the feed gets one line.
 * Works in DEMO_MODE too: it only touches our database.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/worlds/[id]/publish">) {
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
    return Response.json(await publishWorldRow(id, host.actor));
  } catch (error) {
    return worldErrorResponse(error) ?? errorResponse(error);
  }
}
