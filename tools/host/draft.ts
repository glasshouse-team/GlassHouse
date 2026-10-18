/**
 * The host agent drafts a listing from the host's narration (GH-25, owner: Beka).
 * Haiku 5.5 with thinking off writes a flat draft; code then keeps only known amenities,
 * keeps numbers sane, and marks every amenity as seen in the photos (an X-ray fact backs it)
 * or from the narration only. Nothing here saves to the listing.
 */
import { generateText, Output, type ModelMessage } from "ai";
import { z } from "zod";
import { asData } from "@/agents/data";
import { loadPrompt } from "@/agents/load-prompt";
import { bulkModel } from "@/lib/claude";
import { Amenity, type HouseRulesSchema } from "@/lib/schemas/core";
import type { XrayResult } from "@/lib/schemas/verifier";

// ---------- What the model returns (flat and simple; code checks the rest) ----------

export const DraftOutputSchema = z.object({
  title: z.string().describe("under 60 characters"),
  description: z.string().describe("3-5 sentences, only what the narration or the facts support"),
  property_type: z.string().describe("apartment, house, studio, cabin, guesthouse or villa"),
  max_guests: z.number().nullable(),
  bedrooms: z.number().nullable(),
  beds: z.number().nullable(),
  baths: z.number().nullable(),
  amenities: z.array(z.string()).describe("keys from the allowed list only"),
  pets_allowed: z.boolean().nullable(),
  smoking_allowed: z.boolean().nullable(),
  parties_allowed: z.boolean().nullable(),
  quiet_hours: z.string().nullable().describe('like "22:00-08:00", or null'),
  check_in_after: z.string().nullable().describe('like "15:00", or null'),
  check_out_before: z.string().nullable().describe('like "11:00", or null'),
  house_manual: z.array(z.string()).describe("short practical lines for guests after booking"),
  unsupported_claims: z
    .array(z.string())
    .describe("claims in your description the photo facts do not show, each under 12 words"),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

// ---------- What the dashboard gets ----------

export type HouseRules = z.infer<typeof HouseRulesSchema>;

/** The listing fields a draft can change, as they are now. */
export interface CurrentListing {
  id: string;
  title: string;
  description: string;
  property_type: string;
  max_guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  amenities: string[];
  house_rules: HouseRules;
}

export type AmenitySource = "photos" | "narration";

export interface DraftAmenity {
  key: Amenity;
  /** "photos" = an X-ray fact backs it; "narration" = only the host said so. */
  source: AmenitySource;
  /** The X-ray fact key behind a "photos" amenity. */
  factKey: string | null;
}

export type CountField = "max_guests" | "bedrooms" | "beds" | "baths";

export interface ListingDraft {
  title: string;
  description: string;
  property_type: string;
  /** null = the narration did not say; the dashboard keeps the current value. */
  max_guests: number | null;
  bedrooms: number | null;
  beds: number | null;
  baths: number | null;
  amenities: DraftAmenity[];
  /** Words the model returned that are not in the shared Amenity list. */
  droppedAmenities: string[];
  house_rules: HouseRules;
  house_manual: string[];
  /** Description claims the photos do not show (shown in amber). */
  unsupportedClaims: string[];
  /** Counts that disagree with the photos or were out of range (shown in amber). */
  numberNotes: { field: CountField; note: string }[];
  /** From the X-ray, plus a photo to take for each amenity backed by narration only. */
  missingPhotos: string[];
}

// ---------- Code checks ----------

const AMENITY_KEYS = new Set<string>(Amenity.options);
/** X-ray confidence a fact needs before it backs an amenity or a count. */
export const MIN_FACT_CONFIDENCE = 0.5;
const MAX_MANUAL_LINES = 10;
const MAX_CLAIMS = 6;
const MAX_MISSING = 8;

type Fact = XrayResult["facts"][number];

function truthy(value: Fact["value"]): boolean {
  if (typeof value === "string")
    return !/^(|false|no|none|0|not visible|unknown)$/i.test(value.trim());
  return value !== false && value !== 0;
}

function text(value: Fact["value"]): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

/**
 * Which X-ray facts can back each amenity. A fact backs it when it is sure enough and the
 * test passes on its value. Amenities not listed here fall back to a fact with the same key.
 */
const SUPPORT: Partial<Record<Amenity, { keys: string[]; test: (v: Fact["value"]) => boolean }>> = {
  dedicated_workspace: { keys: ["has_desk", "workspace"], test: truthy },
  kitchen: { keys: ["kitchen_equipment"], test: truthy },
  coffee_maker: { keys: ["kitchen_equipment"], test: (v) => /coffee|espresso/.test(text(v)) },
  dishwasher: { keys: ["kitchen_equipment"], test: (v) => text(v).includes("dishwasher") },
  free_parking: { keys: ["parking_visible"], test: truthy },
  street_parking: { keys: ["parking_visible"], test: truthy },
  balcony: { keys: ["outdoor_space"], test: (v) => text(v).includes("balcony") },
  terrace: { keys: ["outdoor_space"], test: (v) => text(v).includes("terrace") },
  garden: { keys: ["outdoor_space"], test: (v) => /garden|yard/.test(text(v)) },
  bbq_grill: { keys: ["outdoor_space"], test: (v) => /bbq|grill|barbecue/.test(text(v)) },
  mountain_view: { keys: ["view_type"], test: (v) => text(v).includes("mountain") },
  sea_view: { keys: ["view_type"], test: (v) => /\bsea\b|ocean/.test(text(v)) },
  city_view: { keys: ["view_type"], test: (v) => /city|skyline/.test(text(v)) },
};

/** The fact key that shows this amenity in the photos, or null. */
export function amenityFact(amenity: Amenity, facts: XrayResult | null): string | null {
  if (!facts) return null;
  const rule = SUPPORT[amenity] ?? { keys: [amenity], test: truthy };
  const fact = facts.facts.find(
    (f) => rule.keys.includes(f.key) && f.confidence >= MIN_FACT_CONFIDENCE && rule.test(f.value),
  );
  return fact?.key ?? null;
}

/** Keeps only words from the shared Amenity list (case and spaces forgiven), once each. */
export function filterAmenities(words: string[]): { kept: Amenity[]; dropped: string[] } {
  const kept: Amenity[] = [];
  const dropped: string[] = [];
  for (const word of words) {
    const key = word
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (AMENITY_KEYS.has(key)) {
      if (!kept.includes(key as Amenity)) kept.push(key as Amenity);
    } else if (word.trim()) dropped.push(word.trim());
  }
  return { kept, dropped };
}

export function markAmenities(keys: Amenity[], facts: XrayResult | null): DraftAmenity[] {
  return keys.map((key) => {
    const factKey = amenityFact(key, facts);
    return { key, source: factKey ? "photos" : "narration", factKey };
  });
}

const RANGES: Record<CountField, { min: number; max: number; step: number }> = {
  max_guests: { min: 1, max: 16, step: 1 },
  bedrooms: { min: 0, max: 10, step: 1 },
  beds: { min: 0, max: 20, step: 1 },
  baths: { min: 0, max: 10, step: 0.5 },
};

/** A count the listing can hold, or null with a note when it is missing or out of range. */
export function saneCount(field: CountField, value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const { min, max, step } = RANGES[field];
  const rounded = Math.round(value / step) * step;
  return rounded < min || rounded > max ? null : rounded;
}

function factNumber(facts: XrayResult | null, key: string): number | null {
  const fact = facts?.facts.find((f) => f.key === key && f.confidence >= MIN_FACT_CONFIDENCE);
  return typeof fact?.value === "number" ? fact.value : null;
}

function cleanLines(lines: string[], max: number, maxLength = 200): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim().slice(0, maxLength);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, max);
}

