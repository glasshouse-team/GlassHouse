import { z } from "zod";

/** The seeded cities (docs/teardown.md section 5). */
export const SEARCH_CITIES = ["Tbilisi", "Kazbegi", "Batumi", "Sighnaghi"] as const;

const Filters = z.object({
  city: z.enum(SEARCH_CITIES).optional().catch(undefined),
  guests: z.coerce.number().int().min(1).max(16).optional().catch(undefined),
});

/** Reads `?city=&guests=` leniently: anything unknown or malformed is ignored. */
export function parseSearchFilters(params: Record<string, string | string[] | undefined>) {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  return Filters.parse({ city: first(params.city), guests: first(params.guests) });
}
