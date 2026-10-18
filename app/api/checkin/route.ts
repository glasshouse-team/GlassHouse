import { checkinFeedLine, checkinProblem, pickListingPhotos, severitySummary } from "@/lib/checkin";
import { agentModel } from "@/lib/claude";
import { createCheckin, finishCheckin, getListingFacts, getReservation } from "@/lib/data/checkins";
import { getListing, getListingPhotos } from "@/lib/data/listings";
import { settings } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import {
  CheckinRequestSchema,
  MAX_FRAMES_TOTAL_CHARS,
  type StoredCheckinReport,
} from "@/lib/schemas/checkin";
import { getViewer } from "@/lib/viewer";
import { compareArrival, decodeFrame } from "@/tools/checkin/compare";
import { prepareImage } from "@/tools/verifier/xray";

/** One Sonnet vision call with up to 16 images. */
export const maxDuration = 120;

/**
 * POST /api/checkin: the guest of a reservation sends up to 8 arrival frames (JPEG data URLs
 * taken in the browser, D-015); the Verifier compares them with the listing's photos and X-ray
 * facts. The report (frame ids only, no images) is saved to `checkins` and one Verifier event
 * tells the host. Frames are not stored. Owner: Beka (GH-23).
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, CheckinRequestSchema);
    if (body.frames.reduce((n, f) => n + f.length, 0) > MAX_FRAMES_TOTAL_CHARS)
      return jsonError(413, "too_large", "The frames are too large. Send fewer or smaller ones.");

    const [viewer, reservation] = await Promise.all([
      getViewer(),
      getReservation(body.reservationId),
    ]);
    const problem = checkinProblem(viewer, reservation);
    if (problem || !reservation)
      return jsonError(
        problem?.status ?? 404,
        problem?.code ?? "not_found",
        problem?.message ?? "",
      );

    const frames = body.frames.map(decodeFrame);
    if (frames.some((f) => f === null))
      return jsonError(400, "invalid_frame", "Each frame must be a JPEG image.");

    const listing = await getListing(reservation.listing_id);
    if (!listing) return jsonError(404, "not_found", "This home is no longer listed.");
    const [photos, facts] = await Promise.all([
      getListingPhotos(listing.id),
      getListingFacts(listing.id),
    ]);
    const picked = pickListingPhotos(photos);
    if (picked.length === 0)
      return jsonError(409, "no_photos", "This home has no listing photos to compare with.");

    const checkinId = await createCheckin(reservation.id);
    const event = { actor_type: "agent", actor_name: "Verifier", agent: "verifier" } as const;
    try {
      const photoImages = await Promise.all(picked.map(({ photo }) => prepareImage(photo.url)));
      const { report, frameIds, usage } = await compareArrival({
        model: agentModel(),
        listing: {
          title: listing.title,
          amenities: listing.amenities,
          property_type: listing.property_type,
          max_guests: listing.max_guests,
          bedrooms: listing.bedrooms,
          beds: listing.beds,
          baths: listing.baths,
        },
        facts,
        photos: picked,
        photoImages,
        frames: frames as Buffer[],
      });
      const stored: StoredCheckinReport = {
        ...report,
        frame_ids: frameIds,
        photo_ids: Object.fromEntries(picked.map(({ label, photo }) => [label, photo.id])),
        model: settings.agentModel,
      };
      await finishCheckin(checkinId, { status: "ready", report: stored });
      // The host's notice: a Verifier event on the listing (their dashboard feed shows it).
      await logEvent({
        ...event,
        action: "checkin.verified",
        summary: checkinFeedLine(viewer.name, report),
        listing_id: listing.id,
        payload: {
          checkinId,
          reservationId: reservation.id,
          notify: "host",
          hostId: listing.host_id,
          frames: frameIds.length,
          photos: picked.length,
          matches: report.matches.length,
          severity: severitySummary(report),
          differences: report.differences.map((d) => `${d.room}: ${d.seen}`),
          model: settings.agentModel,
          usage,
        },
      });
      return Response.json({ id: checkinId, report: stored }, { status: 201 });
    } catch (error) {
      await finishCheckin(checkinId, { status: "failed" }).catch(() => {});
      await logEvent({
        ...event,
        action: "checkin.verified.failed",
        summary: `Verifier could not compare ${viewer.name}'s arrival with the listing`,
        listing_id: listing.id,
        payload: {
          checkinId,
          reservationId: reservation.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