function cleanTime(value: string | null): string | undefined {
  const t = value?.trim();
  return t ? t.slice(0, 20) : undefined;
}

/** Turns the model's draft into what the dashboard shows. Pure. */
export function cleanDraft(raw: DraftOutput, facts: XrayResult | null): ListingDraft {
  const numberNotes: ListingDraft["numberNotes"] = [];
  const counts = {} as Record<CountField, number | null>;
  for (const field of Object.keys(RANGES) as CountField[]) {
    counts[field] = saneCount(field, raw[field]);
    if (raw[field] !== null && counts[field] === null)
      numberNotes.push({ field, note: `${raw[field]} is not a number this home can list` });
  }
  const bedsSeen = factNumber(facts, "beds_counted");
  if (counts.beds !== null && bedsSeen !== null && counts.beds > bedsSeen)
    numberNotes.push({
      field: "beds",
      note: `The photos show ${bedsSeen} bed${bedsSeen === 1 ? "" : "s"}`,
    });
  // A bed sleeps two at most, so more guests than that needs a bed the photos don't show.
  // (sleeping_spots is not used: the X-ray counts it unevenly between runs.)
  if (counts.max_guests !== null && bedsSeen !== null && counts.max_guests > bedsSeen * 2)
    numberNotes.push({
      field: "max_guests",
      note: `The photos show beds for at most ${bedsSeen * 2}`,
    });

  const { kept, dropped } = filterAmenities(raw.amenities);
  const amenities = markAmenities(kept, facts);

  const house_rules: HouseRules = {};
  if (raw.pets_allowed !== null) house_rules.pets = raw.pets_allowed;
  if (raw.smoking_allowed !== null) house_rules.smoking = raw.smoking_allowed;
  if (raw.parties_allowed !== null) house_rules.parties = raw.parties_allowed;
  const quiet = cleanTime(raw.quiet_hours);
  if (quiet) house_rules.quiet_hours = quiet;
  const checkIn = cleanTime(raw.check_in_after);
  if (checkIn) house_rules.check_in_after = checkIn;
  const checkOut = cleanTime(raw.check_out_before);
  if (checkOut) house_rules.check_out_before = checkOut;

  // One line per missing thing: skip an amenity the X-ray already asks a photo of.
  const xrayMissing = facts?.missing_photos ?? [];
  const missingPhotos = cleanLines(
    [
      ...amenities
        .filter((a) => a.source === "narration")
        .map((a) => a.key.replace(/_/g, " "))
        .filter((name) => !xrayMissing.some((line) => line.toLowerCase().includes(name)))
        .map((name) => `A photo of the ${name}`),
      ...xrayMissing,
    ],
    MAX_MISSING,
  );

  return {
    title: raw.title.trim().slice(0, 80),
    description: raw.description.trim().slice(0, 1200),
    property_type: raw.property_type.trim().toLowerCase().slice(0, 30) || "apartment",
    ...counts,
    amenities,
    droppedAmenities: dropped,
    house_rules,
    house_manual: cleanLines(raw.house_manual, MAX_MANUAL_LINES),
    unsupportedClaims: cleanLines(raw.unsupported_claims, MAX_CLAIMS, 140),
    numberNotes,
    missingPhotos,
  };
}

