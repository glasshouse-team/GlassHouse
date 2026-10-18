import { z } from "zod";
import { getListing } from "@/lib/data/listings";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { RoomMarkerSchema } from "@/lib/schemas/world";
import { getViewer } from "@/lib/viewer";
import { UpdateCaptureSchema, checkUpload, requiredStatus, uploadSummary } from "../schema";
import { getCapture, listCaptureFiles, setCaptureStatus } from "../store";

const Markers = z.array(RoomMarkerSchema).catch([]);
const Track = z.array(z.unknown()).catch([]);

/**
 * PATCH /api/captures/[id] (GH-22, Temuri): the browser reports that its upload finished
 * ("uploaded"), gave up ("failed"), or is retrying a failed one ("uploading": it re-sends the
 * missing files to the same signed URLs, so a retry keeps the row).
 * "uploaded" is only accepted when every expected file is in storage (`checkUpload`), because
 * POST /api/worlds trusts that status. The update is conditional on the current status, so of
 * two PATCHes in a race only one changes the row and only that one is logged to the feed.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/captures/[id]">) {
  try {
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success)
      return jsonError(404, "not_found", "This capture does not exist.");
    const { status } = await parseJson(request, UpdateCaptureSchema);
    const viewer = await getViewer();
    const capture = await getCapture(id);
    if (!capture) return jsonError(404, "not_found", "This capture does not exist.");
    const listing = await getListing(capture.listing_id);
    if (!listing || viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(403, "not_your_listing", "Only this home's host can update its captures.");
    const from = requiredStatus(status);
    if (capture.status !== from)
      return jsonError(409, "already_final", `This capture is already ${capture.status}.`);

    // raw_url is "captures/<path>": a folder for rings, a file for videos.
    const path = (capture.raw_url ?? "").replace(/^captures\//, "");
    const isRing = capture.kind === "ring";
    const folder = isRing ? path : path.replace(/\/[^/]+$/, "");
    let fileCount = 0;
    if (status === "uploaded") {
      const check = checkUpload(
        {
          kind: capture.kind,
          path,
          headingCount: Track.parse(capture.heading_track).length,
          sizeBytes: capture.size_bytes,
        },
        await listCaptureFiles(folder),
      );
      if (!check.complete)
        return jsonError(
          409,
          "files_missing",
          check.missing.length
            ? `${check.missing.length} file(s) have not reached storage yet.`
            : "The stored files do not match the upload yet.",
        );
      fileCount = check.fileCount;
    }

    // Another request changed the row between the read above and this update.
    if (!(await setCaptureStatus(id, status, from)))
      return jsonError(409, "already_final", "This capture was just updated by another request.");

    const rooms = [...new Set(Markers.parse(capture.room_markers).map((m) => m.room))];
    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (host)`,
      action:
        status === "uploaded"
          ? "capture.uploaded"
          : status === "failed"
            ? "capture.failed"
            : "capture.retried",
      summary:
        status === "uploaded"
          ? uploadSummary(
              viewer.name,
              capture.kind as "walkthrough" | "ring" | "fill_in",
              rooms,
              fileCount,
              capture.duration_s,
            )
          : status === "failed"
            ? `${viewer.name}'s capture upload failed`
            : `${viewer.name} retried a capture upload`,
      listing_id: capture.listing_id,
      payload: { capture_id: id, kind: capture.kind, files: fileCount },
    });
    return Response.json({ captureId: id, status });
  } catch (error) {
    return errorResponse(error);
  }
}
