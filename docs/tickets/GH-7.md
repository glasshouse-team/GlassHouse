# GH-7: Seed data: ~12 listings, reviews, house rules, host policies, demo fixtures

> Offline copy of [GH-7](https://hacktoberfest.atlassian.net/browse/GH-7), taken 2026-10-17. Read the live ticket when the Atlassian MCP server is connected: Jira wins on scope and acceptance criteria. "In the starter" below wins on repo facts (paths, versions, dates).

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Beka | Task | High | 3-5 | GH-4, GH-5 | `supabase-data` |

Labels: data, hours-3-5, must-have

## In the starter

- `seed/fixtures.ts`: the hero-home price ($120 a night, no weekend price, $40 cleaning), the hero policy, the demo deal (Mon Nov 9 to Fri Nov 13, 2026, D-007) and the negotiation script. The pricing and validator tests use them, so keep the numbers or update the tests.
- `scripts/seed.ts` is a stub (`pnpm seed`).

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
