import { getListing } from "@/lib/data/listings";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { logEvent } from "@/lib/events";
import { getViewer } from "@/lib/viewer";
import { CreateCaptureSchema, captureObjectPaths, fillInSummary, rawUrlFor } from "./schema";
import { gapListingId, insertCapture, requestGapFill, signUploads } from "./store";

/**
 * POST /api/captures: register a phone capture and get signed upload URLs (GH-22, Temuri).
 * The browser then PUTs each file to its `signedUrl` (XMLHttpRequest, for a progress bar) and
 * calls PATCH /api/captures/{id} with `uploaded` or `failed`. Files never pass through this
 * route (D-013). Raw files go to the private `captures` bucket; paths are in ./schema.ts.
 * Only the listing's host can capture it, and a fill-in's `gapId` must be a gap of this listing
 * (GH-19 marks the gap filled from `captures.gap_id`).
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, CreateCaptureSchema);
    const viewer = await getViewer();
    const listing = await getListing(body.listingId);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(403, "not_your_listing", "Only this home's host can record it.");
    if (body.kind === "fill_in" && body.gapId) {
      const gapListing = await gapListingId(body.gapId);
      if (!gapListing) return jsonError(404, "gap_not_found", "This blank spot does not exist.");
      if (gapListing !== listing.id)
        return jsonError(403, "not_your_gap", "This blank spot belongs to another home.");
    }

    const id = crypto.randomUUID();
    const paths = captureObjectPaths(listing.id, id, body);
    const sizeBytes =
      body.kind === "ring"
        ? body.files.reduce((sum, f) => sum + f.sizeBytes, 0)
        : body.file.sizeBytes;

    await insertCapture({
      id,
      listing_id: listing.id,
      kind: body.kind,
      raw_url: rawUrlFor(body.kind, paths),
      duration_s: body.kind === "ring" ? null : body.durationS,
      size_bytes: sizeBytes,
      room_markers: body.roomMarkers,
      heading_track: body.headingTrack,
      quality_flags: body.qualityFlags,
      gap_id: body.kind === "fill_in" ? (body.gapId ?? null) : null,
    });
    const uploads = await signUploads(paths);
    // Record now (GH-19): the gap is being re-shot, so it moves from open to requested.
    if (body.kind === "fill_in" && body.gapId) {
      const requested = await requestGapFill(body.gapId);
      if (requested)
        await logEvent({
          actor_type: "human",
          actor_name: `${viewer.name} (host)`,
          action: "gap.requested",
          summary: fillInSummary(viewer.name, requested.room),
          listing_id: listing.id,
          payload: { gap_id: body.gapId, capture_id: id },
        });
    }
    return Response.json({ captureId: id, uploads }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
