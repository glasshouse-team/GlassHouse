/** Pure text helpers for the trip page (owner: Beka, GH-23). */
import { stayNights } from "@/lib/pricing";
import { formatCents } from "@/lib/utils";

export interface TripPriceInput {
  check_in: string;
  check_out: string;
  nightly_total_cents: number;
  cleaning_cents: number;
  discount_cents: number;
  service_fee_cents: number;
  total_cents: number;
}

export interface PriceLine {
  label: string;
  amount: string;
  total?: boolean;
}

/** The price lines exactly as the reservation row saved them (no math beyond the night count). */
export function tripPriceLines(r: TripPriceInput, currency = "USD"): PriceLine[] {
  const nights = stayNights(r.check_in, r.check_out).length;
  const lines: PriceLine[] = [
    {
      label: `${nights} night${nights === 1 ? "" : "s"}`,
      amount: formatCents(r.nightly_total_cents, currency),
    },
  ];
  if (r.cleaning_cents > 0)
    lines.push({ label: "Cleaning fee", amount: formatCents(r.cleaning_cents, currency) });
  if (r.discount_cents > 0)
    lines.push({ label: "Agreed discount", amount: `-${formatCents(r.discount_cents, currency)}` });
  lines.push({ label: "Service fee", amount: formatCents(r.service_fee_cents, currency) });
  lines.push({ label: "Total", amount: formatCents(r.total_cents, currency), total: true });
  return lines;
}
