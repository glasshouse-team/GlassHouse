import { after } from "next/server";
import { z } from "zod";
import { bookingProblem, stayRangeLabel } from "@/lib/booking";
import { createDeal } from "@/lib/data/deals";
import { getAvailability, getListing } from "@/lib/data/listings";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { computeQuote } from "@/lib/pricing";
import { IsoDate } from "@/lib/schemas/core";
import { getViewer } from "@/lib/viewer";
import { runOnce } from "@/tools/negotiation/lock";

export const maxDuration = 300;

const BodySchema = z.object({
  listingId: z.uuid(),
  checkIn: IsoDate,
  checkOut: IsoDate,
  guests: z.number().int().positive(),
  /** What the guest would like to pay for the stay (nights + cleaning), in cents. */
  targetCents: z.number().int().positive().nullable(),
  /** The most the guest will pay. Private: only the guest agent ever reads it. */
  maxCents: z.number().int().positive(),
});

/**
 * POST /api/deals: the guest opens a negotiation; the agents start at once (after the response).
 * The list total is computeQuote's host subtotal (nights + cleaning). The guest's target and
 * maximum go to `deal_secrets`, never into the feed. Owner: Beka (GH-15).
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, BodySchema);
    const viewer = await getViewer();
    if (viewer.role !== "guest")
      return jsonError(403, "guests_only", "Switch to the guest view to negotiate.");
    const listing = await getListing(body.listingId);
    if (!listing) return jsonError(404, "not_found", "This home is not available.");

    const { blockedDates, overrides } = await getAvailability(listing.id, body.checkIn);
    const today = new Date().toISOString().slice(0, 10);
    const problem = bookingProblem({ ...body, maxGuests: listing.max_guests, blockedDates, today });
    if (problem) return jsonError(400, "cannot_book", problem);
    const quote = computeQuote({
      listing,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      overrides,
    });
    const list = quote.hostSubtotalCents;
    if (body.maxCents < Math.round(list * 0.5))
      return jsonError(
        400,
        "max_too_low",
        "That maximum is less than half the price. Raise it a little.",
      );
    if (body.targetCents !== null && body.targetCents > body.maxCents)
      return jsonError(400, "target_above_max", "Your target can't be above your maximum.");
    if (body.targetCents !== null && body.targetCents >= list)
      return jsonError(
        400,
        "target_not_lower",
        "Your target is already the list price: just book it.",
      );

    const id = await createDeal({
      listingId: listing.id,
      guestId: viewer.profileId,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      guests: body.guests,
      listTotalCents: list,
      targetCents: body.targetCents,
      maxCents: body.maxCents,
    });
    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (guest)`,
      action: "deal.opened",
      deal_id: id,
      listing_id: listing.id,
      summary: `${viewer.name} asked the guest agent to negotiate ${listing.title}, ${stayRangeLabel(body.checkIn, body.checkOut)}`,
    });
    after(() => runOnce(id));
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
