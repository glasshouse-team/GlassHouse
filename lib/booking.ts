/**
 * Booking checks shared by the booking box (client) and POST /api/reservations (server),
 * so both refuse the same stays. Prices come from computeQuote (lib/pricing.ts).
 */
import { DEMO_DEAL } from "@/seed/fixtures";
import { stayNights } from "./pricing";

export interface BookingRequest {
  checkIn: string;
  checkOut: string;
  guests: number;
  maxGuests: number;
  /** Nights ("YYYY-MM-DD") the host has blocked in `availability`. */
  blockedDates: string[];
}

/** Why this stay can't be booked, in words for the guest, or null when it can. */
export function bookingProblem(request: BookingRequest): string | null {
  let nights: string[];
  try {
    nights = stayNights(request.checkIn, request.checkOut);
  } catch (error) {
    return error instanceof RangeError ? error.message : "Pick a check-in and a check-out date";
  }
  if (!Number.isInteger(request.guests) || request.guests < 1) return "Add at least one guest";
  if (request.guests > request.maxGuests) return `This home sleeps up to ${request.maxGuests}`;
  const blocked = nights.filter((night) => request.blockedDates.includes(night));
  if (blocked.length > 0) return `Not available on ${blocked.join(", ")}`;
  return null;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The stay the booking box starts with: the demo dates (Mon Nov 9 to Fri Nov 13, 2026) while
 * they are still ahead, otherwise four nights starting a week from today.
 */
export function defaultStay(today: string): { checkIn: string; checkOut: string } {
  if (DEMO_DEAL.checkIn > today)
    return { checkIn: DEMO_DEAL.checkIn, checkOut: DEMO_DEAL.checkOut };
  const checkIn = addDays(today, 7);
  return { checkIn, checkOut: addDays(checkIn, 4) };
}

/** Guests the booking box starts with: the demo's 4, capped by what the home sleeps. */
export function defaultGuests(maxGuests: number): number {
  return Math.max(1, Math.min(DEMO_DEAL.guests, maxGuests));
}

/** "Nov 9 to Nov 13" for feed lines and confirmations. */
export function stayRangeLabel(checkIn: string, checkOut: string): string {
  const day = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${day(checkIn)} to ${day(checkOut)}`;
}
