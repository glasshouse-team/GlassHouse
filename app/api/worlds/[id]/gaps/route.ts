import { z } from "zod";
import { getListing } from "@/lib/data/listings";
import { errorResponse, jsonError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { getViewer } from "@/lib/viewer";
import { VOTE_RUNS } from "@/tools/verifier/gap-vote";
import { checkSpotWorld, checkSummary } from "@/tools/verifier/gaps";

/** 18 view calls plus the second looks; the platform limit (GH-19 build notes). */
export const maxDuration = 300;

const Body = z.object({ runs: z.number().int().min(1).max(VOTE_RUNS).optional() }).strict();

/**
 * POST /api/worlds/[id]/gaps (GH-19, D-047): runs the automatic gap check on one spot world and
 * returns its findings. A dry run: nothing is written (storing goes through `pnpm gaps --check
 * --write`, which is gated on the measured evaluation). Only the listing's host may run it (each
 * call costs about 20 vision calls). Compares with the listing photos of the room (the ring
 * photos live on the host's phone). No World Labs calls. Body (optional): `{ runs: 1..3 }`.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/worlds/[id]/gaps">) {
  try {
    const id = z.uuid().safeParse((await ctx.params).id);
    if (!id.success) return jsonError(404, "not_found", "No world with this id.");
    const text = await request.text();
    let raw: unknown = {};
    try {
      raw = text.trim() ? JSON.parse(text) : {};
    } catch {
      return jsonError(400, "invalid_json", "The body is not valid JSON.");
    }
    const body = Body.safeParse(raw);
    if (!body.success) return jsonError(400, "invalid_body", "runs must be 1 to 3.");

    const { data: world, error } = await supabaseAdmin()
      .from("worlds")
      .select("listing_id")
      .eq("id", id.data)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!world) return jsonError(404, "not_found", "No world with this id.");
    const [viewer, listing] = await Promise.all([getViewer(), getListing(world.listing_id)]);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(403, "not_your_listing", "Only this home's host can check its 3D.");

    const check = await checkSpotWorld(id.data, { runs: body.data.runs });
    return Response.json(checkSummary(check));
  } catch (error) {
    return errorResponse(error);
  }
}
