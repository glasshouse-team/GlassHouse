import { z } from "zod";
import { getListing } from "@/lib/data/listings";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { RoomMarkerSchema } from "@/lib/schemas/world";
import { getViewer } from "@/lib/viewer";
import { UpdateCaptureSchema, uploadSummary } from "../schema";
import { getCapture, listCaptureFiles, setCaptureStatus } from "../store";

const Markers = z.array(RoomMarkerSchema).catch([]);

/**
 * PATCH /api/captures/[id]: the browser reports that its upload finished ("uploaded") or gave
 * up ("failed") (GH-22, Temuri). "uploaded" is only accepted when the files are in storage.
 * Logs the upload to the activity feed.
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
    if (capture.status !== "uploading")
      return jsonError(409, "already_final", `This capture is already ${capture.status}.`);

    // raw_url is "captures/<path>": a folder for rings, a file for videos.
    const path = (capture.raw_url ?? "").replace(/^captures\//, "");
    const isRing = capture.kind === "ring";
    const folder = isRing ? path : path.replace(/\/[^/]+$/, "");
    let fileCount = 0;
    if (status === "uploaded") {
      const names = await listCaptureFiles(folder);
      fileCount = isRing ? names.length : names.includes(path.split("/").pop() ?? "") ? 1 : 0;
      if (fileCount === 0)
        return jsonError(409, "files_missing", "The upload has not reached storage yet.");
    }

    await setCaptureStatus(id, status);
    const rooms = [...new Set(Markers.parse(capture.room_markers).map((m) => m.room))];
    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (host)`,
      action: status === "uploaded" ? "capture.uploaded" : "capture.failed",
      summary:
        status === "uploaded"
          ? uploadSummary(
              viewer.name,
              capture.kind as "walkthrough" | "ring" | "fill_in",
              rooms,
              fileCount,
              capture.duration_s,
            )
          : `${viewer.name}'s capture upload failed`,
      listing_id: capture.listing_id,
      payload: { capture_id: id, kind: capture.kind, files: fileCount },
    });
    return Response.json({ captureId: id, status });
  } catch (error) {
    return errorResponse(error);
  }
}
