/**
 * The NDJSON lines POST /api/search streams to the brief box (GH-14): progress steps, then one
 * result (or a friendly message, or an error). Shared by the route and the client.
 */
import { z } from "zod";

const Cited = z.object({
  text: z.string(),
  factKey: z.string().nullable(),
  source: z.string().nullable(),
});

export const ResultCardSchema = z.object({
  listingId: z.string(),
  slug: z.string(),
  title: z.string(),
  city: z.string(),
  neighborhood: z.string().nullable(),
  priceCents: z.number(),
  rating: z.number().nullable(),
  reviewCount: z.number(),
  photoUrl: z.string().nullable(),
  score: z.number(),
  reasons: z.array(Cited),
  concerns: z.array(Cited),
  negotiationHint: z.string().nullable(),
});
export type ResultCard = z.infer<typeof ResultCardSchema>;

export const SearchLineSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), text: z.string() }),
  z.object({
    type: z.literal("result"),
    ms: z.number(),
    /** A question back to the guest when the brief can't be searched (no results then). */
    message: z.string().nullable(),
    briefLabel: z.string().nullable(),
    results: z.array(ResultCardSchema),
    others: z.array(z.object({ slug: z.string(), title: z.string(), why: z.string() })),
    notes: z.array(z.string()),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type SearchLine = z.infer<typeof SearchLineSchema>;

/** Splits streamed text into complete lines; returns the parsed lines and the leftover. */
export function readLines(buffer: string): { lines: SearchLine[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const lines = parts.flatMap((part) => {
    if (!part.trim()) return [];
    try {
      const parsed = SearchLineSchema.safeParse(JSON.parse(part));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
  return { lines, rest };
}
