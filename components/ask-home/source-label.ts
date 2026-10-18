/**
 * Chip text for an "Ask this home" source (GH-16): "House rules: Pets: one dog under 15 kg",
 * "Seen in photos: Washer", "House manual: fine for video calls". Browser-safe and pure.
 */
import { factLabel } from "@/components/xray/fact-label";

const RULE_TITLES: Record<string, string> = {
  pets: "Pets",
  smoking: "Smoking",
  parties: "Parties",
  quiet_hours: "Quiet hours",
  check_in_after: "Check-in after",
  check_out_before: "Check-out before",
};

function shorten(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A fact's value comes back as text ("true", "2"); turn it back for factLabel. */
function factValue(quote: string): string | number | boolean {
  if (quote === "true") return true;
  if (quote === "false") return false;
  return quote !== "" && Number.isFinite(Number(quote)) ? Number(quote) : quote;
}

export function sourceLabel(source: { type: string; key: string; quote?: string }): string {
  const quote = source.quote?.trim() ?? "";
  if (source.type === "rule") {
    const title = RULE_TITLES[source.key] ?? source.key.replace(/[_-]+/g, " ");
    return `House rules: ${shorten(quote ? `${title}: ${quote}` : title)}`;
  }
  if (source.type === "fact")
    return `Seen in photos: ${shorten(factLabel(source.key, factValue(quote || "true")))}`;
  return `House manual: ${shorten(quote || source.key)}`;
}
