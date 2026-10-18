/**
 * The host's agent rules form (GH-8): what the host may edit in `host_policies`, shared by the
 * form (client) and PUT /api/host-policies/[listingId] (server). Money is integer cents.
 */
import { z } from "zod";
import { Cents } from "@/lib/schemas/core";

/** Extras the host agent may offer instead of money. */
export const ALLOWED_TERMS = [
  { key: "late_checkout", label: "Late checkout" },
  { key: "early_checkin", label: "Early check-in" },
] as const;

const TermKey = z.enum(ALLOWED_TERMS.map((t) => t.key) as ["late_checkout", "early_checkin"]);

export const PolicyFormSchema = z.object({
  negotiable: z.boolean(),
  floor_nightly_cents: Cents.refine((v) => v > 0, "The floor must be above zero"),
  max_discount_pct: z.number().int().min(0).max(100),
  /** null: always ask the host before booking. The database also requires > 0. */
  auto_accept_total_cents: Cents.refine(
    (v) => v > 0,
    "Leave it empty or use a price above zero",
  ).nullable(),
  allowed_terms: z.array(TermKey),
});
export type PolicyForm = z.infer<typeof PolicyFormSchema>;

/** Dollars typed in the form ("100" or "99.50") to integer cents; null for an empty field. */
export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed) * 100);
}

/** Integer cents to the dollars shown in the form ("120" or "99.5"). */
export function centsToDollars(cents: number | null): string {
  return cents === null ? "" : String(cents / 100);
}
