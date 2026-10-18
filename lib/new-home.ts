/**
 * "Add a home" (D-043): what a host fills in to list a new home, shared by the dialog (client)
 * and POST /api/listings (server). Money is entered in dollars and stored as integer cents.
 * The home is published at once with default agent rules; filming and the 3D come next on
 * the capture page, and the text can be redrafted from narration (GH-25).
 */
import { z } from "zod";
import type { PolicyForm } from "@/lib/policy-form";
import { Amenity, Cents } from "@/lib/schemas/core";

export const PROPERTY_TYPES = ["apartment", "house", "cabin", "guesthouse", "loft"] as const;

/** Cities the seed already has: suggestions in the form, not a limit. */
export const SUGGESTED_CITIES = ["Tbilisi", "Kazbegi", "Batumi", "Sighnaghi"] as const;

const Text = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max);

export const NewHomeSchema = z.object({
  title: Text(5, 80, "Give the home a title of at least 5 characters"),
  description: z.string().trim().max(1000).default(""),
  city: Text(2, 60, "Add the city"),
  neighborhood: z
    .string()
    .trim()
    .max(60)
    .transform((v) => v || null)
    .nullable()
    .default(null),
  property_type: z.enum(PROPERTY_TYPES),
  max_guests: z.number().int().min(1).max(16),
  bedrooms: z.number().int().min(0).max(20),
  beds: z.number().int().min(1).max(30),
  baths: z.number().min(0).max(10).multipleOf(0.5),
  base_price_cents: Cents.min(1_000, "The nightly price must be at least $10").max(1_000_000),
  cleaning_fee_cents: Cents.max(100_000),
  amenities: z.array(Amenity).max(30).default([]),
});
export type NewHome = z.infer<typeof NewHomeSchema>;

/** "Old Tbilisi flat, sunny!" -> "old-tbilisi-flat-sunny"; "home" when nothing is left. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return slug || "home";
}

/** A unique-enough slug for a new home: the title plus a short random suffix. */
export function homeSlug(title: string, suffix: string): string {
  return `${slugify(title)}-${suffix}`;
}

/**
 * The agent rules a new home starts with: the same defaults the agent rules form shows
 * (negotiable, floor at the nightly price, at most 10% off, always ask the host).
 */
export function defaultPolicy(basePriceCents: number): PolicyForm {
  return {
    negotiable: true,
    floor_nightly_cents: basePriceCents,
    max_discount_pct: 10,
    auto_accept_total_cents: null,
    allowed_terms: [],
  };
}
