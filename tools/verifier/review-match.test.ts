import { describe, expect, it } from "vitest";
import {
  cleanClaims,
  concepts,
  matchClaim,
  MAX_CLAIM_CHARS,
  MAX_CLAIMS_PER_REVIEW,
  normalize,
  roomKey,
  type MatchAnchor,
} from "./review-match";

/** Hero 2's anchors of the published version (scripts/seed-anchors.ts + floor plan rooms). */
const anchors: MatchAnchor[] = [
  { id: "room-bath", name: "Bathroom", kind: "room", room: "Bathroom" },
  { id: "room-bed", name: "Bedroom", kind: "room", room: "Bedroom" },
  { id: "room-hall", name: "Entrance hall", kind: "room", room: "Entrance hall" },
  { id: "room-kitchen", name: "Kitchen", kind: "room", room: "Kitchen" },
  { id: "room-living", name: "Living room", kind: "room", room: "Living room" },
  { id: "frames", name: "kitchen wall with the photo frames", kind: "object", room: "Kitchen" },
  { id: "wardrobe", name: "wardrobe", kind: "object", room: "Entrance hall" },
  { id: "washer", name: "washing machine", kind: "object", room: "Bathroom" },
  { id: "desk", name: "desk with ultrawide monitor", kind: "object", room: "Living room" },
  { id: "sofa", name: "sofa", kind: "object", room: "Living room" },
  { id: "tv", name: "TV", kind: "object", room: "Living room" },
  { id: "bed", name: "bed", kind: "object", room: "Bedroom" },
  { id: "bed-tv", name: "bedroom TV", kind: "object", room: "Bedroom" },
  { id: "table", name: "dining table", kind: "object", room: "Kitchen" },
  { id: "cooktop", name: "cooktop", kind: "object", room: "Kitchen" },
];

const match = (room: string | null, object: string | null) =>
  matchClaim({ room, object }, anchors).anchor?.id ?? null;

describe("normalize, roomKey and concepts", () => {
  it("lowercases and drops punctuation", () => {
    expect(normalize("  Walk-in SHOWER!! ")).toBe("walk in shower");
  });

  it("finds the room a text names, longest phrase first", () => {
    expect(roomKey("Entrance hall")).toBe("entrance");
    expect(roomKey("the small bedroom")).toBe("bedroom");
    expect(roomKey("Living room")).toBe("living");
    expect(roomKey("WC")).toBe("bathroom");
    expect(roomKey("desk")).toBeNull();
    expect(roomKey(null)).toBeNull();
  });

  it("matches whole words only (bed is not bedroom)", () => {
    expect([...concepts("bedroom TV")]).toEqual(["tv"]);
    expect([...concepts("desk with ultrawide monitor")]).toEqual(["desk"]);
    expect(concepts("a big bed").has("bed")).toBe(true);
  });
});

describe("matchClaim", () => {
  it("matches synonyms to object anchors", () => {
    expect(match(null, "workspace")).toBe("desk");
    expect(match("Living room", "desk")).toBe("desk");
    expect(match(null, "ultrawide monitor")).toBe("desk");
    expect(match(null, "washer")).toBe("washer");
    expect(match(null, "laundry")).toBe("washer");
    expect(match(null, "couch")).toBe("sofa");
    expect(match(null, "stove")).toBe("cooktop");
    expect(match(null, "closet")).toBe("wardrobe");
    expect(match(null, "photo frames")).toBe("frames");
  });

  it("falls back to the room a thing implies (shower -> bathroom, pans -> kitchen)", () => {
    expect(match(null, "walk-in shower")).toBe("room-bath");
    expect(match("Bathroom", "shower")).toBe("room-bath");
    expect(match(null, "pans")).toBe("room-kitchen");
    expect(match("kitchen", "coffee corner")).toBe("room-kitchen");
  });

  it("prefers the object in the named room (TV vs bedroom TV)", () => {
    expect(match("Living room", "TV")).toBe("tv");
    expect(match("Bedroom", "TV")).toBe("bed-tv");
    expect(match(null, "television")).toBe("tv");
    expect(match(null, "bed")).toBe("bed");
  });

  it("does not pin a thing to the same thing in another room", () => {
    expect(match("Bedroom", "desk")).toBe("room-bed");
    expect(match("Kitchen", "sofa")).toBe("room-kitchen");
  });

  it("pins room-only claims to the room anchor", () => {
    expect(match("bathroom", null)).toBe("room-bath");
    expect(match("hallway", null)).toBe("room-hall");
    expect(match(null, "kitchen")).toBe("room-kitchen");
    expect(match("Kitchen", "kitchen")).toBe("room-kitchen");
  });

  it("keeps claims about the area, the host or unknown things unpinned", () => {
    expect(match(null, null)).toBeNull();
    expect(match(null, "internet")).toBeNull();
    expect(match("garden", null)).toBeNull();
    expect(match("Balcony", null)).toBeNull();
  });

  it("returns the anchor's room, else the claim's own room word", () => {
    expect(matchClaim({ room: null, object: "desk" }, anchors).room).toBe("Living room");
    expect(matchClaim({ room: "garden", object: null }, anchors).room).toBe("garden");
  });

  it("works without anchors", () => {
    expect(matchClaim({ room: "Kitchen", object: "pans" }, [])).toEqual({
      anchor: null,
      room: "Kitchen",
    });
  });
});

describe("cleanClaims", () => {
  const labels = new Map([
    ["r1", "review-1"],
    ["r2", "review-2"],
  ]);
  const claim = (over: Partial<Parameters<typeof cleanClaims>[0]["claims"][number]> = {}) => ({
    review: "r1",
    claim: "the desk is great",
    sentiment: "positive" as const,
    room: "Living room",
    object: "desk",
    ...over,
  });

  it("maps labels to review ids and tidies text", () => {
    const out = cleanClaims(
      { claims: [claim({ review: " R2 ", claim: '  "the   walk-in shower is great" ' })] },
      labels,
    );
    expect(out).toEqual([
      {
        reviewId: "review-2",
        claim: "the walk-in shower is great",
        sentiment: "positive",
        room: "Living room",
        object: "desk",
      },
    ]);
  });

  it("drops unknown reviews, empty and duplicate claims", () => {
    const out = cleanClaims(
      {
        claims: [
          claim({ review: "r9" }),
          claim({ claim: "  " }),
          claim({ claim: "ok" }),
          claim(),
          claim({ claim: "The desk is GREAT." }),
        ],
      },
      labels,
    );
    expect(out.map((c) => c.claim)).toEqual(["the desk is great"]);
  });

  it("turns empty or placeholder targets into null", () => {
    const [out] = cleanClaims({ claims: [claim({ room: " none ", object: "" })] }, labels);
    expect(out.room).toBeNull();
    expect(out.object).toBeNull();
  });

  it("caps long claims at a word and the number of claims per review", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const many = Array.from({ length: 10 }, (_, i) => claim({ claim: `claim number ${i}` }));
    const out = cleanClaims({ claims: [claim({ review: "r2", claim: long }), ...many] }, labels);
    expect(out[0].claim.length).toBeLessThanOrEqual(MAX_CLAIM_CHARS);
    expect(out[0].claim.endsWith("…")).toBe(true);
    expect(out[0].claim).not.toMatch(/word\d*\s…$/);
    expect(out.filter((c) => c.reviewId === "review-1")).toHaveLength(MAX_CLAIMS_PER_REVIEW);
  });
});
