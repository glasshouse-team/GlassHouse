import { z } from "zod";
import { getListing } from "@/lib/data/listings";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { getViewer } from "@/lib/viewer";
import { runXray } from "@/tools/verifier/xray";

/** Up to 20 photos through Claude can take a minute or two. */
export const maxDuration = 300;

const BodySchema = z.object({ model: z.enum(["bulk", "agent"]).optional() });

/**
 * POST /api/xray/[listingId]: the Verifier re-checks a listing's photos against its text and
 * saves `listing_facts` (GH-9, Temuri). Only the listing's host can start it: each run costs
 * tokens. `pnpm xray` runs it for every listing.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/xray/[listingId]">) {
  try {
    const { listingId } = await ctx.params;
    const { model } = await parseJson(request, BodySchema);
    const viewer = await getViewer();
    const listing = await getListing(listingId);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(403, "not_your_listing", "Only this home's host can re-check its photos.");

    const run = await runXray(listing.id, { model });
    return Response.json({ model: run.model, photoCount: run.photoCount, ...run.result });
  } catch (error) {
    return errorResponse(error);
  }
}
