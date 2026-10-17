/** Pure text helpers for the listing and search pages (unit-tested, no React). */
import type { Amenity } from "@/lib/schemas/core";

/** Our own labels for the shared amenity words (docs/teardown.md section 5). */
export const AMENITY_LABELS: Record<Amenity, string> = {
  wifi: "Wifi",
  dedicated_workspace: "Dedicated workspace",
  kitchen: "Kitchen",
  washer: "Washing machine",
  dryer: "Dryer",
  dishwasher: "Dishwasher",
  coffee_maker: "Coffee maker",
  heating: "Heating",
  air_conditioning: "Air conditioning",
  fireplace: "Fireplace",
  free_parking: "Free parking",
  street_parking: "Street parking",
  elevator: "Elevator",
  tv: "TV",
  balcony: "Balcony",
  terrace: "Terrace",
  garden: "Garden",
  bbq_grill: "Barbecue grill",
  hot_tub: "Hot tub",
  sauna: "Sauna",
  mountain_view: "Mountain view",
  sea_view: "Sea view",
  city_view: "City view",
  self_check_in: "Self check-in",
  crib: "Crib",
  high_chair: "High chair",
};

/** Label for an amenity word; unknown words are shown readable rather than hidden. */
export function amenityLabel(key: string): string {
  if (key in AMENITY_LABELS) return AMENITY_LABELS[key as Amenity];
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "4 guests · 2 bedrooms · 3 beds · 1 bath" (a studio has no bedroom count). */
export function factsLine(l: {
  max_guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
}): string {
  return [
    count(l.max_guests, "guest"),
    l.bedrooms === 0 ? "Studio" : count(l.bedrooms, "bedroom"),
    count(l.beds, "bed"),
    count(l.baths, "bath"),
  ].join(" · ");
}

/** "Entire house in Kazbegi". Guesthouses rent a room, not the whole place. */
export function stayLabel(propertyType: string, city: string): string {
  if (propertyType === "guesthouse") return `Room in a guesthouse in ${city}`;
  return `Entire ${propertyType} in ${city}`;
}

export interface HouseRulesInput {
  pets?: boolean | string;
  smoking?: boolean;
  parties?: boolean;
  quiet_hours?: string;
  check_in_after?: string;
  check_out_before?: string;
}

/** The house rules as short lines, in the order guests look for them. */
export function houseRuleLines(rules: HouseRulesInput): string[] {
  const lines: string[] = [];
  if (rules.check_in_after) lines.push(`Check-in after ${rules.check_in_after}`);
  if (rules.check_out_before) lines.push(`Checkout before ${rules.check_out_before}`);
  if (typeof rules.pets === "string") lines.push(`Pets: ${rules.pets}`);
  else if (rules.pets !== undefined) lines.push(rules.pets ? "Pets allowed" : "No pets");
  if (rules.smoking !== undefined) lines.push(rules.smoking ? "Smoking allowed" : "No smoking");
  if (rules.parties !== undefined)
    lines.push(rules.parties ? "Parties allowed" : "No parties or events");
  if (rules.quiet_hours) lines.push(`Quiet hours ${rules.quiet_hours.replace("-", " to ")}`);
  return lines;
}

export const SUB_RATINGS = [
  ["cleanliness", "Cleanliness"],
  ["accuracy", "Accuracy"],
  ["check_in", "Check-in"],
  ["communication", "Communication"],
  ["location", "Location"],
  ["value", "Value"],
] as const;

/** Average of each sub-rating across reviews, one decimal; reviews missing a key are skipped. */
export function subRatingAverages(
  reviews: { sub_ratings: unknown }[],
): { key: string; label: string; average: number | null }[] {
  return SUB_RATINGS.map(([key, label]) => {
    const values = reviews
      .map((r) => (r.sub_ratings as Record<string, unknown> | null)?.[key])
      .filter((v): v is number => typeof v === "number");
    const average =
      values.length === 0
        ? null
        : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    return { key, label, average };
  });
}

/** "September 2026" from a timestamp. */
export function reviewMonth(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
