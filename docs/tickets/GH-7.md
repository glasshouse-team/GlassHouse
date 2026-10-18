# GH-7: Seed data: ~12 listings, reviews, house rules, host policies, demo fixtures

> The ticket text below the line is a copy of [GH-7](https://hacktoberfest.atlassian.net/browse/GH-7) from Jira (2026-10-17); for scope and acceptance criteria, Jira wins. The sections above the line are repo facts Jira does not have (**In the starter**, **Build notes**, **Needs from people**), and `/start-ticket` reads them every time.

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Beka | Task | High | 3-5 | GH-4, GH-5 | `supabase-data` |

Labels: data, hours-3-5, must-have

## In the starter

- `seed/fixtures.ts`: the hero-home price ($120 a night, no weekend price, $40 cleaning), the hero policy, the demo deal (Mon Nov 9 to Fri Nov 13, 2026, D-007) and the negotiation script. The pricing and validator tests use them, so keep the numbers or update the tests.
- `scripts/seed.ts` is a stub (`pnpm seed`).

## Build notes

- Put the logic in `seed/seed.ts` (`seed()`, `restoreHeroPolicy()`, `restoreHeroManual()`); `scripts/seed.ts` only calls `seed()`, so GH-26's reset can reuse the functions.
- Use the fixed ids in seed/fixtures.ts (`DEMO_PROFILES`, `HERO_LISTINGS`) and give other rows stable ids derived from their slug (uuid v5), so URLs survive re-seeding. Ids must be valid uuids or `logEvent` drops their events.
- Never write `published_world_id` in the listing upsert (re-seeding would unpublish the 3D). Set `status: "published"`, `rating` and `review_count`.
- Hero photos: list `media/listings/{id}/photos/` in Storage and upsert `listing_photos` on `(listing_id, sort)` from the `NN-{room}.jpg` names. Other listings: free-licence photos in `seed/photos/<slug>/` (git-ignored), uploaded the same way.
- Make the data match the fixtures, and unit-test it: hero-1 fits the demo brief (`max_guests` at least 4, fireplace, workspace, mountain view, no blocked dates in November); nothing mentions a hair dryer; every `HERO_QA_FIXTURES` source exists; the two `LIE_LISTING_SLUGS` lie as described.
- Log `SEED_COMPLETED_ACTION` as the last step: GH-26 resets everything after it.

## Needs from people

- From Temuri: hero photos, copy, manuals and a few concrete review complaints. From Beka: about 50 free-licence photos with credits.

---

## Goal

A realistic, repeatable dataset that makes every demo moment work: search, X-ray lies, Q&A answers, and the "$50 less" negotiation.

**Owner:** Beka (Temuri supplies hero-home copy from GH-6) · **When:** hours 3–5 · **Estimate:** 1.5–2h · **Depends on:** GH-4, GH-5 · **Blocks:** GH-9, GH-14, GH-15, GH-16

## Build `scripts/seed.ts`

- Idempotent: upsert by `listings.slug`, so it can run many times.
- Uses the service-role key, server-side only.
- Uploads seed photos to `media/listings/{id}/photos/`.
- Prints a summary table at the end.

## Data to create

1. **Profiles:** guest "Nino" and two hosts, "Giorgi" (hero homes) and "Ana" (others). The role switcher (GH-8) uses these.
2. **Listings (about 12):**
   - 2 hero homes with real photos from GH-6.
   - About 10 others in Tbilisi, Kazbegi, Batumi and Sighnaghi, using own or free-licence photos (no Airbnb photos).
   - Every field from GH-5: amenities, house rules (`pets`, `smoking`, `parties`, `quiet_hours`, `check_in_after`, `check_out_before`), and prices in cents.
3. **Two deliberate lies for the X-ray demo:**
   - A Batumi listing whose description says "stunning sea view", with no photo showing the sea.
   - A listing that says "sleeps 6" while its photos show 4 beds.
4. **House manuals:** full manuals for both hero homes (from Temuri): wifi, boiler or heating, check-in steps, parking, pets policy, nearest pharmacy, trash day. Short manuals for the others.
5. **Reviews:** 4–6 per listing with `sub_ratings` (cleanliness, accuracy, check_in, communication, location, value). Include a few concrete, placeable complaints for spatial reviews, e.g. "bedroom window faces a noisy street", "shower pressure is weak".
6. **Host policies:**
   - Hero home 1, used by the negotiation demo: list $120/night, cleaning $40, `negotiable = true`, floor $100/night, max discount 15%, auto-accept total $490, max 6 rounds, allowed terms `late_checkout`, `early_checkin`.
   - Other listings: varied. Include at least one with `negotiable = false`.
7. **Availability:** all free for the next 60 days, except a few blocked dates on two listings to test filters.
8. **Q&A fixtures** for the hero home: 5 questions answerable from facts or the manual, and 1 the agent can't answer (e.g. "Is there a hair dryer?"), which tests forwarding to the host.

## Acceptance criteria

- [ ] `pnpm seed` runs twice in a row without duplicates or errors.
- [ ] Both hero homes show their real photos on the listing page.
- [ ] Both lies exist exactly as described, so GH-9 can catch them.
- [ ] The hero-home policy matches the numbers above, which the GH-15 test fixture uses.
- [ ] `scripts/reset-demo.ts` (GH-26) can call into this to restore the demo state.

## Owns

`scripts/seed.ts`, `seed/` (JSON or TS data files, photos)

## Decision updates

- 2026-10-18 D-026: Hero 2's seed row now describes Temuri's real apartment (one bedroom, a double bed and a sofa bed for 4, desk with two monitors, two balcony doors; no dishwasher or elevator) and two reviews match it; run pnpm seed to mirror its 18 photos into listing_photos. Hero 1 stays the Kazbegi placeholder (was: both hero rows waited for GH-6 facts). Jira: updated
- 2026-10-18 D-028: hero 2 now sleeps 2 in one double bed with one ultrawide monitor, no balcony or city view, matching its 18 photos, so it drops out of the 4-guest brief (was: sleeps 4 with a sofa bed, two monitors, two balconies, city view). Jira: pending
