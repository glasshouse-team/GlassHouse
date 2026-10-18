/**
 * GH-23 check-in comparison (owner: Beka). The neutral Verifier gets the listing's claims, its
 * X-ray facts, up to 8 listing photos labelled by room and up to 8 arrival frames, and reports
 * matches, differences and missing items. Prompt: agents/prompts/checkin.md (not a verifier-*
 * prompt, those are Temuri's). Photo download and room tags reuse tools/verifier/xray.ts read-only.
 */
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { asData } from "@/agents/data";
import { loadPrompt } from "@/agents/load-prompt";
import { cleanReport, frameIds, type PhotoRef } from "@/lib/checkin";
import { CheckinReportSchema, type CheckinReport } from "@/lib/schemas/checkin";
import { roomTag } from "@/tools/verifier/xray";

export interface ListingClaims {
  title: string;
  amenities: unknown;
  property_type: string;
  max_guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
}

export interface CompareInput {
  model: LanguageModel;
  listing: ListingClaims;
  facts: unknown[];
  photos: { label: string; photo: PhotoRef }[];
  /** JPEGs in the same order as `photos`. */
  photoImages: Buffer[];
  /** Arrival frames (JPEG), labelled frame_01.. in this order. */
  frames: Buffer[];
}

export interface CompareResult {
  report: CheckinReport;
  frameIds: string[];
  usage: { inputTokens: number; outputTokens: number };
}

/** Decodes a browser JPEG data URL; null when it is not a JPEG. */
export function decodeFrame(dataUrl: string): Buffer | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const buffer = Buffer.from(dataUrl.slice(comma + 1), "base64");
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 ? buffer : null;
}

/** The user message: listing and facts as data, then labelled photos, then labelled frames. */
export function buildContent(input: Omit<CompareInput, "model">) {
  const ids = frameIds(input.frames.length);
  return [
    { type: "text" as const, text: asData("listing", input.listing) },
    { type: "text" as const, text: asData("xray_facts", input.facts) },
    { type: "text" as const, text: "Listing photos:" },
    ...input.photos.flatMap(({ label, photo }, i) => [
      { type: "text" as const, text: roomTag(label, photo.room_label) },
      { type: "file" as const, mediaType: "image/jpeg", data: input.photoImages[i] },
    ]),
    { type: "text" as const, text: "Arrival frames:" },
    ...input.frames.flatMap((frame, i) => [
      { type: "text" as const, text: `${ids[i]}:` },
      { type: "file" as const, mediaType: "image/jpeg", data: frame },
    ]),
  ];
}

/** One structured-output call, retried once when the answer does not fit the schema. */
export async function compareArrival(input: CompareInput): Promise<CompareResult> {
  const content = buildContent(input);
  const ids = frameIds(input.frames.length);
  const usage = { inputTokens: 0, outputTokens: 0 };
  const add = (u: { inputTokens?: number; outputTokens?: number }) => {
    usage.inputTokens += u.inputTokens ?? 0;
    usage.outputTokens += u.outputTokens ?? 0;
  };
  for (let attempt = 1; ; attempt++) {
    try {
      const { output, usage: used } = await generateText({
        model: input.model,
        output: Output.object({ schema: CheckinReportSchema }),
        system: loadPrompt("checkin"),
        messages: [{ role: "user", content }],
      });
      add(used);
      const report = cleanReport(
        output,
        ids,
        input.photos.map((p) => p.label),
      );
      return { report, frameIds: ids, usage };
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error) || attempt >= 2) throw error;
      add(error.usage ?? {});
    }
  }
}
