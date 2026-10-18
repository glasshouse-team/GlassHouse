import { describe, expect, it } from "vitest";
import type { XrayResult } from "@/lib/schemas/verifier";
import {
  amenityFact,
  appliedFieldsLabel,
  ApplyDraftSchema,
  cleanDraft,
  filterAmenities,
  isOurMediaUrl,
  markAmenities,
  saneCount,
  type DraftOutput,
} from "./draft";

// Shaped like hero-2's real X-ray (GH-9).
const facts: XrayResult = {
  facts: [
    { key: "beds_counted", value: 1, evidence: ["p1"], confidence: 0.85 },
    { key: "sleeping_spots", value: 2, evidence: ["p1"], confidence: 0.6 },
    { key: "has_desk", value: true, evidence: ["p2"], confidence: 0.95 },
    { key: "tv", value: true, evidence: ["p3"], confidence: 0.95 },
    { key: "washer", value: true, evidence: ["p4"], confidence: 0.95 },
    {
      key: "kitchen_equipment",
      value: "gas hob, fridge, dishwasher, kettle",
      evidence: ["p5"],
      confidence: 0.85,
    },
    { key: "fireplace", value: false, evidence: ["p3"], confidence: 0.4 },
    {
      key: "view_type",
      value: "courtyard, neighbouring buildings",
      evidence: ["p6"],
      confidence: 0.9,
    },
    { key: "parking_visible", value: true, evidence: ["p7"], confidence: 0.3 },
  ],
  contradictions: [],
  missing_photos: ["Bathroom sink and vanity", "Wifi router (wifi is listed as an amenity)"],
};

const raw: DraftOutput = {
  title: "  Bright Vake flat with a real desk  ",
  description: "A calm one-bedroom with an ultrawide monitor desk and a sea view.",
  property_type: "Apartment",
  max_guests: 4,
  bedrooms: 1,
  beds: 2,
  baths: 1.2,
  amenities: [
    "wifi",
    "TV",
    "dedicated workspace",
    "sea_view",
    "hair_dryer",
    "Dishwasher",
    "tv",
    "sofa bed",
  ],
  pets_allowed: false,
  smoking_allowed: null,
  parties_allowed: false,
  quiet_hours: " 23:00-08:00 ",
  check_in_after: null,
  check_out_before: "",
  house_manual: [
    "Trash goes out on Tuesdays",
    "trash goes out on tuesdays",
    "  ",
    "Heating switch is in the hall",
  ],
  unsupported_claims: ["sea view", ""],
};

describe("filterAmenities", () => {
  it("keeps only shared amenity keys, once each, forgiving case and spaces", () => {
    expect(filterAmenities(raw.amenities)).toEqual({
      kept: ["wifi", "tv", "dedicated_workspace", "sea_view", "dishwasher"],
      dropped: ["hair_dryer", "sofa bed"],
    });
  });
});

describe("amenityFact", () => {
  it("backs an amenity with a sure, true X-ray fact", () => {
    expect(amenityFact("tv", facts)).toBe("tv");
    expect(amenityFact("dedicated_workspace", facts)).toBe("has_desk");
    expect(amenityFact("dishwasher", facts)).toBe("kitchen_equipment");
    expect(amenityFact("kitchen", facts)).toBe("kitchen_equipment");
  });

  it("does not back it with a false, unsure or unrelated fact", () => {
    expect(amenityFact("fireplace", facts)).toBeNull(); // false and unsure
    expect(amenityFact("free_parking", facts)).toBeNull(); // confidence 0.3
    expect(amenityFact("sea_view", facts)).toBeNull(); // courtyard view
    expect(amenityFact("coffee_maker", facts)).toBeNull(); // not in the kitchen list
    expect(amenityFact("wifi", facts)).toBeNull();
    expect(amenityFact("tv", null)).toBeNull();
  });
});

describe("markAmenities", () => {
  it("marks each amenity seen in photos or from narration only", () => {
    expect(markAmenities(["tv", "sea_view"], facts)).toEqual([
      { key: "tv", source: "photos", factKey: "tv" },
      { key: "sea_view", source: "narration", factKey: null },
    ]);
  });
});

