# GH-4: Reverse-engineer Airbnb: journeys, screen inventory, brand kit, seed spec

> Offline copy of [GH-4](https://hacktoberfest.atlassian.net/browse/GH-4), taken 2026-10-17. Read the live ticket when the Atlassian MCP server is connected: Jira wins on scope and acceptance criteria. "In the starter" below wins on repo facts (paths, versions, dates).

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Beka | Task | High | 1-2 | GH-2 | `reverse-engineer-airbnb` |

Labels: hours-1-2, must-have, product

## In the starter

- `docs/teardown.md`: a template with all five deliverables.
- Brand tokens `--brand`, `--brand-accent` and `--honesty` in `app/globals.css` (placeholder colors). System fonts until a brand font is picked (D-008).
- The `reverse-engineer-airbnb` skill walks through the teardown.

---

## Goal

In one hour, map Airbnb's screens, flows and data so judges recognize "Airbnb" instantly, and mark which manual steps our agents replace. The outputs feed the schema (GH-5), pages (GH-8) and seed data (GH-7).

**Owner:** Beka · **When:** hours 1–2 · **Estimate:** 1h · **Blocks:** GH-5, GH-7, GH-8

## Brand and legal rules (non-negotiable)

- Use our own name (Glasshouse), logo, colors and font. **Never** use Airbnb's logo, wordmark, photos or listing data.
- Copy _patterns_ people know (search bar, card grid, listing page, sticky booking box), not the brand.
- No scraping. Screenshots are for internal reference only and never ship.

## What Airbnb already has with AI (don't claim it as ours)

Conversational AI search (now with voice), review summaries, AI comparison of wishlisted homes, neighborhood pages, dynamic pricing, a top-rated-guest discount, AI listing summaries.

**What Airbnb doesn't have:** agents acting for both sides, a neutral verifier, 3D homes with blank spots flagged, floor plans, check-in verification.

## Steps

1. Screenshot Airbnb's web and mobile: home/search, results, listing page, booking box, checkout, inbox, trips, host "Today" dashboard, listing creation.
2. Give the screenshots to Claude and ask for a component list and a field list per screen.
3. Fill in the screen inventory:

| Airbnb screen | Glasshouse version | Tier |
| --- | --- | --- |
| Home / search | Trip brief box → guest agent shortlist with reasons; card grid kept | Must |
| Listing page | Gallery, details, reviews, sticky booking box, **plus** X-ray panel, "Walk through" 3D, floor plan, "Ask this home", "Negotiate" | Must |
| Booking box / checkout | `computeQuote` in code; payment mocked with "Confirm" | Must |
| Inbox | Deal room (agents negotiate) + Q&A thread (host agent answers) | Must |
| Host dashboard | Approvals queue, questions waiting, gap tasks, agent rules form, activity feed | Must |
| Listing creation | Walkthrough capture → gap notes → publish | Should |
| Trips | Trip page with check-in verification | Stretch |
| Wishlists, comparison, login, earnings | Skip; use a "View as Guest / Host" role switcher | Skip |

4. Map the five journeys, writing every screen and click and marking each step an agent now does:
   1. **Guest discovers:** brief → shortlist → listing → X-ray → 3D tour → floor plan
   2. **Guest decides:** asks questions → negotiates → host approves → booked
   3. **Host lists:** records walkthrough → gets gap notes → fills gaps → publishes
   4. **Host manages:** agent answers → host approves deals → feed
   5. **Guest arrives:** films check-in → match report → host notified
5. **Brand kit:** name, 2 colors (primary and accent), 1 font (e.g. Inter), a simple logo mark. Put the colors in Tailwind theme tokens.
6. **Seed-data spec:** about 12 listings, with Temuri's 2 real "hero" homes among them. For each, list title, city/area, type, guests/beds/baths, nightly and weekend price, cleaning fee, amenities, house rules, photo source. Mark the two deliberate "lies" for the X-ray demo: a "sea view" with no sea photo, and "sleeps 6" with 4 beds.

## Deliverables

Commit them as `docs/teardown.md`.

- [ ] Journey map with agent steps marked
- [ ] Final screen inventory (table above)
- [ ] Entity list for the schema: users, listings, photos, availability, pricing, reservations, reviews with six sub-ratings, message threads
- [ ] Brand kit + Tailwind tokens
- [ ] Seed-data spec

## Owns

`docs/teardown.md`, the Tailwind theme tokens and `app/globals.css` brand variables.
