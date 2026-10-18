import { z } from "zod";
import { bookingProblem, stayRangeLabel } from "@/lib/booking";
import { getAvailability, getListing } from "@/lib/data/listings";
import { createReservation, hasOverlappingReservation } from "@/lib/data/reservations";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { computeQuote } from "@/lib/pricing";
import { IsoDate } from "@/lib/schemas/core";
import { formatCents } from "@/lib/utils";
import { getViewer } from "@/lib/viewer";

const BodySchema = z.object({
  listingId: z.uuid(),
  checkIn: IsoDate,
  checkOut: IsoDate,
  guests: z.number().int().positive(),
});

/**
 * POST /api/reservations: books a stay at the list price (payment mocked). The price is
 * recomputed here with computeQuote and the per-night overrides; the client's numbers are
 * never trusted. Owner: Beka (GH-8).
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, BodySchema);
    const viewer = await getViewer();
    if (viewer.role !== "guest")
      return jsonError(403, "guests_only", "Switch to the guest view to book a stay.");

    const listing = await getListing(body.listingId);
    if (!listing) return jsonError(404, "not_found", "This home is not available.");

    const { blockedDates, overrides } = await getAvailability(listing.id, body.checkIn);
    const problem = bookingProblem({ ...body, maxGuests: listing.max_guests, blockedDates });
    if (problem) return jsonError(400, "cannot_book", problem);
    if (await hasOverlappingReservation(listing.id, body.checkIn, body.checkOut))
      return jsonError(409, "already_booked", "These dates were just booked. Pick other dates.");

    const quote = computeQuote({
      listing,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      overrides,
    });
    const id = await createReservation({
      listing_id: listing.id,
      guest_id: viewer.profileId,
      check_in: body.checkIn,
      check_out: body.checkOut,
      guests: body.guests,
      nightly_total_cents: quote.nightlyTotalCents,
      cleaning_cents: quote.cleaningCents,
      discount_cents: quote.discountCents,
      service_fee_cents: quote.serviceFeeCents,
      total_cents: quote.totalCents,
      status: "confirmed",
    });

    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (guest)`,
      action: "reservation.created",
      listing_id: listing.id,
      summary: `${viewer.name} booked ${listing.title}, ${stayRangeLabel(body.checkIn, body.checkOut)}, ${formatCents(quote.totalCents)}`,
      payload: { reservationId: id, nights: quote.nights, totalCents: quote.totalCents },
    });
    return Response.json({ id, quote }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
