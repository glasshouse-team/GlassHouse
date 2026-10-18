/**
 * Room words (GH-24, owner: Temuri): which room a text names, so "the small bedroom", the
 * anchor room "Bedroom" and a floor-plan label agree. Pure and browser-safe: used by the review
 * matcher (tools/verifier/review-match.ts) and the tour's review pins (components/tour).
 */

export type RoomKey =
  "living" | "bedroom" | "bathroom" | "kitchen" | "entrance" | "dining" | "balcony";

/** Words that name a room. Longest phrase wins ("entrance hall" before "hall"). */
const ROOM_WORDS: Record<RoomKey, string[]> = {
  living: ["living room", "living area", "living", "lounge", "sitting room", "salon"],
  bedroom: ["bedroom", "bedrooms", "bed room", "guest room", "sleeping room"],
  bathroom: ["bathroom", "bath room", "toilet", "wc", "restroom", "washroom", "shower room"],
  kitchen: ["kitchen", "kitchenette"],
  entrance: ["entrance hall", "entrance", "hallway", "hall", "entry", "foyer", "corridor"],
  dining: ["dining room", "dining area"],
  balcony: ["balcony", "terrace", "patio"],
};

/** Lowercase words separated by single spaces: "Walk-in shower!" -> "walk in shower". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when the normalized text holds the phrase as whole words ("bed" is not in "bedroom"). */
export function hasPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `);
}

/** The room a text names ("Entrance hall" -> entrance), or null. */
export function roomKey(text: string | null | undefined): RoomKey | null {
  if (!text) return null;
  const n = normalize(text);
  let best: { key: RoomKey; len: number } | null = null;
  for (const [key, words] of Object.entries(ROOM_WORDS) as [RoomKey, string[]][]) {
    for (const w of words) {
      if (hasPhrase(n, w) && (!best || w.length > best.len)) best = { key, len: w.length };
    }
  }
  return best?.key ?? null;
}
