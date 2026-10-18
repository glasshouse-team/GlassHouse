import { describe, expect, it } from "vitest";
import {
  candidateCard,
  cleanShortlist,
  resolveFactKey,
  sourceLabel,
  type Candidate,
  type ShortlistDraft,
} from "./facts";

function home(id: string, extra: Partial<Candidate["listing"]> = {}, withFacts = true): Candidate {
  return {
    listing: {
      id,
      slug: id,
      title: `Home ${id}`,
      city: "Kazbegi",
      neighborhood: null,
      property_type: "house",
      max_guests: 4,
      bedrooms: 2,
      beds: 3,
      baths: 1,
      base_price_cents: 12_000,
      weekend_price_cents: null,
      cleaning_fee_cents: 4_000,
      amenities: ["fireplace", "mountain_view", "dedicated_workspace"],
      house_rules: { pets: false },
      description: "Stone house under Mount Kazbek.",
      rating: 4.8,
      review_count: 5,
      ...extra,
    },
    facts: withFacts
      ? {
          facts: [
            { key: "desk_near_window", value: true, evidence: ["photo_04"], confidence: 0.9 },
          ],
          contradictions: [],
          missing_photos: ["bathroom"],
        }
      : null,
    photoUrl: null,
  };
}

const hero = home("hero-1");
const cabin = home("cabin", { amenities: ["fireplace"] }, false);
const known = new Map([
  [hero.listing.id, hero],
  [cabin.listing.id, cabin],
]);

describe("resolveFactKey", () => {
  it("accepts X-ray facts, listed amenities and citable fields that exist", () => {
    expect(resolveFactKey("fact:desk_near_window", hero)).toBe(true);
    expect(resolveFactKey("amenity:fireplace", hero)).toBe(true);
    expect(resolveFactKey("field:max_guests", hero)).toBe(true);
  });

  it("rejects invented amenities, unknown facts, private or empty fields and bad keys", () => {
    expect(resolveFactKey("amenity:hot_tub", hero)).toBe(false);
    expect(resolveFactKey("fact:sauna", hero)).toBe(false);
    expect(resolveFactKey("fact:desk_near_window", cabin)).toBe(false);
    expect(resolveFactKey("field:house_manual", hero)).toBe(false);
    expect(resolveFactKey("field:neighborhood", hero)).toBe(false);
    expect(resolveFactKey("field:", hero)).toBe(false);
    expect(resolveFactKey("photo:4", hero)).toBe(false);
  });

  it("won't let a reason cite a false or unsure fact, but a concern may", () => {
    const facts = {
      facts: [
        { key: "fireplace", value: false, evidence: ["photo_02"], confidence: 0.9 },
        { key: "view_type", value: "none", evidence: ["photo_05"], confidence: 0.8 },
        { key: "has_desk", value: true, evidence: ["photo_03"], confidence: 0.3 },
        { key: "beds_counted", value: 3, evidence: ["photo_06"], confidence: 0.9 },
      ],
      contradictions: [],
      missing_photos: [],
    };
    const checked = { ...hero, facts };
    expect(resolveFactKey("fact:fireplace", checked)).toBe(false);
    expect(resolveFactKey("fact:view_type", checked)).toBe(false);
    expect(resolveFactKey("fact:has_desk", checked)).toBe(false);
    expect(resolveFactKey("fact:beds_counted", checked)).toBe(true);
    expect(resolveFactKey("fact:fireplace", checked, "concern")).toBe(true);
  });

  it("labels the source for the chip", () => {
    expect(sourceLabel("fact:desk_near_window", hero)).toBe("Seen in photo 4");
    expect(sourceLabel("amenity:fireplace", hero)).toBe("Listed amenity");
    expect(sourceLabel("field:max_guests", hero)).toBe("Listing details");
  });
});

describe("cleanShortlist", () => {
  const draft: ShortlistDraft = {
    ranked: [
      {
        listingId: "cabin",
        score: 71.6,
        reasons: [
          { text: "Has a fireplace", factKey: "amenity:fireplace" },
          { text: "Has a hot tub", factKey: "amenity:hot_tub" },
        ],
        concerns: [{ text: "No desk", factKey: "amenity:dedicated_workspace" }],
        negotiationHint: null,
      },
      {
        listingId: "hero-1",
        score: 140,
        reasons: [
          { text: "Desk by the window", factKey: "fact:desk_near_window" },
          { text: "Fireplace", factKey: "amenity:fireplace" },
          { text: "Mountain view", factKey: "amenity:mountain_view" },
        ],
        concerns: [{ text: "Bathroom not shown", factKey: null }],
        negotiationHint: "Weekday stay: ask for $25 off",
      },
      {
        listingId: "made-up",
        score: 99,
        reasons: [{ text: "x", factKey: "field:title" }],
        concerns: [],
        negotiationHint: null,
      },
      {
        listingId: "cabin",
        score: 10,
        reasons: [{ text: "dup", factKey: "field:title" }],
        concerns: [],
        negotiationHint: null,
      },
    ],
    others: [
      { listingId: "made-up", why: "nope" },
      { listingId: "cabin", why: "already shown" },
    ],
    notes: ["Widened to Kazbegi + Tbilisi", " "],
  };

  it("keeps searched homes and cited reasons, best first, scores clamped", () => {
    const list = cleanShortlist(draft, known);
    expect(list.ranked.map((i) => [i.listingId, i.score])).toEqual([
      ["hero-1", 100],
      ["cabin", 72],
    ]);
    expect(list.ranked[0].reasons.map((r) => r.source)).toEqual([
      "Seen in photo 4",
      "Listed amenity",
      "Listed amenity",
    ]);
    expect(list.ranked[1].reasons.map((r) => r.text)).toEqual(["Has a fireplace"]);
  });

  it("keeps concerns, but drops a citation that doesn't resolve", () => {
    const cabinItem = cleanShortlist(draft, known).ranked[1];
    expect(cabinItem.concerns).toEqual([{ text: "No desk", factKey: null, source: null }]);
  });

  it("drops a home whose reasons all fail, and shown homes from 'others'", () => {
    const list = cleanShortlist(
      {
        ...draft,
        ranked: [
          { ...draft.ranked[0], reasons: [{ text: "Hot tub", factKey: "amenity:hot_tub" }] },
        ],
      },
      known,
    );
    expect(list.ranked).toEqual([]);
    expect(list.others).toEqual([{ listingId: "cabin", why: "already shown" }]);
    expect(cleanShortlist(draft, known).others).toEqual([]);
    expect(cleanShortlist(draft, known).notes).toEqual(["Widened to Kazbegi + Tbilisi"]);
  });
});

describe("candidateCard", () => {
  it("gives the model prices in dollars and the X-ray, never the house manual", () => {
    const card = candidateCard(hero);
    expect(card.price_per_night_usd).toBe(120);
    expect(card.xray).not.toBe("not checked yet");
    expect(candidateCard(cabin).xray).toBe("not checked yet");
    expect(JSON.stringify(card)).not.toContain("house_manual");
  });
});
