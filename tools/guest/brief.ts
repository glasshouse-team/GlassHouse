/**
 * Trip brief parsing for search (GH-14). Haiku fills the lenient draft schema (no bounds, so
 * structured output never fails on a range); code maps it to TripBriefSchema and works out
 * the budget in cents. Pure, so it is tested (brief.test.ts).
 */
import { z } from "zod";
import { SEARCH_CITIES } from "@/components/search/filters";
import type { TripBrief } from "@/lib/schemas/core";
import { formatCents } from "@/lib/utils";

export const BriefDraftSchema = z.object({
  destinations: z.array(z.string()),
  check_in: z.string().nullable(),
  check_out: z.string().nullable(),
  nights: z.number().nullable(),
  guests: z.number().nullable(),
  budget_amount_usd: z.number().nullable(),
  budget_per: z.enum(["night", "night_per_person", "total"]).nullable(),
  must_haves: z.array(z.string()),
  nice_to_haves: z.array(z.string()),
  deal_breakers: z.array(z.string()),
  work_needs: z.string().nullable(),
  pets: z.number().nullable(),
  accessibility: z.array(z.string()),
});
export type BriefDraft = z.infer<typeof BriefDraftSchema>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function cleanList(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].slice(0, 12);
}

/** The draft as a TripBrief, or a friendly question when the brief can't be searched. */
export function toTripBrief(draft: BriefDraft): { brief: TripBrief } | { problem: string } {
  const destinations = cleanList(draft.destinations);
  if (destinations.length === 0)
    return { problem: "Where would you like to go? For example Tbilisi, Kazbegi or Batumi." };
  const guests = Math.round(draft.guests ?? 0);
  if (guests < 1 || guests > 16) return { problem: "How many people are coming?" };

  const datesOk =
    !!draft.check_in &&
    !!draft.check_out &&
    ISO.test(draft.check_in) &&
    ISO.test(draft.check_out) &&
    Date.parse(draft.check_out) > Date.parse(draft.check_in);
  const check_in = datesOk ? draft.check_in : null;
  const check_out = datesOk ? draft.check_out : null;
  const fromDates =
    check_in && check_out
      ? Math.round((Date.parse(check_out) - Date.parse(check_in)) / DAY_MS)
      : null;
  const draftNights = draft.nights && draft.nights >= 1 ? Math.round(draft.nights) : null;

  const amount = draft.budget_amount_usd;
  return {
    brief: {
      destinations,
      check_in,
      check_out,
      nights: fromDates ?? draftNights,
      guests,
      budget:
        amount && amount > 0
          ? { amount_cents: Math.round(amount * 100), per: draft.budget_per ?? "night" }
          : null,
      must_haves: cleanList(draft.must_haves),
      nice_to_haves: cleanList(draft.nice_to_haves),
      deal_breakers: cleanList(draft.deal_breakers),
      work_needs: draft.work_needs?.trim() || null,
      pets: Math.max(0, Math.round(draft.pets ?? 0)),
      accessibility: cleanList(draft.accessibility),
    },
  };
}

/** The whole group's budget per night in cents, or null when the brief has none. */
export function nightlyBudgetCents(brief: TripBrief): number | null {
  if (!brief.budget) return null;
  const { amount_cents, per } = brief.budget;
  if (per === "night") return amount_cents;
  if (per === "night_per_person") return amount_cents * brief.guests;
  return brief.nights ? Math.round(amount_cents / brief.nights) : null;
}

/** Highest nightly price searched: 1.2 x the budget, room to negotiate. */
export function priceCeilingCents(brief: TripBrief): number | null {
  const nightly = nightlyBudgetCents(brief);
  return nightly === null ? null : Math.round(nightly * 1.2);
}

/** "4 guests · Kazbegi, Tbilisi · up to $240 a night" for the results header. */
export function briefLabel(brief: TripBrief): string {
  const nightly = nightlyBudgetCents(brief);
  return [
    `${brief.guests} ${brief.guests === 1 ? "guest" : "guests"}`,
    brief.destinations.join(", "),
    brief.nights ? `${brief.nights} nights` : null,
    nightly ? `about ${formatCents(nightly)} a night` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const CITY_ALIASES: Record<string, (typeof SEARCH_CITIES)[number]> = {
  stepantsminda: "Kazbegi",
  gudauri: "Kazbegi",
  "tbilisi old town": "Tbilisi",
  kakheti: "Sighnaghi",
  adjara: "Batumi",
};

/** The seeded cities a brief names; empty when it names none of them. */
export function matchCities(destinations: string[]): string[] {
  const found = new Set<string>();
  for (const destination of destinations) {
    const name = destination.trim().toLowerCase();
    const city = SEARCH_CITIES.find((c) => name.includes(c.toLowerCase())) ?? CITY_ALIASES[name];
    if (city) found.add(city);
  }
  return [...found];
}
