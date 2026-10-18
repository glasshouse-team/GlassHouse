/**
 * Booking checks shared by the booking box (client) and POST /api/reservations (server),
 * so both refuse the same stays. Prices come from computeQuote (lib/pricing.ts).
 * The booking box ships to every browser: never import seed fixtures or data access here
 * (tests/client-imports.test.ts checks it).
 */
import { stayNights } from "./pricing";

export interface BookingRequest {
  checkIn: string;
  checkOut: string;
  guests: number;
  maxGuests: number;
  /** Nights ("YYYY-MM-DD") the host blocked or a guest already booked. */
  blockedDates: string[];
  /** Today as "YYYY-MM-DD" (UTC): check-in can't be earlier. */
  today: string;
}

/** Why this stay can't be booked, in words for the guest, or null when it can. */
export function bookingProblem(request: BookingRequest): string | null {
  let nights: string[];
  try {
    nights = stayNights(request.checkIn, request.checkOut);
  } catch (error) {
    return error instanceof RangeError ? error.message : "Pick a check-in and a check-out date";
  }
  if (request.checkIn < request.today) return "Check-in can't be in the past";
  if (!Number.isInteger(request.guests) || request.guests < 1) return "Add at least one guest";
  if (request.guests > request.maxGuests) return `This home sleeps up to ${request.maxGuests}`;
  const blocked = nights.filter((night) => request.blockedDates.includes(night));
  if (blocked.length > 0) return `Not available on ${blocked.map(shortDate).join(", ")}`;
  return null;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The stay the booking box starts with: the demo stay (DEMO_DEAL in seed/fixtures.ts, passed
 * in by the server page) while it is still ahead, otherwise four nights a week from today.
 */
export function defaultStay(
  today: string,
  demo: { checkIn: string; checkOut: string },
): { checkIn: string; checkOut: string } {
  if (demo.checkIn > today) return { checkIn: demo.checkIn, checkOut: demo.checkOut };
  const checkIn = addDays(today, 7);
  return { checkIn, checkOut: addDays(checkIn, 4) };
}

/** Guests the booking box starts with: the demo's guests, capped by what the home sleeps. */
export function defaultGuests(maxGuests: number, demoGuests: number): number {
  return Math.max(1, Math.min(demoGuests, maxGuests));
}

/** "Nov 9" for a "YYYY-MM-DD" date. */
function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Nov 9 to Nov 13" for feed lines and confirmations. */
export function stayRangeLabel(checkIn: string, checkOut: string): string {
  return `${shortDate(checkIn)} to ${shortDate(checkOut)}`;
}
