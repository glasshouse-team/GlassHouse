/**
 * GH-9 Listing X-ray (owner: Temuri). The neutral Verifier reads a listing's photos and text and
 * reports facts with evidence, contradictions and missing photos into `listing_facts`.
 * Used by POST /api/xray/[listingId] and `pnpm xray`. See .claude/skills/verifier-vision.
 */
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import sharp from "sharp";
import { asData } from "@/agents/data";
import { loadPrompt } from "@/agents/load-prompt";
import { agentModel, bulkModel } from "@/lib/claude";
import type { Tables } from "@/lib/database.types";
import { settings } from "@/lib/env";
import { KNOWN_FACT_KEYS, XrayResultSchema, type XrayResult } from "@/lib/schemas/verifier";
import { supabaseAdmin } from "@/lib/supabase";
import { withEvent } from "@/tools/_withEvent";

/** Claude takes about 20 images per call; the X-ray never batches. */
export const MAX_PHOTOS = 20;
const IMAGE_PX = 1024;

export type XrayModel = "bulk" | "agent";
type Listing = Tables<"listings">;
type Photo = Pick<Tables<"listing_photos">, "id" | "url" | "room_label" | "sort">;

export interface LabeledPhoto {
  /** The id Claude sees and cites, e.g. "photo_04". */
  label: string;
  photo: Photo;
}

export interface XrayUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface XrayRun {
  listingId: string;
  model: string;
  photoCount: number;
  /** Evidence holds `listing_photos.id` values, not photo labels. */
  result: XrayResult;
  usage: XrayUsage;
}

/** Up to 20 photos in (sort, id) order, labelled photo_01, photo_02 ... */
export function labelPhotos(photos: Photo[]): LabeledPhoto[] {
  return [...photos]
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .slice(0, MAX_PHOTOS)
    .map((photo, i) => ({ label: `photo_${String(i + 1).padStart(2, "0")}`, photo }));
}

/** The host's claims, sent to Claude as JSON data in the user message (never in the system prompt). */
export function listingClaims(listing: Listing) {
  return {
    title: listing.title,
    description: listing.description,
    amenities: listing.amenities,
    property_type: listing.property_type,
    max_guests: listing.max_guests,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    baths: listing.baths,
    house_rules: listing.house_rules,
  };
}

/**
 * The rules the schema cannot hold: evidence maps from labels to photo ids (unknown labels
 * dropped), facts without evidence are dropped, one fact per key (the most confident wins),
 * confidence is clamped to 0..1, and empty or repeated missing-photo entries go.
 */
export function cleanResult(raw: XrayResult, labeled: LabeledPhoto[]): XrayResult {
  const ids = new Map(labeled.map(({ label, photo }) => [label.toLowerCase(), photo.id]));
  const toIds = (evidence: string[]) => [
    ...new Set(evidence.flatMap((e) => ids.get(e.trim().toLowerCase()) ?? [])),
  ];

  const facts = new Map<string, XrayResult["facts"][number]>();
  for (const fact of raw.facts) {
    const key = fact.key.trim();
    const evidence = toIds(fact.evidence);
    if (!key || evidence.length === 0) continue;
    const confidence = Math.min(1, Math.max(0, fact.confidence));
    const kept = facts.get(key);
    if (!kept || confidence > kept.confidence)
      facts.set(key, { ...fact, key, evidence, confidence });
  }

  return {
    facts: [...facts.values()],
    contradictions: raw.contradictions
      .filter((c) => c.claim.trim() && c.finding.trim())
      .map((c) => ({ ...c, evidence: toIds(c.evidence) })),
    missing_photos: [...new Set(raw.missing_photos.map((m) => m.trim()).filter(Boolean))],
  };
}

