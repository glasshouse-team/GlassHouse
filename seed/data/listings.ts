/**
 * The 12 seed listings, from the spec in docs/teardown.md section 5 (GH-4).
 * Hero rows are placeholders until Temuri sends the real facts (GH-6); hero-1's prices and
 * policy come from seed/fixtures.ts and are never retyped here.
 */
import type { Amenity } from "@/lib/schemas/core";
import { HERO_1_POLICY, HERO_1_PRICING, LIE_LISTING_SLUGS } from "../fixtures";

export type SeedCity = "Tbilisi" | "Kazbegi" | "Batumi" | "Sighnaghi";
export type SeedPropertyType = "apartment" | "house" | "cabin" | "guesthouse" | "loft";

/** The `HouseRulesSchema` keys, all set (a type alias so it fits the jsonb column). */
export type SeedHouseRules = {
  pets: boolean | string;
  smoking: boolean;
  parties: boolean;
  quiet_hours: string;
  check_in_after: string;
  check_out_before: string;
};

export type SeedPolicy = {
  negotiable: boolean;
  floor_nightly_cents: number;
  max_discount_pct: number;
  /** null = always ask the host. */
  auto_accept_total_cents: number | null;
  long_stay_rules: { min_nights: number; discount_pct: number }[];
  gap_night_pct: number;
  max_rounds: number;
  allowed_terms: string[];
};

export interface SeedListing {
  slug: string;
  host: "giorgi" | "ana";
  title: string;
  description: string;
  city: SeedCity;
  neighborhood: string;
  property_type: SeedPropertyType;
  max_guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  base_price_cents: number;
  /** null = weekend nights cost the same as weekdays. */
  weekend_price_cents: number | null;
  cleaning_fee_cents: number;
  amenities: Amenity[];
  house_rules: SeedHouseRules;
  /** One line per topic; the label before the colon is the `manual:<key>` that Q&A cites. */
  house_manual: string;
  policy: SeedPolicy;
  /** Dates ("YYYY-MM-DD") blocked in `availability`; every other night is free. */
  blocked_dates: string[];
}

/** Policy fields every non-hero listing shares. */
const POLICY_DEFAULTS = {
  auto_accept_total_cents: null,
  long_stay_rules: [],
  gap_night_pct: 0,
  max_rounds: 6,
  allowed_terms: [],
} satisfies Partial<SeedPolicy>;

const NO_SMOKING_NO_PARTIES = { smoking: false, parties: false } as const;

