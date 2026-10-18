import { describe, expect, it } from "vitest";
import {
  ANYWHERE,
  matchCities,
  searchCities,
  vibeCities,
  nightlyBudgetCents,
  priceCeilingCents,
  toTripBrief,
  type BriefDraft,
} from "./brief";

// What Haiku should make of the demo brief.
const demo: BriefDraft = {
  destinations: ["Kazbegi", "Tbilisi"],
  fitting_cities: ["Kazbegi", "Tbilisi"],
  check_in: null,
  check_out: null,
  nights: null,
  guests: 4,
  guests_guess: null,
  budget_amount_usd: 60,
  budget_per: "night_per_person",
  must_haves: ["mountain view"],
  nice_to_haves: ["fireplace or cozy living room"],
  deal_breakers: [],
  work_needs: "one of us works remotely",
  pets: null,
  accessibility: [],
};

function brief(draft: BriefDraft) {
  return toTripBrief(draft).brief;
}

describe("toTripBrief", () => {
  it("maps the demo brief, with the budget in cents", () => {
    expect(brief(demo)).toMatchObject({
      destinations: ["Kazbegi", "Tbilisi"],
      guests: 4,
      budget: { amount_cents: 6_000, per: "night_per_person" },
      pets: 0,
      nights: null,
    });
  });

  it("searches a vague brief instead of asking: vibe cities or anywhere, a guessed group", () => {
    expect(toTripBrief(demo).assumptions).toEqual([]);
    expect(
      brief({ ...demo, destinations: [" "], fitting_cities: ["Batumi"] }).destinations,
    ).toEqual(["Batumi"]);
    expect(brief({ ...demo, destinations: [], fitting_cities: [] }).destinations).toEqual([
      ANYWHERE,
    ]);
    const family = toTripBrief({ ...demo, guests: null, guests_guess: 4 });
    expect(family.brief.guests).toBe(4);
    expect(family.guestsStated).toBe(false);
    expect(toTripBrief(demo).guestsStated).toBe(true);
    expect(family.assumptions[0]).toMatch(/Searched for 4 guests/);
    expect(toTripBrief({ ...demo, guests: null }).brief.guests).toBe(2);
    expect(toTripBrief({ ...demo, guests: 0 }).brief.guests).toBe(2);
    expect(toTripBrief({ ...demo, guests: 40, guests_guess: null }).brief.guests).toBe(2);
  });

  it("keeps valid dates and counts the nights; drops reversed or malformed ones", () => {
    expect(brief({ ...demo, check_in: "2026-11-09", check_out: "2026-11-13" })).toMatchObject({
      check_in: "2026-11-09",
      nights: 4,
    });
    expect(brief({ ...demo, check_in: "2026-11-13", check_out: "2026-11-09" })).toMatchObject({
      check_in: null,
      check_out: null,
    });
    expect(
      brief({ ...demo, check_in: "early November", check_out: null, nights: 3 }),
    ).toMatchObject({
      check_in: null,
      nights: 3,
    });
  });
});

describe("budget", () => {
  it("works out the group's nightly budget and the 1.2x search ceiling", () => {
    const b = brief(demo);
    expect(nightlyBudgetCents(b)).toBe(24_000);
    expect(priceCeilingCents(b)).toBe(28_800);
    expect(
      nightlyBudgetCents(brief({ ...demo, budget_per: "night", budget_amount_usd: 150 })),
    ).toBe(15_000);
    const total = brief({ ...demo, budget_per: "total", budget_amount_usd: 500, nights: 4 });
    expect(nightlyBudgetCents(total)).toBe(12_500);
    expect(nightlyBudgetCents(brief({ ...demo, budget_amount_usd: null }))).toBeNull();
    expect(nightlyBudgetCents(brief({ ...demo, budget_per: "total", nights: null }))).toBeNull();
  });
});

describe("matchCities", () => {
  it("finds the seeded cities, with a few local names", () => {
    expect(matchCities(["Kazbegi", "tbilisi"])).toEqual(["Kazbegi", "Tbilisi"]);
    expect(matchCities(["Stepantsminda", "Gudauri"])).toEqual(["Kazbegi"]);
    expect(matchCities(["Paris"])).toEqual([]);
  });
});

describe("vague places", () => {
  it("reads the vibe: mountains, sea, wine, city", () => {
    expect(vibeCities("somewhere quiet in the mountains")).toEqual(["Kazbegi"]);
    expect(vibeCities("beach trip with friends")).toEqual(["Batumi"]);
    expect(vibeCities("wine tasting")).toEqual(["Sighnaghi"]);
    expect(vibeCities("city break")).toEqual(["Tbilisi"]);
    expect(vibeCities("something romantic")).toEqual([]);
  });

  it("prefers the cities the guest named, then the vibe, then everywhere", () => {
    expect(searchCities(["Batumi"], ["Kazbegi"], "beach in batumi")).toEqual({
      cities: ["Batumi"],
      named: true,
    });
    expect(searchCities([], ["Sighnaghi"], "hiking and wine")).toEqual({
      cities: ["Sighnaghi", "Kazbegi"],
      named: false,
    });
    expect(searchCities([ANYWHERE], [], "something romantic")).toEqual({
      cities: [],
      named: false,
    });
    expect(searchCities(["the mountains"], [], "the mountains")).toEqual({
      cities: ["Kazbegi"],
      named: false,
    });
  });
});
