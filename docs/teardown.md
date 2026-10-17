# Airbnb teardown (GH-4)

Filled in during GH-4 with the reverse-engineer-airbnb skill. Screenshots are internal reference only: they never go in this repo.

## 1. Journey map

Mark every step an agent or check now does with **(agent)** or **(Verifier)**.

1. **Guest discovers:**
2. **Guest decides:**
3. **Host lists:**
4. **Host manages:**
5. **Guest arrives:**

## 2. Screen inventory

| Airbnb screen            | Components and fields we keep | Glasshouse change | Tier    |
| ------------------------ | ----------------------------- | ----------------- | ------- |
| Home and search          |                               |                   | Must    |
| Listing page             |                               |                   | Must    |
| Booking box and checkout |                               |                   | Must    |
| Inbox                    |                               |                   | Must    |
| Host dashboard           |                               |                   | Must    |
| Listing creation         |                               |                   | Should  |
| Trips                    |                               |                   | Stretch |

## 3. Entities for the schema

Confirm against `supabase/migrations/0001_core.sql`; list anything missing.

## 4. Brand kit

- Name: Glasshouse
- Primary color:
- Accent color:
- Font:
- Logo mark:

(Put the colors in `app/globals.css`: `--brand`, `--brand-accent`.)

## 5. Seed-data spec (for GH-7)

| #    | Slug   | City / area | Type | Guests / beds / baths | Nightly / weekend / cleaning ($) | Photos from   | Notes                                        |
| ---- | ------ | ----------- | ---- | --------------------- | -------------------------------- | ------------- | -------------------------------------------- |
| 1    | hero-1 |             |      |                       | 120 / none / 40                  | Temuri (GH-6) | Negotiation demo; policy in seed/fixtures.ts |
| 2    | hero-2 |             |      |                       |                                  | Temuri (GH-6) |                                              |
| 3    |        | Batumi      |      |                       |                                  |               | Lie 1: "stunning sea view", no sea photo     |
| 4    |        |             |      |                       |                                  |               | Lie 2: "sleeps 6", 4 beds in photos          |
| 5-12 |        |             |      |                       |                                  |               |                                              |