describe("saneCount", () => {
  it("rounds to the field's step and refuses values out of range", () => {
    expect(saneCount("max_guests", 4)).toBe(4);
    expect(saneCount("max_guests", 0)).toBeNull();
    expect(saneCount("max_guests", 40)).toBeNull();
    expect(saneCount("bedrooms", 1.4)).toBe(1);
    expect(saneCount("baths", 1.2)).toBe(1);
    expect(saneCount("baths", 1.6)).toBe(1.5);
    expect(saneCount("beds", -1)).toBeNull();
    expect(saneCount("beds", null)).toBeNull();
    expect(saneCount("beds", Number.NaN)).toBeNull();
  });
});

describe("cleanDraft", () => {
  const draft = cleanDraft(raw, facts);

  it("trims text and keeps sane counts", () => {
    expect(draft.title).toBe("Bright Vake flat with a real desk");
    expect(draft.property_type).toBe("apartment");
    expect(draft).toMatchObject({ max_guests: 4, bedrooms: 1, beds: 2, baths: 1 });
  });

  it("flags counts the photos contradict", () => {
    expect(draft.numberNotes).toEqual([
      { field: "beds", note: "The photos show 1 bed" },
      { field: "max_guests", note: "The photos show beds for at most 2" },
    ]);
  });

  it("notes a count that is out of range instead of keeping it", () => {
    const wild = cleanDraft({ ...raw, max_guests: 99 }, null);
    expect(wild.max_guests).toBeNull();
    expect(wild.numberNotes).toEqual([
      { field: "max_guests", note: "99 is not a number this home can list" },
    ]);
  });

  it("marks amenity support and lists the dropped words", () => {
    expect(draft.amenities.map((a) => [a.key, a.source])).toEqual([
      ["wifi", "narration"],
      ["tv", "photos"],
      ["dedicated_workspace", "photos"],
      ["sea_view", "narration"],
      ["dishwasher", "photos"],
    ]);
    expect(draft.droppedAmenities).toEqual(["hair_dryer", "sofa bed"]);
  });

  it("keeps only the house rules the host stated", () => {
    expect(draft.house_rules).toEqual({ pets: false, parties: false, quiet_hours: "23:00-08:00" });
  });

  it("dedupes manual lines and claims, and asks for photos of narration-only amenities", () => {
    expect(draft.house_manual).toEqual([
      "Trash goes out on Tuesdays",
      "Heating switch is in the hall",
    ]);
    expect(draft.unsupportedClaims).toEqual(["sea view"]);
    expect(draft.missingPhotos).toEqual([
      "A photo of the sea view",
      "Bathroom sink and vanity",
      "Wifi router (wifi is listed as an amenity)",
    ]);
  });

  it("works without an X-ray: every amenity is from narration only", () => {
    const bare = cleanDraft(raw, null);
    expect(bare.amenities.every((a) => a.source === "narration")).toBe(true);
    expect(bare.numberNotes).toEqual([]);
  });
});

describe("isOurMediaUrl", () => {
  const base = "https://abc.supabase.co/";
  it("accepts only our public storage", () => {
    expect(
      isOurMediaUrl("https://abc.supabase.co/storage/v1/object/public/media/a.jpg", base),
    ).toBe(true);
    expect(isOurMediaUrl("https://evil.example/storage/v1/object/public/media/a.jpg", base)).toBe(
      false,
    );
    expect(
      isOurMediaUrl("https://abc.supabase.co/storage/v1/object/sign/captures/a.mp4", base),
    ).toBe(false);
    expect(isOurMediaUrl("https://abc.supabase.co/x", undefined)).toBe(false);
    expect(
      isOurMediaUrl("https://abc.supabase.co/storage/v1/object/public/../../../auth/v1/user", base),
    ).toBe(false);
    expect(isOurMediaUrl("not a url", base)).toBe(false);
  });
});

describe("ApplyDraftSchema", () => {
  const listingId = "00000000-0000-4000-8000-0000000000b2";
  it("accepts only safe fields and shared amenity keys", () => {
    expect(ApplyDraftSchema.safeParse({ listingId, amenities: ["tv"] }).success).toBe(true);
    expect(ApplyDraftSchema.safeParse({ listingId, amenities: ["hair_dryer"] }).success).toBe(
      false,
    );
    const extra = ApplyDraftSchema.parse({ listingId, title: "A flat", base_price_cents: 1 });
    expect(extra).toEqual({ listingId, title: "A flat" });
  });

  it("labels the applied fields for the feed", () => {
    expect(appliedFieldsLabel(["title"])).toBe("title");
    expect(appliedFieldsLabel(["title", "amenities"])).toBe("title and amenities");
    expect(appliedFieldsLabel(["title", "description", "amenities"])).toBe(
      "title, description and amenities",
    );
  });
});
