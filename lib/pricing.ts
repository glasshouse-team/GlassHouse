/**
 * Price math lives in code, never in a prompt (owner: Beka, GH-8).
 * Agents may propose amounts; this module computes every price line.
 */
import type { Listing, Quote } from "./schemas/core";

/** Glasshouse service fee charged to the guest, on top of the host subtotal. */
export const SERVICE_FEE_RATE = 0.1;
/** Longest stay we price in one quote. */
export const MAX_NIGHTS = 60;

export type PriceableListing = Pick<
  Listing,
  "base_price_cents" | "weekend_price_cents" | "cleaning_fee_cents"
>;

export interface PriceOverride {
  /** Night date "YYYY-MM-DD" (the night that starts on this date). */
  date: string;
  price_override_cents: number | null;
}

export interface QuoteInput {
  listing: PriceableListing;
  checkIn: string;
  checkOut: string;
  /** Amount taken off the host subtotal, e.g. an agreed negotiation discount. */
  discountCents?: number;
  /** Per-date prices from the `availability` table. */
  overrides?: PriceOverride[];
}

const DAY_MS = 86_400_000;

function parseIsoDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new RangeError(`Invalid date "${value}", use YYYY-MM-DD`);
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new RangeError(`Invalid date "${value}"`);
  return ms;
}

/** The nights of a stay as dates: check-in Nov 9, check-out Nov 13 gives Nov 9, 10, 11, 12. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const start = parseIsoDate(checkIn);
  const end = parseIsoDate(checkOut);
  const count = Math.round((end - start) / DAY_MS);
  if (count < 1) throw new RangeError("Check-out must be at least one day after check-in");
  if (count > MAX_NIGHTS) throw new RangeError(`Stays are limited to ${MAX_NIGHTS} nights`);
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * DAY_MS).toISOString().slice(0, 10),
  );
}

/** Friday and Saturday nights use the weekend rate. */
export function isWeekendNight(date: string): boolean {
  const day = new Date(parseIsoDate(date)).getUTCDay();
  return day === 5 || day === 6;
}

export function nightlyRateCents(
  listing: PriceableListing,
  date: string,
  overrides: PriceOverride[] = [],
): number {
  const override = overrides.find((o) => o.date === date)?.price_override_cents;
  if (override != null) return override;
  if (isWeekendNight(date) && listing.weekend_price_cents != null)
    return listing.weekend_price_cents;
  return listing.base_price_cents;
}

/**
 * Full price breakdown for a stay.
 * hostSubtotal = nights + cleaning (what agents negotiate over)
 * total = hostSubtotal - discount + service fee (10% of the discounted subtotal)
 */
export function computeQuote({
  listing,
  checkIn,
  checkOut,
  discountCents = 0,
  overrides = [],
}: QuoteInput): Quote {
  if (!Number.isInteger(discountCents) || discountCents < 0) {
    throw new RangeError("discountCents must be a non-negative integer");
  }
  const nights = stayNights(checkIn, checkOut);
  const nightlyTotalCents = nights.reduce(
    (sum, date) => sum + nightlyRateCents(listing, date, overrides),
    0,
  );
  const cleaningCents = listing.cleaning_fee_cents;
  const hostSubtotalCents = nightlyTotalCents + cleaningCents;
  const discount = Math.min(discountCents, hostSubtotalCents);
  const serviceFeeCents = Math.round((hostSubtotalCents - discount) * SERVICE_FEE_RATE);
  return {
    nights: nights.length,
    nightlyTotalCents,
    cleaningCents,
    hostSubtotalCents,
    discountCents: discount,
    serviceFeeCents,
    totalCents: hostSubtotalCents - discount + serviceFeeCents,
  };
}
