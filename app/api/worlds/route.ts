import { getCaptures } from "@/app/api/captures/store";
import { getListing } from "@/lib/data/listings";
import { isDemoMode } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { getViewer } from "@/lib/viewer";
import { GenerateWorldSchema, checkCaptures, generationRequestSummary } from "./request";

/**
 * POST /api/worlds { listingId, captureIds }: "Generate my 3D home" on the capture page (GH-22).
 * Only the listing's host, only with uploaded captures of that listing.
 *
 * D-038: this route records the request (feed event `world.generation_requested` with the
 * capture ids) and makes no World Labs call: generation spends credits, so a person runs
 * `pnpm worlds generate` from the request, then `pnpm worlds import` and publish (GH-10). When a
 * web pipeline replaces that, this route starts the jobs and the request body stays the same.
 * DEMO_MODE=true records nothing new for generation and keeps the saved 3D tour.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, GenerateWorldSchema);
    const viewer = await getViewer();
    const listing = await getListing(body.listingId);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(403, "not_your_listing", "Only this home's host can generate its 3D tour.");

    const check = checkCaptures(listing.id, body.captureIds, await getCaptures(body.captureIds));
    if (!check.ok) return jsonError(check.status, check.code, check.message);

    if (isDemoMode()) return Response.json({ status: "demo" });

    const captureIds = [...new Set(body.captureIds)];
    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (host)`,
      action: "world.generation_requested",
      summary: generationRequestSummary(viewer.name, captureIds.length, check.rooms),
      listing_id: listing.id,
      payload: { capture_ids: captureIds, rooms: check.rooms },
    });
    return Response.json({ status: "requested", captureIds }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
