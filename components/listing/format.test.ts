import { describe, expect, it } from "vitest";
import { Amenity } from "@/lib/schemas/core";
import {
  AMENITY_LABELS,
  amenityLabel,
  factsLine,
  houseRuleLines,
  reviewMonth,
  stayLabel,
  subRatingAverages,
} from "./format";

describe("amenity labels", () => {
  it("has a label for every shared amenity word", () => {
    expect(Object.keys(AMENITY_LABELS).sort()).toEqual([...Amenity.options].sort());
  });

  it("keeps unknown words readable", () => {
    expect(amenityLabel("dedicated_workspace")).toBe("Dedicated workspace");
    expect(amenityLabel("pool_table")).toBe("Pool table");
  });
});

describe("factsLine and stayLabel", () => {
  it("pluralizes and handles studios", () => {
    expect(factsLine({ max_guests: 4, bedrooms: 2, beds: 3, baths: 1 })).toBe(
      "4 guests · 2 bedrooms · 3 beds · 1 bath",
    );
    expect(factsLine({ max_guests: 2, bedrooms: 0, beds: 1, baths: 1.5 })).toBe(
      "2 guests · Studio · 1 bed · 1.5 baths",
    );
  });

  it("describes what is rented", () => {
    expect(stayLabel("house", "Kazbegi")).toBe("Entire house in Kazbegi");
    expect(stayLabel("guesthouse", "Kazbegi")).toBe("Room in a guesthouse in Kazbegi");
  });
});

describe("houseRuleLines", () => {
  it("lists check-in, checkout, pets, smoking, parties and quiet hours", () => {
    expect(
      houseRuleLines({
        pets: "One dog under 15 kg; tell the host first",
        smoking: false,
        parties: false,
        quiet_hours: "22:00-08:00",
        check_in_after: "15:00",
        check_out_before: "11:00",
      }),
    ).toEqual([
      "Check-in after 15:00",
      "Checkout before 11:00",
      "Pets: One dog under 15 kg; tell the host first",
      "No smoking",
      "No parties or events",
      "Quiet hours 22:00 to 08:00",
    ]);
    expect(houseRuleLines({ pets: true })).toEqual(["Pets allowed"]);
  });
});

describe("subRatingAverages", () => {
  it("averages each sub-rating with one decimal and skips missing values", () => {
    const reviews = [
      { sub_ratings: { cleanliness: 5, accuracy: 4, value: 5 } },
      { sub_ratings: { cleanliness: 4, accuracy: 4 } },
      { sub_ratings: null },
    ];
    const byKey = Object.fromEntries(subRatingAverages(reviews).map((r) => [r.key, r.average]));
    expect(byKey).toEqual({
      cleanliness: 4.5,
      accuracy: 4,
      check_in: null,
      communication: null,
      location: null,
      value: 5,
    });
  });
});

describe("reviewMonth", () => {
  it("shows month and year", () => {
    expect(reviewMonth("2026-09-15T12:00:00Z")).toBe("September 2026");
  });
});
