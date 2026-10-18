/**
 * Trip brief parsing for search (GH-14). Haiku fills the lenient draft schema (no bounds, so
 * structured output never fails on a range); code maps it to TripBriefSchema and works out
 * the budget in cents. Pure, so it is tested (brief.test.ts).
 *
 * Vague briefs are searched, not refused (D-048): a missing place becomes the cities that fit
 * the brief's vibe (or all of them), a missing group size becomes a guess, and every guess is
 * returned as an assumption the guest sees next to the results.
 */
import { z } from "zod";
import { SEARCH_CITIES } from "@/components/search/filters";
import type { TripBrief } from "@/lib/schemas/core";
import { formatCents } from "@/lib/utils";

export const BriefDraftSchema = z.object({
  destinations: z.array(z.string()),
  /** Seeded cities that fit the places or the vibe (mountains, sea, wine, city); [] if no clue. */
  // Plain strings: a city outside the list must not fail the whole parse; code filters.
  fitting_cities: z.array(z.string()),
  check_in: z.string().nullable(),
  check_out: z.string().nullable(),
  nights: z.number().nullable(),
  guests: z.number().nullable(),
  /** When the group size isn't stated: a fair guess from the brief (a couple 2, a family 4). */
  guests_guess: z.number().nullable(),
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

/** Shown when the guest names no place: the search covers every city. */
export const ANYWHERE = "anywhere in Georgia";
/** Group size searched when the brief gives none and no fair guess. */
export const DEFAULT_GUESTS = 2;

const validGuests = (n: number | null) =>
  n !== null && Number.isFinite(n) && Math.round(n) >= 1 && Math.round(n) <= 16
    ? Math.round(n)
    : null;

/**
 * The draft as a TripBrief, plus what had to be assumed for a vague brief (shown to the guest).
 * Never refuses: no place means anywhere, no group size means a guess.
 */
export function toTripBrief(draft: BriefDraft): {
  brief: TripBrief;
  assumptions: string[];
  /** False when the group size is a guess: then it ranks but doesn't filter. */
  guestsStated: boolean;
  /** Places the guest named that have no homes (Paris): the route says where it searched. */
  elsewhere: string[];
} {
  const assumptions: string[] = [];
  const named = cleanList(draft.destinations);
  const fitting = draft.fitting_cities.filter((c) =>
    (SEARCH_CITIES as readonly string[]).includes(c),
  );
  const anywhere = named.some((d) => /georgia|anywhere/i.test(d));
  const seeded = named.filter((d) => matchCities([d]).length > 0);
  // A real place we have no homes in (Paris), not a vibe word ("the mountains").
  const elsewhere = anywhere
    ? []
    : named.filter((d) => matchCities([d]).length === 0 && vibeCities(d).length === 0);
  const destinations =
    seeded.length > 0 ? seeded : anywhere ? named : fitting.length > 0 ? fitting : [ANYWHERE];
  const stated = validGuests(draft.guests);
  const guessed = validGuests(draft.guests_guess);
  const guests = stated ?? guessed ?? DEFAULT_GUESTS;
  if (stated === null)
    assumptions.push(
      `Searched for ${guests} ${guests === 1 ? "guest" : "guests"}; say how many of you are coming for a closer match.`,
    );

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
    assumptions,
    guestsStated: stated !== null,
    elsewhere,
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
      guests_assumed: stated === null,
    },
  };
}

/** The note for places with no homes, naming the cities actually searched ([] = everywhere). */
export function elsewhereNote(elsewhere: string[], searched: string[]): string | null {
  if (elsewhere.length === 0) return null;
  const where = searched.length > 0 ? searched.join(" and ") : "all of Georgia";
  return `Glasshouse has no homes in ${elsewhere.join(" or ")} yet (only Tbilisi, Kazbegi, Batumi and Sighnaghi), so I searched ${where}.`;
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

/** Words that point at one of the seeded places when the guest names none of them. */
const VIBES: [RegExp, (typeof SEARCH_CITIES)[number]][] = [
  [/mountain|hik(e|ing)|trek|ski|snow|kazbek|gergeti|alps|peak|nature|fresh air/i, "Kazbegi"],
  [/\bsea\b|beach|coast|seaside|swim|black sea|waterfront|\bocean/i, "Batumi"],
  [/wine|vineyard|winery|countryside|village|kakheti|vine/i, "Sighnaghi"],
  [
    /\bcity\b|old town|nightlife|museum|restaurant|bars?\b|caf(e|é)s|culture|downtown|capital/i,
    "Tbilisi",
  ],
];

/** The seeded cities a brief's words point at ("mountains" -> Kazbegi); [] for no clue. */
export function vibeCities(text: string): string[] {
  return VIBES.filter(([pattern]) => pattern.test(text)).map(([, city]) => city);
}

/**
 * Where to search: the cities the guest named; otherwise the ones that fit the brief's vibe
 * (the parser's pick plus keyword hints); otherwise everywhere ([]). `named` says whether
 * the guest chose them, so widening can say so.
 */
export function searchCities(
  destinations: string[],
  fitting: readonly string[],
  text: string,
): { cities: string[]; named: boolean } {
  const named = matchCities(destinations);
  if (named.length > 0) return { cities: named, named: true };
  if (destinations.some((d) => /georgia|anywhere/i.test(d))) return { cities: [], named: false };
  const fits = new Set([
    ...fitting.filter((c) => (SEARCH_CITIES as readonly string[]).includes(c)),
    ...vibeCities(text),
  ]);
  return { cities: [...fits], named: false };
}

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
