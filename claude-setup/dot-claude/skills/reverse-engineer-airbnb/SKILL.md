---
name: reverse-engineer-airbnb
description: Reverse-engineer Airbnb's screens, user journeys, data model and UI patterns, and turn them into Glasshouse's screen inventory, brand kit and seed-data spec (docs/teardown.md). Use for GH-4, and as the UI pattern reference for GH-8 pages.
when_to_use: "reverse engineer Airbnb", "teardown", "what screens do we need", "map the user journeys", "screen inventory", "brand kit", "seed data spec", "make it look like Airbnb", building the listing page, search results, booking box or host dashboard layout.
---

# Reverse-engineer Airbnb (GH-4)

Goal: in about one hour, map Airbnb's screens, flows and data so judges recognize "Airbnb" in one second, then mark every manual step that a Glasshouse agent or check replaces. Output: `docs/teardown.md` (the template is already there; fill it in).

## Brand and legal rules (non-negotiable)

- Our own name (Glasshouse), logo, colors and font. Never Airbnb's logo, wordmark, colors, photos, illustrations or listing text.
- Copy **patterns** people know (search pill, card grid, two-column listing page, sticky booking box), not the brand.
- No scraping. Screenshots are internal reference only; they never ship and never go in the repo.
- Seed photos: the team's own or free-licence stock, with consent for real homes.

## What Airbnb already does with AI (do not claim it as new)

Conversational AI search (with voice), review summaries, AI comparison of wishlisted homes, neighborhood pages, dynamic pricing, a 15% top-rated-guest discount, AI-written listing summaries.

What Airbnb does **not** do, and Glasshouse does: agents acting for both sides, a neutral Verifier, 3D homes with blank spots flagged, floor plans from the 3D, check-in verification.

## Steps

1. **Collect.** Ask the user for screenshots (web and phone) of: home/search, results, listing page, booking box, checkout, inbox, trips, host "Today" dashboard, listing creation. Work from what they attach; describe, never copy.
2. **Extract per screen:** components (top to bottom), the data fields each shows, and the actions (buttons, links). Keep it to bullet lists.
3. **Fill the screen inventory** below with the final tier for each screen.
4. **Map the five journeys** (below): every screen and click, and mark each step an agent now does with "(agent)".
5. **Brand kit:** name, two colors (primary, accent), one font (for example Inter, loaded with next/font/local or Google at build time), a simple logo mark. Put the colors in `app/globals.css` tokens (`--brand`, `--brand-accent`).
6. **Seed-data spec** (below) for GH-7.
7. Commit `docs/teardown.md`.

## Screen inventory (starting point, confirm with screenshots)

| Airbnb screen                                                | Glasshouse version                                                                                                                                                                                          | Tier    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Home and search                                              | Trip brief box; guest agent returns a ranked shortlist with cited reasons; card grid kept; simple city and guests filters                                                                                   | Must    |
| Listing page                                                 | Gallery, title, host card, key facts, amenities, house rules, reviews with six sub-ratings, sticky booking box; plus slots: X-ray panel, "Walk through this home", floor plan, "Ask this home", "Negotiate" | Must    |
| Booking box and checkout                                     | Dates, guests, price lines from `computeQuote`; "Reserve" opens a confirm dialog (payment mocked)                                                                                                           | Must    |
| Inbox                                                        | Deal room (agents negotiate) and the Q&A thread (host agent answers)                                                                                                                                        | Must    |
| Host dashboard                                               | Approvals queue, questions waiting, gap tasks, 3D versions, agent rules form, activity feed                                                                                                                 | Must    |
| Listing creation                                             | Walkthrough capture, gap notes, publish                                                                                                                                                                     | Should  |
| Trips                                                        | Trip page with check-in verification                                                                                                                                                                        | Stretch |
| Wishlists, comparison, login, profile, earnings, experiences | Not built; a "View as Guest / Host" role switcher replaces login                                                                                                                                            | Skip    |

## The five journeys

1. **Guest discovers:** brief, shortlist (agent), listing page, X-ray (Verifier), 3D tour, floor plan.
2. **Guest decides:** asks questions (host agent answers), negotiates (both agents), host approves, booked.
3. **Host lists:** records the walkthrough, gets gap notes (Verifier + host agent), fills gaps, publishes.
4. **Host manages:** agent answers routine questions, host approves deals, follows the feed.
5. **Guest arrives:** films check-in, gets a match report (Verifier), host notified.

## Data model behind the screens

Users (guest or host), listings (type, guests, bedrooms, beds, baths, amenities, house rules, location, photos), pricing (nightly, weekend, cleaning, service fee), availability (per date), reservations (dates, guests, price lines, status), reviews (overall plus cleanliness, accuracy, check-in, communication, location, value) and message threads. Glasshouse adds: captures, world versions, anchors, gaps, floor plans, X-ray facts, host policies, deals and deal messages, check-in reports, events. Table definitions: `supabase/migrations/0001_core.sql`.

## UI patterns to reproduce (generic, no brand)

- Search: a rounded "pill" bar at the top; results as a responsive grid (1 column on phones, 2-4 on desktop), photo first with a 4:3 or 20:19 ratio, then title, area, price per night, rating.
- Listing page: full-width photo grid (one large, four small) on desktop, swipeable on phones; two columns on desktop: content left, booking card right and sticky; on phones the booking card becomes a sticky bottom bar with price and "Reserve".
- Amenities as an icon grid with a "Show all" dialog; reviews as sub-rating bars plus a card list.
- Host dashboard: a "today" list of things needing action at the top, then sections.

## Seed-data spec for GH-7

- About 12 listings in Tbilisi, Kazbegi, Batumi and Sighnaghi; 2 of them are Temuri's real "hero" homes (GH-6).
- Per listing: title, city and area, property type, guests, bedrooms, beds, baths, nightly and weekend price in cents, cleaning fee, amenities, house rules, photo source.
- Hero home 1 pricing must match `seed/fixtures.ts` ($120 a night, no weekend rate, $40 cleaning, host policy floor $100, max 15% off, auto-accept $490).
- Two deliberate lies for the X-ray demo: a Batumi listing that says "stunning sea view" with no photo of the sea; a listing that says "sleeps 6" with 4 beds in the photos.
- 4-6 reviews per listing with sub-ratings; a few concrete, placeable complaints ("bedroom window faces a noisy street", "weak shower pressure").

## Done when

docs/teardown.md has the journey map with agent steps marked, the final screen inventory, the entity list, the brand kit and the seed spec, and GH-5 and GH-7 can start from it.