/** Fetches a photo and shrinks it to 1024 px on the long side, JPEG quality 80. */
export async function prepareImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch photo ${url}: ${response.status}`);
  return sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize({ width: IMAGE_PX, height: IMAGE_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** "photo_04 (living room):". The room comes from the host's file name: letters, digits, spaces only. */
export function roomTag(label: string, room: string | null): string {
  const clean = room
    ?.replace(/[^\p{L}\p{N} -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return clean ? `${label} (${clean}):` : `${label}:`;
}

function addUsage(total: XrayUsage, usage: { inputTokens?: number; outputTokens?: number }) {
  total.inputTokens += usage.inputTokens ?? 0;
  total.outputTokens += usage.outputTokens ?? 0;
}

/** One structured-output call, retried once when the answer does not fit the schema. */
export async function askVerifier(
  model: LanguageModel,
  listing: Listing,
  labeled: LabeledPhoto[],
  images: Buffer[],
): Promise<{ raw: XrayResult; usage: XrayUsage }> {
  const content = [
    { type: "text" as const, text: asData("listing", listingClaims(listing)) },
    ...labeled.flatMap(({ label, photo }, i) => [
      {
        type: "text" as const,
        text: roomTag(label, photo.room_label),
      },
      { type: "file" as const, mediaType: "image/jpeg", data: images[i] },
    ]),
  ];
  const usage: XrayUsage = { inputTokens: 0, outputTokens: 0 };
  for (let attempt = 1; ; attempt++) {
    try {
      const { output, usage: used } = await generateText({
        model,
        output: Output.object({ schema: XrayResultSchema }),
        system: loadPrompt("verifier-xray", { fact_keys: KNOWN_FACT_KEYS.join(", ") }),
        messages: [{ role: "user", content }],
      });
      addUsage(usage, used);
      return { raw: output, usage };
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error) || attempt >= 2) throw error;
      addUsage(usage, error.usage ?? {});
    }
  }
}

/** Hero homes get Sonnet, every other listing Haiku (GH-9). */
export function defaultModel(listing: Pick<Listing, "slug">): XrayModel {
  return listing.slug.startsWith("hero-") ? "agent" : "bulk";
}

export interface XrayOptions {
  model?: XrayModel;
  /** false: return the result without writing `listing_facts` (`pnpm xray --runs`). */
  save?: boolean;
}

/** The X-ray without a feed line; `runXray` below logs one. Eval runs (`pnpm xray --runs 3`) use this. */
export async function xrayListing(listingId: string, options: XrayOptions = {}): Promise<XrayRun> {
  const db = supabaseAdmin();
  const [{ data: listing, error }, { data: photos, error: photoError }] = await Promise.all([
    db.from("listings").select("*").eq("id", listingId).maybeSingle(),
    db.from("listing_photos").select("id, url, room_label, sort").eq("listing_id", listingId),
  ]);
  if (error || photoError)
    throw new Error(`Could not load listing ${listingId}: ${(error ?? photoError)!.message}`);
  if (!listing) throw new Error(`Listing ${listingId} not found`);

  const labeled = labelPhotos(photos ?? []);
  if (labeled.length === 0) throw new Error(`Listing ${listing.slug} has no photos to check`);
  const images = await Promise.all(labeled.map(({ photo }) => prepareImage(photo.url)));

  const kind = options.model ?? defaultModel(listing);
  const modelId = kind === "agent" ? settings.agentModel : settings.bulkModel;
  const { raw, usage } = await askVerifier(
    kind === "agent" ? agentModel() : bulkModel(),
    listing,
    labeled,
    images,
  );
  const result = cleanResult(raw, labeled);

  if (options.save !== false) {
    const { error: saveError } = await db.from("listing_facts").upsert(
      {
        listing_id: listingId,
        facts: result.facts,
        contradictions: result.contradictions,
        missing_photos: result.missing_photos,
        model: modelId,
        created_at: new Date().toISOString(),
      },
      { onConflict: "listing_id" },
    );
    if (saveError) throw new Error(`Could not save listing_facts: ${saveError.message}`);
  }
  return { listingId, model: modelId, photoCount: labeled.length, result, usage };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The X-ray with one feed line: "Verifier checked 18 photos: 1 contradiction found". */
export const runXray = withEvent<[listingId: string, options?: XrayOptions], XrayRun>(
  {
    action: "xray.run",
    actorName: "Verifier",
    agent: "verifier",
    scope: (listingId: string) => ({ listingId }),
    summarize: (run: XrayRun) =>
      `Verifier checked ${plural(run.photoCount, "photo")}: ${
        run.result.contradictions.length === 0
          ? "no contradictions found"
          : `${plural(run.result.contradictions.length, "contradiction")} found`
      }`,
    payload: (run: XrayRun) => ({
      model: run.model,
      facts: run.result.facts.length,
      contradictions: run.result.contradictions.map((c) => c.claim),
      missing_photos: run.result.missing_photos,
      usage: run.usage,
    }),
  },
  xrayListing,
);
