import { z } from "zod";
import { getListing, getListingPhotos, getListingXray } from "@/lib/data/listings";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { getViewer } from "@/lib/viewer";
import { withEvent } from "@/tools/_withEvent";
import {
  draftListing,
  isOurMediaUrl,
  type DraftListingInput,
  type ListingDraft,
} from "@/tools/host/draft";

export const maxDuration = 60;

const BodySchema = z.object({
  listingId: z.uuid(),
  /** The host's narration, typed or transcribed (Web Speech API, or later ElevenLabs Scribe). */
  narration: z.string().trim().min(20, "Say a little more about the home").max(8000),
  /** Optional: photos of this listing (`listing_photos.id`) the model also looks at. */
  photoIds: z.array(z.uuid()).max(4).optional(),
  /** Optional: frames or photos already in our public `media` storage (e.g. from a capture). */
  photoUrls: z.array(z.url()).max(4).optional(),
});

/**
 * POST /api/listing-draft: the host agent drafts the listing from the host's narration, the
 * X-ray facts and (optionally) a few photos (GH-25, Beka). Host only. Nothing is saved: the
 * dashboard shows the draft next to the listing and the host applies fields with
 * POST /api/listing-draft/apply. The feed line carries counts only, never the narration.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, BodySchema);
    const viewer = await getViewer();
    const listing = await getListing(body.listingId);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(403, "not_your_listing", "Only this home's host can draft its listing.");
    if (body.photoUrls?.some((url) => !isOurMediaUrl(url)))
      return jsonError(400, "bad_photo_url", "Photos must come from Glasshouse storage.");

    const [facts, photos] = await Promise.all([
      getListingXray(listing.id),
      body.photoIds?.length ? getListingPhotos(listing.id) : Promise.resolve([]),
    ]);
    const wanted = new Set(body.photoIds ?? []);
    const photoUrls = [
      ...photos.filter((p) => wanted.has(p.id)).map((p) => p.url),
      ...(body.photoUrls ?? []),
    ].slice(0, 4);

    const started = Date.now();
    const draft = withEvent<[DraftListingInput], ListingDraft>(
      {
        action: "listing.drafted",
        actorName: "Host agent",
        agent: "host",
        summarize: () =>
          `Host agent drafted the listing for ${listing.title} from ${viewer.name}'s narration`,
        scope: () => ({ listingId: listing.id }),
        // Counts only: the narration and the manual lines can hold private details.
        payload: (result) => ({
          amenities: result.amenities.length,
          seenInPhotos: result.amenities.filter((a) => a.source === "photos").length,
          unsupportedClaims: result.unsupportedClaims.length,
          photos: photoUrls.length,
          ms: Date.now() - started,
        }),
      },
      draftListing,
    );
    const result = await draft({
      hostName: viewer.name,
      listing,
      narration: body.narration,
      facts,
      photoUrls,
      abortSignal: request.signal,
    });
    return Response.json({ draft: result, ms: Date.now() - started, xrayChecked: facts !== null });
  } catch (error) {
    return errorResponse(error);
  }
}
