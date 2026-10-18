/**
 * GH-24 Review claims (owner: Temuri): the pure half. Cleans Haiku's claims and matches each
 * to the nearest anchor of the published version by room and object name, with synonyms
 * ("workspace" finds the desk, "shower" finds the bathroom). Claims without a match stay
 * unpinned. No I/O here: tools/verifier/reviews.ts calls Claude and writes `review_claims`.
 */
import type { ClaimSentiment, ReviewClaimsResult } from "@/lib/schemas/verifier";
import { hasPhrase, normalize, roomKey, type RoomKey } from "@/lib/geometry/room-names";
import type { Anchor } from "@/lib/schemas/world";

export { normalize, roomKey, type RoomKey };

interface Concept {
  key: string;
  words: string[];
  /** The room this thing is in when the claim names no room ("shower" means the bathroom). */
  room?: RoomKey;
}

/** Things in a home and the words guests use for them. */
const CONCEPTS: Concept[] = [
  {
    key: "desk",
    words: [
      "desk",
      "workspace",
      "work space",
      "workstation",
      "work station",
      "home office",
      "office",
      "monitor",
      "ultrawide",
    ],
  },
  { key: "washer", words: ["washer", "washing machine", "laundry", "washer dryer"] },
  { key: "shower", words: ["shower", "walk in shower", "water pressure"], room: "bathroom" },
  { key: "bathtub", words: ["bathtub", "tub"], room: "bathroom" },
  { key: "bed", words: ["bed", "beds", "mattress", "double bed"], room: "bedroom" },
  { key: "sofa", words: ["sofa", "couch", "sofa bed"] },
  { key: "tv", words: ["tv", "television", "smart tv"] },
  {
    key: "cooktop",
    words: ["cooktop", "stove", "hob", "oven", "burner", "burners"],
    room: "kitchen",
  },
  {
    key: "kitchen gear",
    words: [
      "pans",
      "pots",
      "cookware",
      "utensils",
      "coffee",
      "coffee corner",
      "coffee machine",
      "kettle",
      "fridge",
      "dishwasher",
    ],
    room: "kitchen",
  },
  { key: "table", words: ["dining table", "table"] },
  { key: "wardrobe", words: ["wardrobe", "closet"] },
  { key: "window", words: ["window", "windows"] },
  { key: "fireplace", words: ["fireplace"] },
  { key: "wall art", words: ["photo frames", "frames", "pictures", "paintings"] },
];

/** Words too common to match two names on their own. */
const STOPWORDS = new Set([
  "the",
  "with",
  "and",
  "for",
  "from",
  "that",
  "this",
  "very",
  "room",
  "wall",
  "big",
  "small",
  "little",
  "nice",
  "good",
  "great",
]);

/** The things a text names ("desk with ultrawide monitor" -> {desk}). */
export function concepts(text: string | null | undefined): Set<string> {
  const found = new Set<string>();
  if (!text) return found;
  const n = normalize(text);
  for (const c of CONCEPTS) if (c.words.some((w) => hasPhrase(n, w))) found.add(c.key);
  return found;
}

function impliedRoom(keys: Set<string>): RoomKey | null {
  for (const c of CONCEPTS) if (c.room && keys.has(c.key)) return c.room;
  return null;
}

function contentWords(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      // Room words place a claim, they do not name a thing ("kitchen" is not the kitchen wall).
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && roomKey(w) === null),
  );
}

export type MatchAnchor = Pick<Anchor, "id" | "name" | "kind" | "room">;

export interface ClaimTarget {
  room: string | null;
  object: string | null;
}

export interface ClaimMatch<A extends MatchAnchor> {
  anchor: A | null;
  /** The room to store: the matched anchor's room, else the claim's own room word. */
  room: string | null;
}

function anchorRoomKey(a: MatchAnchor): RoomKey | null {
  return roomKey(a.room) ?? (a.kind === "room" ? roomKey(a.name) : null);
}

/**
 * The nearest anchor for a claim: an object anchor that names the same thing (in the same
 * room when the claim names or implies one), else the room's own anchor, else none.
 */
export function matchClaim<A extends MatchAnchor>(
  target: ClaimTarget,
  anchors: A[],
): ClaimMatch<A> {
  const wanted = concepts(target.object);
  const room =
    roomKey(target.room) ??
    impliedRoom(wanted) ??
    (wanted.size === 0 ? roomKey(target.object) : null);
  const inRoom = (a: A) => {
    const k = anchorRoomKey(a);
    return room === null || k === null || k === room;
  };
  const things = anchors.filter((a) => a.kind !== "room" && inRoom(a));

  let best: { anchor: A; score: number } | null = null;
  if (target.object) {
    const words = contentWords(target.object);
    for (const a of things) {
      const have = concepts(a.name);
      const shared = [...wanted].filter((k) => have.has(k)).length;
      const sharedWords = [...contentWords(a.name)].filter((w) => words.has(w)).length;
      if (shared === 0 && sharedWords === 0) continue;
      let score = shared * 10 + sharedWords * 3 - (have.size - shared);
      if (room !== null && anchorRoomKey(a) === room) score += 5;
      // "bedroom TV" is not the living-room TV: a room word in the name must agree.
      const named = roomKey(a.name);
      if (named !== null && named !== room) score -= 4;
      if (!best || score > best.score) best = { anchor: a, score };
    }
  }
  if (best) return { anchor: best.anchor, room: best.anchor.room ?? target.room };

  if (room !== null) {
    const roomAnchor = anchors.find((a) => a.kind === "room" && anchorRoomKey(a) === room);
    if (roomAnchor) return { anchor: roomAnchor, room: roomAnchor.room ?? roomAnchor.name };
  }
  return { anchor: null, room: target.room };
}

// ---------- Cleaning Haiku's output ----------

export const MAX_CLAIM_CHARS = 160;
export const MAX_CLAIMS_PER_REVIEW = 6;
const MAX_TARGET_CHARS = 60;

export interface CleanClaim {
  reviewId: string;
  claim: string;
  sentiment: ClaimSentiment;
  room: string | null;
  object: string | null;
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
}

function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function optional(text: string | null): string | null {
  if (text === null) return null;
  const t = tidy(text);
  if (!t || /^(none|null|n\/a|unknown|whole home|home)$/i.test(t)) return null;
  return cap(t, MAX_TARGET_CHARS);
}

/**
 * Checks Haiku's claims in code: known review labels only, tidy text, no empty or duplicate
 * claims, at most MAX_CLAIMS_PER_REVIEW per review. `labels` maps "r1" to the review's id.
 */
export function cleanClaims(raw: ReviewClaimsResult, labels: Map<string, string>): CleanClaim[] {
  const out: CleanClaim[] = [];
  const seen = new Set<string>();
  const perReview = new Map<string, number>();
  for (const c of raw.claims) {
    const reviewId = labels.get(c.review.trim().toLowerCase());
    if (!reviewId) continue;
    const claim = cap(tidy(c.claim), MAX_CLAIM_CHARS);
    if (claim.length < 3) continue;
    const key = `${reviewId}|${normalize(claim)}`;
    if (seen.has(key)) continue;
    const count = perReview.get(reviewId) ?? 0;
    if (count >= MAX_CLAIMS_PER_REVIEW) continue;
    seen.add(key);
    perReview.set(reviewId, count + 1);
    out.push({
      reviewId,
      claim,
      sentiment: c.sentiment,
      room: optional(c.room),
      object: optional(c.object),
    });
  }
  return out;
}