// ---------- Applying a draft (host only) ----------

/** The fields the host may save from a draft. Counts, rules and the manual stay a preview. */
export const ApplyDraftSchema = z.object({
  listingId: z.uuid(),
  title: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().min(20).max(1200).optional(),
  amenities: z.array(Amenity).max(Amenity.options.length).optional(),
});
export type ApplyDraft = z.infer<typeof ApplyDraftSchema>;

/** "title", "title and amenities", "title, description and amenities". */
export function appliedFieldsLabel(fields: string[]): string {
  if (fields.length <= 1) return fields[0] ?? "listing";
  return `${fields.slice(0, -1).join(", ")} and ${fields.at(-1)}`;
}

// ---------- The model call ----------

/** Only URLs in our own public storage, so the model never fetches anything else. */
export function isOurMediaUrl(url: string, base = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  const root = base?.replace(/\/$/, "");
  return !!root && url.startsWith(`${root}/storage/v1/object/public/`);
}

export interface DraftListingInput {
  hostName: string;
  listing: CurrentListing;
  narration: string;
  facts: XrayResult | null;
  /** Optional photo URLs from our own storage, at most four (vision costs time). */
  photoUrls?: string[];
  abortSignal?: AbortSignal;
}

/** What the model reads about the X-ray: facts and missing photos, no photo ids. */
function factsCard(facts: XrayResult | null) {
  if (!facts) return "not checked yet";
  return {
    facts: facts.facts.map((f) => ({ key: f.key, value: f.value, confidence: f.confidence })),
    missing_photos: facts.missing_photos,
  };
}

/** Drafts a listing from the narration with Haiku 5.5, thinking off, then cleans it in code. */
export async function draftListing(input: DraftListingInput): Promise<ListingDraft> {
  const { listing } = input;
  const content: Exclude<ModelMessage, { role: "system" }>["content"] = [
    {
      type: "text",
      text: [
        asData("current listing", {
          title: listing.title,
          description: listing.description,
          property_type: listing.property_type,
          max_guests: listing.max_guests,
          bedrooms: listing.bedrooms,
          beds: listing.beds,
          baths: listing.baths,
          amenities: listing.amenities,
          house_rules: listing.house_rules,
        }),
        asData("xray facts", factsCard(input.facts)),
        asData("host narration", input.narration),
      ].join("\n\n"),
    },
    ...(input.photoUrls ?? []).slice(0, 4).map((url) => ({
      type: "file" as const,
      mediaType: "image",
      data: new URL(url),
    })),
  ];

  const result = await generateText({
    model: bulkModel(),
    system: loadPrompt("host-draft", {
      host_name: input.hostName,
      amenities: Amenity.options.join(", "),
    }),
    messages: [{ role: "user", content } as ModelMessage],
    output: Output.object({ schema: DraftOutputSchema }),
    providerOptions: { anthropic: { effort: "low", thinking: { type: "disabled" } } },
    abortSignal: input.abortSignal,
  });
  return cleanDraft(result.output, input.facts);
}