export const SEED_LISTINGS: SeedListing[] = [
  {
    slug: "hero-1",
    host: "giorgi",
    title: "Stone house with a fireplace and a view of Mount Kazbek",
    description:
      "A quiet stone house at the edge of Stepantsminda. The living room has a wood fireplace and a desk by the window, and the bedroom looks straight at Mount Kazbek. Fibre wifi, a full kitchen and a washing machine make it easy to stay a week.",
    city: "Kazbegi",
    neighborhood: "Stepantsminda",
    property_type: "house",
    max_guests: 4,
    bedrooms: 2,
    beds: 3,
    baths: 1,
    ...HERO_1_PRICING,
    amenities: [
      "wifi",
      "dedicated_workspace",
      "kitchen",
      "washer",
      "heating",
      "fireplace",
      "free_parking",
      "mountain_view",
      "coffee_maker",
      "self_check_in",
    ],
    house_rules: {
      pets: "One dog under 15 kg; tell the host first",
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "22:00-08:00",
      check_in_after: "15:00",
      check_out_before: "11:00",
    },
    house_manual: [
      "Wifi: fibre, 100 Mbps down and 50 up; fine for video calls; the network name and password are on the fridge.",
      "Parking: free parking for one car in the yard; the gate code comes from the host on arrival day.",
      "Heating: gas boiler in the kitchen cupboard; the fireplace heats the living room; firewood is in the shed.",
      "Check-in: self check-in from 15:00 with the lockbox by the door; the code arrives on the day.",
      "Pets: one dog under 15 kg is welcome; tell the host first.",
      "Pharmacy: the nearest pharmacy is a 5-minute walk down the main street.",
      "Trash: bins at the gate; collection on Tuesday and Friday mornings.",
    ].join("\n"),
    // Copies of the fixture's readonly arrays; the numbers stay in seed/fixtures.ts.
    policy: {
      ...HERO_1_POLICY,
      long_stay_rules: [...HERO_1_POLICY.long_stay_rules],
      allowed_terms: [...HERO_1_POLICY.allowed_terms],
    },
    blocked_dates: [],
  },
  {
    slug: "hero-2",
    host: "giorgi",
    title: "Vera apartment with a desk and an open-plan kitchen",
    description:
      "A one-bedroom flat on a leafy street in Vera, ten minutes on foot from Rustaveli Avenue. The open-plan kitchen and living room has a dining table for four, a sofa, a wall-mounted TV and a proper desk with an ultrawide monitor; the bedroom has a double bed and a second TV. Fast fibre internet, air conditioning and a glass walk-in shower.",
    city: "Tbilisi",
    neighborhood: "Vera",
    property_type: "apartment",
    max_guests: 2,
    bedrooms: 1,
    beds: 1,
    baths: 1,
    base_price_cents: 8_500,
    weekend_price_cents: 9_500,
    cleaning_fee_cents: 2_500,
    amenities: [
      "wifi",
      "dedicated_workspace",
      "kitchen",
      "washer",
      "air_conditioning",
      "heating",
      "tv",
    ],
    house_rules: {
      pets: false,
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "23:00-08:00",
      check_in_after: "14:00",
      check_out_before: "11:00",
    },
    house_manual: [
      "Wifi: fibre, 300 Mbps; the router is in the hallway.",
      "Parking: paid street parking in front of the building; free on Sundays.",
      "Heating: central heating; the thermostat is by the front door.",
      "Check-in: from 14:00; the keys are in the lockbox at the building entrance.",
      "Pets: no pets.",
      "Pharmacy: a 24-hour pharmacy on the corner.",
      "Trash: bins in the courtyard, any day.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 7_200,
      max_discount_pct: 15,
    },
    blocked_dates: [],
  },
  {
    slug: LIE_LISTING_SLUGS.seaView,
    host: "ana",
    title: "Stunning sea view flat near the boulevard",
    description:
      "Wake up to a stunning sea view from the balcony of this one-bedroom flat near the New Boulevard. Air conditioning, a fast elevator and the beach promenade a short walk away.",
    city: "Batumi",
    neighborhood: "New Boulevard",
    property_type: "apartment",
    max_guests: 3,
    bedrooms: 1,
    beds: 2,
    baths: 1,
    base_price_cents: 7_500,
    weekend_price_cents: 9_000,
    cleaning_fee_cents: 2_500,
    amenities: ["wifi", "kitchen", "air_conditioning", "balcony", "sea_view", "elevator", "tv"],
    house_rules: {
      pets: false,
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "23:00-08:00",
      check_in_after: "14:00",
      check_out_before: "12:00",
    },
    house_manual: [
      "Wifi: 50 Mbps.",
      "Check-in: the host meets you in the lobby.",
      "Parking: paid underground parking next door.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 6_500,
      max_discount_pct: 10,
    },
    blocked_dates: [],
  },
  {
    slug: LIE_LISTING_SLUGS.sleepsSix,
    host: "ana",
    title: "Family house with a garden, sleeps 6",
    description:
      "A family house in Sighnaghi's old town with a walled garden and a barbecue. Sleeps 6 comfortably, a short walk from the town walls and the view over the Alazani Valley.",
    city: "Sighnaghi",
    neighborhood: "Old Town",
    property_type: "house",
    max_guests: 6,
    bedrooms: 2,
    beds: 4,
    baths: 1,
    base_price_cents: 9_000,
    weekend_price_cents: 11_000,
    cleaning_fee_cents: 3_000,
    amenities: [
      "wifi",
      "kitchen",
      "heating",
      "washer",
      "garden",
      "bbq_grill",
      "free_parking",
      "crib",
    ],
    house_rules: {
      pets: true,
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "22:00-08:00",
      check_in_after: "15:00",
      check_out_before: "11:00",
    },
    house_manual: [
      "Wifi: 30 Mbps.",
      "Check-in: the key is under the blue pot by the gate.",
      "Parking: free in the yard for two cars.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 8_000,
      max_discount_pct: 10,
    },
    blocked_dates: [],
  },
  {
    slug: "kazbegi-gergeti-cabin",
    host: "ana",
    title: "Wooden cabin under Gergeti with a fireplace",
    description:
      "A small wooden cabin on the road up to Gergeti, with a fireplace, a terrace and the mountains filling every window. Good for hikers; the mobile internet is fine for messages, not for calls.",
    city: "Kazbegi",
    neighborhood: "Gergeti",
    property_type: "cabin",
    max_guests: 4,
    bedrooms: 1,
    beds: 2,
    baths: 1,
    base_price_cents: 9_500,
    weekend_price_cents: 11_000,
    cleaning_fee_cents: 3_000,
    amenities: [
      "wifi",
      "kitchen",
      "heating",
      "fireplace",
      "terrace",
      "free_parking",
      "mountain_view",
    ],
    house_rules: {
      pets: "Ask the host first",
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "22:00-08:00",
      check_in_after: "14:00",
      check_out_before: "11:00",
    },
    house_manual: [
      "Wifi: 4G router, about 10 Mbps; not good for video calls.",
      "Check-in: the host meets you at the gate.",
      "Parking: free at the cabin.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 8_500,
      max_discount_pct: 10,
    },
    blocked_dates: [],
  },
  {
    slug: "kazbegi-alpine-chalet",
    host: "ana",
    title: "Alpine chalet with a sauna and a hot tub",
    description:
      "A large timber chalet for groups: four bedrooms, a sauna, an outdoor hot tub facing the mountains and a big fireplace. A study corner with fibre internet if someone has to work.",
    city: "Kazbegi",
    neighborhood: "Stepantsminda",
    property_type: "house",
    max_guests: 8,
    bedrooms: 4,
    beds: 5,
    baths: 3,
    base_price_cents: 32_000,
    weekend_price_cents: 36_000,
    cleaning_fee_cents: 6_000,
    amenities: [
      "wifi",
      "dedicated_workspace",
      "kitchen",
      "washer",
      "dryer",
      "dishwasher",
      "heating",
      "fireplace",
      "sauna",
      "hot_tub",
      "terrace",
      "bbq_grill",
      "free_parking",
      "mountain_view",
      "self_check_in",
    ],
    house_rules: {
      pets: false,
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "22:00-08:00",
      check_in_after: "16:00",
      check_out_before: "10:00",
    },
    house_manual: [
      "Wifi: fibre, 200 Mbps.",
      "Check-in: self check-in from 16:00 with a door code.",
      "Parking: free for three cars.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 29_000,
      max_discount_pct: 10,
    },
    blocked_dates: ["2026-11-11"],
  },
  {
    slug: "kazbegi-stepantsminda-guesthouse",
    host: "ana",
    title: "Cozy guesthouse room in Stepantsminda",
    description:
      "A warm double room in a family guesthouse in the centre of Stepantsminda, with mountain views from the window and coffee in the shared kitchen corner.",
    city: "Kazbegi",
    neighborhood: "Stepantsminda",
    property_type: "guesthouse",
    max_guests: 2,
    bedrooms: 1,
    beds: 1,
    baths: 1,
    base_price_cents: 4_500,
    weekend_price_cents: 5_000,
    cleaning_fee_cents: 1_000,
    amenities: ["wifi", "heating", "coffee_maker", "mountain_view"],
    house_rules: {
      pets: false,
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "22:00-07:00",
      check_in_after: "13:00",
      check_out_before: "11:00",
    },
    house_manual: [
      "Wifi: 20 Mbps in the common room.",
      "Check-in: reception from 13:00.",
      "Parking: free on the street.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 4_000,
      max_discount_pct: 10,
    },
    blocked_dates: [],
  },
  {
    slug: "tbilisi-sololaki-loft",
    host: "ana",
    title: "Sololaki loft with a reading nook and fast wifi",
    description:
      "A high-ceilinged loft in an old Sololaki building: a cozy living room with a reading nook, a long desk, very fast fibre and steep stairs up to the sleeping gallery. City views over the rooftops.",
    city: "Tbilisi",
    neighborhood: "Sololaki",
    property_type: "loft",
    max_guests: 4,
    bedrooms: 2,
    beds: 2,
    baths: 1.5,
    base_price_cents: 11_000,
    weekend_price_cents: 13_000,
    cleaning_fee_cents: 3_500,
    amenities: [
      "wifi",
      "dedicated_workspace",
      "kitchen",
      "washer",
      "dishwasher",
      "air_conditioning",
      "heating",
      "coffee_maker",
      "city_view",
      "self_check_in",
      "tv",
    ],
    house_rules: {
      pets: false,
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "23:00-08:00",
      check_in_after: "15:00",
      check_out_before: "11:00",
    },
    house_manual: [
      "Wifi: fibre, 500 Mbps.",
      "Check-in: self check-in from 15:00 with a smart lock.",
      "Parking: paid street parking.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 9_500,
      max_discount_pct: 12,
    },
    blocked_dates: [],
  },
  {
    slug: "tbilisi-vake-family-apartment",
    host: "ana",
    title: "Family apartment in Vake with mountain views",
    description:
      "A spacious three-bedroom apartment in Vake, next to the park, with views of the hills from the living room, a desk, a crib and a high chair, and a parking space in the building's garage.",
    city: "Tbilisi",
    neighborhood: "Vake",
    property_type: "apartment",
    max_guests: 6,
    bedrooms: 3,
    beds: 4,
    baths: 2,
    base_price_cents: 9_500,
    weekend_price_cents: 9_500,
    cleaning_fee_cents: 3_000,
    amenities: [
      "wifi",
      "dedicated_workspace",
      "kitchen",
      "washer",
      "dishwasher",
      "air_conditioning",
      "heating",
      "elevator",
      "free_parking",
      "mountain_view",
      "crib",
      "high_chair",
      "tv",
    ],
    house_rules: {
      pets: false,
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "22:00-08:00",
      check_in_after: "15:00",
      check_out_before: "12:00",
    },
    house_manual: [
      "Wifi: fibre, 300 Mbps.",
      "Check-in: the concierge has the keys from 15:00.",
      "Parking: free in the building's garage.",
    ].join("\n"),
    // GH-15's "not negotiable" case: the host keeps the price and offers late checkout.
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: false,
      floor_nightly_cents: 9_500,
      max_discount_pct: 0,
      allowed_terms: ["late_checkout"],
    },
    blocked_dates: [],
  },
  {
    slug: "tbilisi-old-town-balcony-flat",
    host: "ana",
    title: "Old Tbilisi flat with a carved wooden balcony",
    description:
      "A one-bedroom flat in a 19th-century house with a carved wooden balcony over a busy old-town street, a few minutes from the sulphur baths.",
    city: "Tbilisi",
    neighborhood: "Old Tbilisi",
    property_type: "apartment",
    max_guests: 3,
    bedrooms: 1,
    beds: 2,
    baths: 1,
    base_price_cents: 6_000,
    weekend_price_cents: 7_000,
    cleaning_fee_cents: 2_000,
    amenities: [
      "wifi",
      "kitchen",
      "heating",
      "air_conditioning",
      "balcony",
      "city_view",
      "street_parking",
    ],
    house_rules: {
      pets: true,
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "23:00-08:00",
      check_in_after: "14:00",
      check_out_before: "11:00",
    },
    house_manual: [
      "Wifi: 100 Mbps.",
      "Check-in: the host meets you at the courtyard door.",
      "Parking: street parking, often full.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 5_200,
      max_discount_pct: 15,
    },
    blocked_dates: [],
  },
  {
    slug: "batumi-old-town-studio",
    host: "ana",
    title: "Compact studio in Old Batumi",
    description:
      "A neat studio on a quiet lane in Old Batumi, close to Europe Square and the cafés. Self check-in, air conditioning and a small kitchen.",
    city: "Batumi",
    neighborhood: "Old Batumi",
    property_type: "apartment",
    max_guests: 2,
    bedrooms: 0,
    beds: 1,
    baths: 1,
    base_price_cents: 4_000,
    weekend_price_cents: 5_000,
    cleaning_fee_cents: 1_500,
    amenities: ["wifi", "kitchen", "air_conditioning", "street_parking", "self_check_in", "tv"],
    house_rules: {
      pets: false,
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "23:00-08:00",
      check_in_after: "14:00",
      check_out_before: "11:00",
    },
    house_manual: [
      "Wifi: 100 Mbps.",
      "Check-in: self check-in with a keypad.",
      "Parking: paid street parking.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 3_500,
      max_discount_pct: 10,
    },
    blocked_dates: ["2026-11-20", "2026-11-21", "2026-11-22"],
  },
  {
    slug: "sighnaghi-vineyard-guesthouse",
    host: "ana",
    title: "Vineyard guesthouse with a valley terrace",
    description:
      "A family-run guesthouse among the vines below Sighnaghi. Two bedrooms, a terrace over the Alazani Valley with the Caucasus on the horizon, and house wine at dinner.",
    city: "Sighnaghi",
    neighborhood: "Alazani Valley",
    property_type: "guesthouse",
    max_guests: 4,
    bedrooms: 2,
    beds: 2,
    baths: 2,
    base_price_cents: 7_000,
    weekend_price_cents: 8_500,
    cleaning_fee_cents: 2_000,
    amenities: [
      "wifi",
      "kitchen",
      "heating",
      "coffee_maker",
      "terrace",
      "garden",
      "bbq_grill",
      "free_parking",
      "mountain_view",
    ],
    house_rules: {
      pets: "Ask the host first",
      ...NO_SMOKING_NO_PARTIES,
      quiet_hours: "22:00-08:00",
      check_in_after: "14:00",
      check_out_before: "11:00",
    },
    house_manual: [
      "Wifi: 40 Mbps.",
      "Check-in: the family meets you at the house.",
      "Parking: free by the vineyard gate.",
    ].join("\n"),
    policy: {
      ...POLICY_DEFAULTS,
      negotiable: true,
      floor_nightly_cents: 6_000,
      max_discount_pct: 15,
    },
    blocked_dates: [],
  },
];
