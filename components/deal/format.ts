/**
 * Deal room wording shared by the server (feed lines, tools/negotiation/engine.ts) and the
 * browser (components/deal). Public numbers only: list totals and offers, never limits.
 */
import { formatCents } from "@/lib/utils";

/** "-$50" or "+$10" against the list total; "" when equal. */
export function differenceFromList(amountCents: number, listTotalCents: number): string {
  const diff = amountCents - listTotalCents;
  if (diff === 0) return "";
  return diff < 0 ? `-${formatCents(-diff)}` : `+${formatCents(diff)}`;
}

/** "Approve $480 for Nov 9 to Nov 13 (-$40, 7.7% off)?" for the host's toast and queue. */
export function approvalPrompt(amountCents: number, listTotalCents: number, stay: string): string {
  const off = listTotalCents - amountCents;
  const pct = ((off / listTotalCents) * 100).toFixed(1);
  return off > 0
    ? `Approve ${formatCents(amountCents)} for ${stay} (-${formatCents(off)}, ${pct}% off)?`
    : `Approve ${formatCents(amountCents)} for ${stay}?`;
}
