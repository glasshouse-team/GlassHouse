# Airbnb teardown (GH-4)

Built from Airbnb's well-known public screens and flows, described in our own words. No screenshots were used, and none go in this repo. Nothing in the product copies Airbnb's name, logo, colors, photos or text: we copy patterns people recognize, not the brand or its wording.

**Already in Airbnb with AI (never claim these as ours):** conversational search (with voice), review summaries, AI comparison of wishlisted homes, neighborhood pages, dynamic pricing, a top-rated-guest discount, AI listing summaries.
**Only in Glasshouse:** agents acting for both sides, a neutral Verifier, a 3D tour of every room (one world per room spot, linked by doorway arrows) with AI-filled areas flagged, floor plans from the 3D, check-in verification.

## 1. Journey map

**(agent)** = the guest or host agent does the step; **(Verifier)** = the neutral Verifier checks it; **(code)** = deterministic code, never an LLM (`computeQuote`, `validateOffer`). "Replaces" names the manual Airbnb step that goes away.

1. **Guest discovers** (role switcher on Nino)
   1. `/search` (the home page `/` redirects to it): types the trip brief into the brief box at the top and taps "Find homes". Demo brief: _"4 friends, Kazbegi or Tbilisi, early November, about $60 each per night, one of us works remotely, we want a fireplace or a cozy living room and a mountain view."_ Replaces: the where/dates/guests pill plus 5-10 filter clicks.
   2. **(agent)** The guest agent turns the brief into a `TripBrief` (expected parse in section 5) and saves it to `trip_briefs`. The feed shows one line.
   3. Same page: **(agent)** a ranked shortlist of 3-5 cards, each with 2-3 reasons that cite the listing ("fireplace in the living room, photo 4", "100 Mbps fibre, house manual") and concerns ("no mountain view"). The normal card grid follows, with city and guests filters. Replaces: opening ten tabs and comparing by hand.
   4. Taps the top card: `/listing/[id]`.
   5. **(Verifier)** X-ray panel: facts seen in the photos, contradictions ("says sea view, no photo shows the sea") and missing photos ("no photo of the bathroom"). Replaces: squinting at photos and reading reviews to spot exaggerations.
   6. "Walk through this home": `/tour/[listingId]`. Look around each room in 3D and follow the doorway arrows to the next (D-009), "Jump to room", AI-filled areas tinted amber. Replaces: a 30-photo lightbox.
   7. Floor plan card on the listing page (and the minimap in the tour): rooms with names and areas. Airbnb has none.
   8. Optional, in the tour: "Ask the space" ("Where would I work?"): **(agent)** the guest agent answers and flies the camera to the desk.
2. **Guest decides**
   1. Listing page, "Ask this home": "Can I bring my dog?" **(agent)** The host agent answers in seconds from the house rules, manual or X-ray facts and shows its sources. An unknown ("Is there a hair dryer?") is **(agent)** forwarded to the host and appears under "Questions waiting". Replaces: messaging the host and waiting hours.
   2. Booking box: the guest picks Mon Nov 9 to Fri Nov 13 (the brief only says "early November") and 4 guests. **(code)** `computeQuote` shows the price lines; the list total is $520 (4 nights x $120 + $40 cleaning), plus the service fee.
   3. "Negotiate" (shown on every listing): the guest sets a private maximum ($500) and a goal ("Can I pay $50 less?") and lands in the deal room `/deal/[id]`.
   4. **(agent)** The agents negotiate, one money action per turn, every offer checked by **(code)** `validateOffer` against the host's private rules: guest $470, host $495, guest $480, host accepts $480. Each step lands in the deal room and the feed. Replaces: back-and-forth messages and the host's mental math. A host who doesn't negotiate keeps the price and offers an allowed extra instead (e.g. late checkout).
   5. $480 is below the $490 auto-accept line, so the deal waits for the host (status `agreed_pending_host`).
   6. The host approves (journey 4, step 4). **(code)** A reservation is created from the deal with its price lines; the guest sees "Booked" and the trip page `/trip/[id]`. Payment is mocked with a "Confirm" dialog.
3. **Host lists** (role switcher on Giorgi)
   1. Host dashboard, "Capture": `/host/capture/[listingId]`. The phone takes an 8-photo ring in the middle of each room (D-009), guided by a coverage ring and brightness warnings. Replaces: a photographer or 30 phone photos.
   2. The video is prepared and the 3D world is generated once per version (version 1), then stored in our Storage.
   3. **(Verifier)** Gap check: blank, smeared, stretched, invented or dark spots, pinned in 3D with screenshots. **(agent)** The host agent turns each gap into a task in plain words ("film the bathroom from the doorway for 10 seconds").
   4. The host films the fill-in clips; version 2 is generated and the coverage score goes up.
   5. **(Verifier)** X-ray on the photos and text before publishing ("you wrote 'sea view', but no photo shows the sea").
   6. **(code)** Floor plan from the 3D mesh; **(Verifier)** names the rooms.
   7. The host publishes a version; the listing page shows "Walk through this home" with the honesty overlay.
   8. Nice to have: the host narrates each room and **(agent)** drafts the title, description and amenities (GH-25).
4. **Host manages**
   1. `/host/dashboard`: a "Needs you" list at the top: deals waiting for approval, questions waiting, gap tasks.
   2. **(agent)** Routine questions (dog, parking, wifi, check-in time) were already answered with sources. The host answers only the forwarded ones and can tick "Save to house manual", so the agent knows next time. Replaces: answering the same five questions for every booking.
   3. Agent rules form (private to the host agent; fields as in GH-8): negotiable on or off, floor $100 a night, at most 15% off, auto-accept at $490 or more, allowed extras (late checkout, early check-in). The round limit stays at the default 6.
   4. Approvals: the $480 deal, with Approve or Decline. Approve creates the reservation.
   5. `/feed`: every agent tool call and human action, live. A full-screen view for the projector.
5. **Guest arrives** (stretch)
   1. `/trip/[id]` on arrival day: "Verify check-in", then a 30-60 s video on the phone.
   2. **(Verifier)** Compares the video with the published 3D and photos: a match report per room ("fireplace present", "second bedroom has one bed, the listing shows two").
   3. The host is notified on the dashboard and in the feed; the guest keeps the report as evidence. Replaces: after-the-fact photo disputes.

## 2. Screen inventory

| Airbnb screen                                                     | Components and fields we keep                                                                                                                                                                                                                    | Glasshouse change                                                                                                                                                    | Route                       | Tier    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------- |
| Home and search                                                   | Search entry at the top; result cards: photo (4:3), city and area, title, guests/bedrooms/beds, rating and count, price per night; responsive grid (1 column on phones, 2-4 on desktop)                                                          | The trip brief box replaces the where/dates/guests pill; the guest agent's ranked shortlist with cited reasons sits above the grid; filters are city and guests only | `/search` (`/` redirects)   | Must    |
| Listing page                                                      | Photo grid (1 large + 4 small, swipe on phones); title; type, city and area; guests/bedrooms/beds/baths; rating; host card; description; amenities icon grid with a "see all" dialog; house rules; reviews with six sub-rating bars; booking box | Slots: X-ray panel, "Walk through this home" (3D launcher), floor plan card, "Ask this home"; "Negotiate" in the booking box                                         | `/listing/[id]`             | Must    |
| Booking box and checkout                                          | Dates, guests, price lines (nights x price, cleaning, service fee, total), "Reserve"; sticky card on desktop, sticky bottom bar on phones                                                                                                        | Lines from `computeQuote`; "Reserve" opens a confirm dialog (payment mocked); "Negotiate", shown on every listing, starts a deal                                     | in the listing page         | Must    |
| Inbox                                                             | Conversation list and message thread                                                                                                                                                                                                             | Deal room: the agents' offers as a timeline, deal status, host approval banner. Q&A thread with sources inside "Ask this home"                                       | `/deal/[id]`                | Must    |
| Host dashboard ("Today")                                          | Things that need the host today at the top, then reservations and listings                                                                                                                                                                       | Approvals queue, questions waiting, gap tasks, 3D versions, agent rules form, activity feed                                                                          | `/host/dashboard`           | Must    |
| Listing creation                                                  | Step-by-step wizard (type, location, basics, amenities, photos, title, price, publish)                                                                                                                                                           | Walkthrough capture, gap notes, fill-in clips, publish a version. Other fields come from the seed for the demo                                                       | `/host/capture/[listingId]` | Should  |
| Trips                                                             | Upcoming trip: dates, check-in time, house manual, host contact                                                                                                                                                                                  | Trip page with the price paid and check-in verification                                                                                                              | `/trip/[id]`                | Stretch |
| Wishlists, comparison, map, login, profile, earnings, experiences | none                                                                                                                                                                                                                                             | Not built. A "View as Guest / Host" role switcher (Nino, Giorgi, Ana) replaces login                                                                                 | none                        | Skip    |

Glasshouse-only screens: the 3D tour `/tour/[listingId]` (Must, Temuri), the activity feed `/feed` (Must), the demo pre-flight page `/demo/check` (GH-26).

### 2.1 Per-screen breakdown (top to bottom)

Labels in quotes are our own wording; use them as written rather than Airbnb's.

**Search** (`/search`)

- Components: brief box (one textarea, a mic button and "Find homes"); shortlist cards (photo, title, area, price per night, rating, 2-3 reason chips in the accent color, concerns, a "Verified by X-ray" badge); filter chips (city, guests); card grid.
- Fields: `listings.title`, `city`, `neighborhood`, `property_type`, `max_guests`, `bedrooms`, `beds`, `base_price_cents`, `rating`, `review_count`, first `listing_photos.url`.
- Actions: Find homes, change a filter, open a card.

**Listing page** (desktop: content left, booking card right and sticky; phones: one column with a sticky bottom bar)

- Title, then the photo grid with an "All photos" button (a dialog grouped by `room_label`).
- "Entire house in Kazbegi": guests, bedrooms, beds, baths; rating and review count; host card (avatar, "Your host: Giorgi").
- X-ray panel slot; description; amenities (10 icons, then "See all 14 amenities" in a dialog).
- "Walk through this home" slot and the floor plan card slot; "Ask this home" slot.
- Reviews: overall rating, six sub-rating bars (cleanliness, accuracy, check-in, communication, location, value), review cards (author, month, text).
- House rules: check-in after, checkout before, max guests, pets, smoking, parties, quiet hours. Location: city and area as text (no map).
- Booking card: price per night, check-in and checkout dates, guests, "Reserve", "Negotiate", price lines, "Payment is mocked: nothing is charged". "Negotiate" shows on every listing: whether a host negotiates is in `host_policies`, which the guest side never reads.

**Checkout:** a confirm dialog (dates, guests, price lines, "Confirm"); it creates the reservation and a feed event.

**Deal room:** header (listing, dates, guests, list total); timeline of `deal_messages` (actor badge for guest agent, host agent or system; type; amount); status chip; host approval banner. The guest's private maximum shows only on the guest side and never reaches the host side.

**Host dashboard:** "Needs you" (approvals, questions waiting, gap tasks), then one block per listing: 3D versions, capture launcher, agent rules form; activity feed on the side.

## 3. Entities for the schema

Checked against `supabase/migrations/0001_core.sql`: every entity the screens need exists.

| Airbnb entity                | Glasshouse table and columns                                                                                                                                                       | Status                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Users (guest, host)          | `profiles` (role, name, avatar_url)                                                                                                                                                | Covered; the role switcher replaces login |
| Listings                     | `listings` (title, description, city, neighborhood, lat/lng, property_type, max_guests, bedrooms, beds, baths, amenities, house_rules, house_manual, status, rating, review_count) | Covered                                   |
| Photos                       | `listing_photos` (url, room_label, sort, source)                                                                                                                                   | Covered                                   |
| Pricing                      | `listings.base_price_cents`, `weekend_price_cents`, `cleaning_fee_cents`, `currency`; the service fee lives in `computeQuote` (D-010)                                              | Covered                                   |
| Availability                 | `availability` (date, is_blocked, price_override_cents)                                                                                                                            | Covered                                   |
| Reservations                 | `reservations` (dates, guests, price lines, terms, status, deal_id)                                                                                                                | Covered                                   |
| Reviews with six sub-ratings | `reviews` (rating, sub_ratings jsonb: cleanliness, accuracy, check_in, communication, location, value, body)                                                                       | Covered; `ReviewSchema` in core.ts (GH-5) |
| Message threads              | `conversations` + `messages` (Q&A with sources); `deals` + `deal_messages` (negotiation)                                                                                           | Covered                                   |
| Glasshouse only              | `listing_facts`, `host_policies`, `captures`, `worlds`, `anchors`, `gaps`, `floor_plans`, `review_claims`, `deal_secrets`, `checkins`, `trip_briefs`, `events`                     | Covered                                   |

Settled in GH-5 (additive contract changes, docs/CONTRACTS.md):

1. Done: the amenity vocabulary from section 5 is the `Amenity` enum in `lib/schemas/core.ts`. `listings.amenities` stays jsonb and `ListingSchema` still says `string[]`, so validate with `Amenity.array()` where the words matter.
2. Done: `ReviewSchema` with the six sub-ratings as integers 1-5. It has no `id` or `created_at`; type rows read back with `Tables<"reviews">`.
3. Not covered, recommended to skip: the host card's bio, languages and years hosting (`profiles` has only name and avatar; the card shows those); cancellation policy, minimum nights and extra-guest fees (the demo is a 4-night stay and the price does not depend on guests); wishlists, payments, payouts and taxes.

## 4. Brand kit

- **Name:** Glasshouse. A glasshouse is a greenhouse: you can see everything inside.
- **Primary color:** `--brand` `#1f6f5c`, deep greenhouse green. Primary buttons (white text, 6.0:1), links, the logo, selected states.
- **Accent color:** `--brand-accent` `#2f6fde`, glass blue. Everything an agent did: agent badges, reason chips, agent bubbles in the deal room, focus rings (4.7:1 on white).
- **Reserved token:** `--honesty` `#f5a524`, amber, marks approximate or AI-filled areas in the 3D and on the floor plan; don't reuse the token for anything else. Warnings may still use Tailwind's amber scale, as the tickets ask (X-ray contradictions in GH-9, search concerns in GH-14, complaint pins in GH-24).
- **Neutrals:** `--background`, `--foreground` and Tailwind's neutral scale.
- **Dark scheme:** the brand colors are tuned for light backgrounds (brand text is 3.3:1 on the dark background). Fills keep the same colors; brand-colored text on dark needs a lighter tint (about `#4fb393` green, `#6b9cff` blue). GH-8 made the product light only for now (D-023): `app/globals.css` sets `color-scheme: light`, and `dark:` classes apply only under a `.dark` class, which nothing sets.
- **Font:** Inter (variable, weights 100-900), bundled in `app/fonts/InterVariable-latin.woff2` and loaded with `next/font/local` in `app/layout.tsx`, so no network is needed at build or run time (licence: `app/fonts/OFL.txt`). Latin only; Georgian text falls back to the system font.
- **Logo mark:** a house outline in brand green whose roof is a pane of glass (translucent glass blue with a white glint). Files: `public/logo-mark.svg` for the UI, `app/icon.svg` for the browser tab. Wordmark: "Glasshouse" in Inter semibold with tight tracking.
- **Never:** a coral or pink-red brand color, a loop-shaped logo, Airbnb's own terms ("Superhost", "Guest favorite", "AirCover") or its interface copy. Our labels: "Verified by X-ray", "Walk through this home", "Ask this home", "Your host", "Payment is mocked: nothing is charged".
- **For GH-8 (shadcn):** when adding shadcn's tokens, map `--primary: var(--brand)`, `--primary-foreground: #ffffff` and `--ring: var(--brand-accent)`.

The colors are in `app/globals.css` (`--brand`, `--brand-accent`, read by Tailwind 4's `@theme inline`): use `bg-brand`, `text-brand`, `bg-brand-accent`, `bg-honesty`.

## 5. Seed-data spec (for GH-7)

**Fixed values** (GH-7 seeds exactly these; GH-5 and GH-14 filter on them):

- **Cities** (`listings.city`, exact strings): `Tbilisi`, `Kazbegi`, `Batumi`, `Sighnaghi`. The area goes in `neighborhood`.
- **Property types** (`property_type`): `apartment`, `house`, `cabin`, `guesthouse`, `loft`.
- **Amenities** (`amenities`, snake_case, only these): `wifi`, `dedicated_workspace`, `kitchen`, `washer`, `dryer`, `dishwasher`, `coffee_maker`, `heating`, `air_conditioning`, `fireplace`, `free_parking`, `street_parking`, `elevator`, `tv`, `balcony`, `terrace`, `garden`, `bbq_grill`, `hot_tub`, `sauna`, `mountain_view`, `sea_view`, `city_view`, `self_check_in`, `crib`, `high_chair`. There is deliberately no `hair_dryer` (hero-1's unanswerable question) and no `sofa_bed` (lie 2).
- **House rules** (`house_rules`, the `HouseRulesSchema` keys): `pets` (true, false or a sentence), `smoking`, `parties`, `quiet_hours` (`"22:00-08:00"`), `check_in_after` and `check_out_before` (24-hour `"HH:MM"`).
- **House manual** (`house_manual`): one line per topic, starting with a label. The label, lower-cased and without the colon, is the source key "Ask this home" cites: `Wifi:` is `manual:wifi`, `Parking:` is `manual:parking`.
- **Hosts:** Giorgi hosts hero-1 and hero-2; Ana hosts the other ten (ids in `seed/fixtures.ts`).
- **Prices** are dollars in the tables below and cents in the database.

### Listings

Hero rows are placeholders until Temuri sends the real facts (GH-6); keep the hero-1 prices and policy, which come from `seed/fixtures.ts`. Titles are ours; write the descriptions in the same plain style.

| #   | Slug                               | Title                                                   | City / area                | Type       | Guests / bedrooms / beds / baths | Nightly / weekend / cleaning ($) | Negotiation (floor, max off, auto-accept; allowed extras)               | Photos from   | Role in the demo                                                                                                                    |
| --- | ---------------------------------- | ------------------------------------------------------- | -------------------------- | ---------- | -------------------------------- | -------------------------------- | ----------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `hero-1`                           | Stone house with a fireplace and a view of Mount Kazbek | Kazbegi / Stepantsminda    | house      | 4 / 2 / 3 / 1                    | 120 / none / 40                  | yes ($100, 15%, $490; late checkout, early check-in)                    | Temuri (GH-6) | Tops the brief's shortlist; Q&A; "$50 less" negotiation; 3D gap demo. Confirm the city with Temuri (the brief also accepts Tbilisi) |
| 2   | `hero-2`                           | Vera apartment with a desk and an open-plan kitchen     | Tbilisi / Vera             | apartment  | 2 / 1 / 1 / 1                    | 85 / 95 / 25                     | yes ($72, 15%, always ask)                                              | Temuri (GH-6) | Second real 3D home; sleeps 2, so not in the 4-guest brief (D-028)                                                                  |
| 3   | `batumi-sea-view-flat`             | Stunning sea view flat near the boulevard               | Batumi / New Boulevard     | apartment  | 3 / 1 / 2 / 1                    | 75 / 90 / 25                     | yes ($65, 10%, always ask)                                              | stock         | **Lie 1:** "stunning sea view", no photo shows the sea                                                                              |
| 4   | `sighnaghi-family-house`           | Family house with a garden, sleeps 6                    | Sighnaghi / Old Town       | house      | 6 / 2 / 4 / 1                    | 90 / 110 / 30                    | yes ($80, 10%, always ask)                                              | stock         | **Lie 2:** "sleeps 6", the photos show 4 single beds                                                                                |
| 5   | `kazbegi-gergeti-cabin`            | Wooden cabin under Gergeti with a fireplace             | Kazbegi / Gergeti          | cabin      | 4 / 1 / 2 / 1                    | 95 / 110 / 30                    | yes ($85, 10%, always ask)                                              | stock         | Brief runner-up: fireplace and view, but no workspace and slow wifi                                                                 |
| 6   | `kazbegi-alpine-chalet`            | Alpine chalet with a sauna and a hot tub                | Kazbegi / Stepantsminda    | house      | 8 / 4 / 5 / 3                    | 320 / 360 / 60                   | yes ($290, 10%, always ask)                                             | stock         | Out of the brief's budget ($320 is above GH-14's $288 cap); blocked on Nov 11 (date filter test)                                    |
| 7   | `kazbegi-stepantsminda-guesthouse` | Cozy guesthouse room in Stepantsminda                   | Kazbegi / Stepantsminda    | guesthouse | 2 / 1 / 1 / 1                    | 45 / 50 / 10                     | yes ($40, 10%, always ask)                                              | stock         | Filtered out of the brief (sleeps 2)                                                                                                |
| 8   | `tbilisi-sololaki-loft`            | Sololaki loft with a reading nook and fast wifi         | Tbilisi / Sololaki         | loft       | 4 / 2 / 2 / 1.5                  | 110 / 130 / 35                   | yes ($95, 12%, always ask)                                              | stock         | Partial match: workspace, fast wifi, cozy living room, but a city view                                                              |
| 9   | `tbilisi-vake-family-apartment`    | Family apartment in Vake with mountain views            | Tbilisi / Vake             | apartment  | 6 / 3 / 4 / 2                    | 95 / 95 / 30                     | **no** (`negotiable = false`; floor $95, 0%, always ask; late checkout) | stock         | Partial match: view and workspace, no fireplace. The non-negotiable listing (GH-15's "keeps the price, offers late checkout" case)  |
| 10  | `tbilisi-old-town-balcony-flat`    | Old Tbilisi flat with a carved wooden balcony           | Tbilisi / Old Tbilisi      | apartment  | 3 / 1 / 2 / 1                    | 60 / 70 / 20                     | yes ($52, 15%, always ask)                                              | stock         | Filler; filtered out of the brief (sleeps 3)                                                                                        |
| 11  | `batumi-old-town-studio`           | Compact studio in Old Batumi                            | Batumi / Old Batumi        | apartment  | 2 / 0 / 1 / 1                    | 40 / 50 / 15                     | yes ($35, 10%, always ask)                                              | stock         | Filler; blocked Nov 20-22 (date filter test)                                                                                        |
| 12  | `sighnaghi-vineyard-guesthouse`    | Vineyard guesthouse with a valley terrace               | Sighnaghi / Alazani Valley | guesthouse | 4 / 2 / 2 / 2                    | 70 / 85 / 20                     | yes ($60, 15%, always ask)                                              | stock         | Filler: vineyard terrace                                                                                                            |

All listings are `published`. Every policy has `max_rounds` 6; "always ask" means `auto_accept_total_cents` is null; allowed extras not listed are `[]`.

### Amenities and house rules

| Slug                               | Amenities                                                                                                                                                         | Pets                                       | Smoking / parties | Quiet hours | Check-in after / out before |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------- | ----------- | --------------------------- |
| `hero-1`                           | wifi, dedicated_workspace, kitchen, washer, heating, fireplace, free_parking, mountain_view, coffee_maker, self_check_in                                          | "One dog under 15 kg; tell the host first" | no / no           | 22:00-08:00 | 15:00 / 11:00               |
| `hero-2`                           | wifi, dedicated_workspace, kitchen, washer, air_conditioning, heating, tv                                                                                         | no                                         | no / no           | 23:00-08:00 | 14:00 / 11:00               |
| `batumi-sea-view-flat`             | wifi, kitchen, air_conditioning, balcony, sea_view, elevator, tv                                                                                                  | no                                         | no / no           | 23:00-08:00 | 14:00 / 12:00               |
| `sighnaghi-family-house`           | wifi, kitchen, heating, washer, garden, bbq_grill, free_parking, crib                                                                                             | yes                                        | no / no           | 22:00-08:00 | 15:00 / 11:00               |
| `kazbegi-gergeti-cabin`            | wifi, kitchen, heating, fireplace, terrace, free_parking, mountain_view                                                                                           | "Ask the host first"                       | no / no           | 22:00-08:00 | 14:00 / 11:00               |
| `kazbegi-alpine-chalet`            | wifi, dedicated_workspace, kitchen, washer, dryer, dishwasher, heating, fireplace, sauna, hot_tub, terrace, bbq_grill, free_parking, mountain_view, self_check_in | no                                         | no / no           | 22:00-08:00 | 16:00 / 10:00               |
| `kazbegi-stepantsminda-guesthouse` | wifi, heating, coffee_maker, mountain_view                                                                                                                        | no                                         | no / no           | 22:00-07:00 | 13:00 / 11:00               |
| `tbilisi-sololaki-loft`            | wifi, dedicated_workspace, kitchen, washer, dishwasher, air_conditioning, heating, coffee_maker, city_view, self_check_in, tv                                     | no                                         | no / no           | 23:00-08:00 | 15:00 / 11:00               |
| `tbilisi-vake-family-apartment`    | wifi, dedicated_workspace, kitchen, washer, dishwasher, air_conditioning, heating, elevator, free_parking, mountain_view, crib, high_chair, tv                    | no                                         | no / no           | 22:00-08:00 | 15:00 / 12:00               |
| `tbilisi-old-town-balcony-flat`    | wifi, kitchen, heating, air_conditioning, balcony, city_view, street_parking                                                                                      | yes                                        | no / no           | 23:00-08:00 | 14:00 / 11:00               |
| `batumi-old-town-studio`           | wifi, kitchen, air_conditioning, street_parking, self_check_in, tv                                                                                                | no                                         | no / no           | 23:00-08:00 | 14:00 / 11:00               |
| `sighnaghi-vineyard-guesthouse`    | wifi, kitchen, heating, coffee_maker, terrace, garden, bbq_grill, free_parking, mountain_view                                                                     | "Ask the host first"                       | no / no           | 22:00-08:00 | 14:00 / 11:00               |

### House manuals

Hero manuals are placeholders until Temuri sends the real ones (GH-7 data item 4).

- **`hero-1`** (every topic GH-7 lists; "Ask this home" quotes these lines):
  - `Wifi:` fibre, 100 Mbps down and 50 up; fine for video calls; the network name and password are on the fridge.
  - `Parking:` free parking for one car in the yard; the gate code comes from the host on arrival day.
  - `Heating:` gas boiler in the kitchen cupboard; the fireplace heats the living room; firewood is in the shed.
  - `Check-in:` self check-in from 15:00 with the lockbox by the door; the code arrives on the day.
  - `Pets:` one dog under 15 kg is welcome; tell the host first.
  - `Pharmacy:` the nearest pharmacy is a 5-minute walk down the main street.
  - `Trash:` bins at the gate; collection on Tuesday and Friday mornings.
- **`hero-2`:**
  - `Wifi:` fibre, 300 Mbps; the router is in the hallway.
  - `Parking:` paid street parking in front of the building; free on Sundays.
  - `Heating:` central heating; the thermostat is by the front door.
  - `Check-in:` from 14:00; the keys are in the lockbox at the building entrance.
  - `Pets:` no pets.
  - `Pharmacy:` a 24-hour pharmacy on the corner.
  - `Trash:` bins in the courtyard, any day.
- **The other ten** (short manuals: wifi, check-in, parking):

| Slug                               | Short manual                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `batumi-sea-view-flat`             | `Wifi:` 50 Mbps. `Check-in:` the host meets you in the lobby. `Parking:` paid underground parking next door.                          |
| `sighnaghi-family-house`           | `Wifi:` 30 Mbps. `Check-in:` the key is under the blue pot by the gate. `Parking:` free in the yard for two cars.                     |
| `kazbegi-gergeti-cabin`            | `Wifi:` 4G router, about 10 Mbps; not good for video calls. `Check-in:` the host meets you at the gate. `Parking:` free at the cabin. |
| `kazbegi-alpine-chalet`            | `Wifi:` fibre, 200 Mbps. `Check-in:` self check-in from 16:00 with a door code. `Parking:` free for three cars.                       |
| `kazbegi-stepantsminda-guesthouse` | `Wifi:` 20 Mbps in the common room. `Check-in:` reception from 13:00. `Parking:` free on the street.                                  |
| `tbilisi-sololaki-loft`            | `Wifi:` fibre, 500 Mbps. `Check-in:` self check-in from 15:00 with a smart lock. `Parking:` paid street parking.                      |
| `tbilisi-vake-family-apartment`    | `Wifi:` fibre, 300 Mbps. `Check-in:` the concierge has the keys from 15:00. `Parking:` free in the building's garage.                 |
| `tbilisi-old-town-balcony-flat`    | `Wifi:` 100 Mbps. `Check-in:` the host meets you at the courtyard door. `Parking:` street parking, often full.                        |
| `batumi-old-town-studio`           | `Wifi:` 100 Mbps. `Check-in:` self check-in with a keypad. `Parking:` paid street parking.                                            |
| `sighnaghi-vineyard-guesthouse`    | `Wifi:` 40 Mbps. `Check-in:` the family meets you at the house. `Parking:` free by the vineyard gate.                                 |

### Hero-1 details (placeholders until Temuri confirms)

- The description mentions the desk by the living-room window, the fireplace in the living room and the view of Mount Kazbek from the bedroom.
- **Facts:** one photo clearly shows the washing machine, so the X-ray finds a `washer` fact (`HERO_QA_FIXTURES` cites `fact:washer`, and Q&A has no amenity source). If the X-ray does not produce that key, GH-7 seeds it in `listing_facts`.
- Nothing in the listing, manual, photos or reviews mentions a hair dryer.
- **Availability:** no blocked dates in November.

### Lies for the X-ray (GH-9)

- **Lie 1, `batumi-sea-view-flat`:** the title and description say "stunning sea view" and `sea_view` is in the amenities. Six photos: living room, bedroom, kitchen, bathroom, a balcony that looks onto a courtyard and other buildings, the building entrance. No photo shows the sea or the shore.
- **Lie 2, `sighnaghi-family-house`:** the title and description say "sleeps 6" and `max_guests` is 6. The photos show two bedrooms with two single beds each (4 beds); no sofa bed or extra mattress appears in any photo or in the amenities.

### Photos, reviews and availability

- **Photos:** heroes use Temuri's own photos (with the owners' consent). The other ten use free-licence stock photos (Unsplash or Pexels licence), 4-6 per listing, named `NN-<room>.jpg` with the room in the name, credits recorded by GH-7. Never Airbnb photos.
- **Reviews:** 4-6 per listing; `rating` and the six `sub_ratings` are integers 1-5; `listings.rating` is the average (one decimal) and `review_count` the count. Write them in plain English, varied in length.
  - Hero-1 claims that can be pinned in 3D (GH-24 needs at least 5): complaints "the shower pressure in the bathroom is weak", "the small bedroom gets cold at night; the fireplace only heats the living room", "the sofa in the living room is too short to sleep on"; praise "woke up to Mount Kazbek from the bedroom window", "the desk by the living-room window was perfect for video calls".
  - Elsewhere: `tbilisi-old-town-balcony-flat` "the bedroom window faces a noisy street".
  - Reviews that back up the lies: `batumi-sea-view-flat` "nice flat, but we couldn't see the sea from the balcony" (accuracy 2); `sighnaghi-family-house` "only four single beds, two of us slept on the floor" (accuracy 2).
- **Availability:** every listing is free for the 60 days after the seed date, except `kazbegi-alpine-chalet` (blocked 2026-11-11) and `batumi-old-town-studio` (blocked 2026-11-20 to 2026-11-22).

### Expected result for the demo brief (for GH-14 tests)

Expected parse (`TripBriefSchema`):

| Field                             | Value                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `destinations`                    | `["Kazbegi", "Tbilisi"]`                                                                           |
| `check_in`, `check_out`, `nights` | `null` ("early November" names no dates; the demo dates come from the booking box and `DEMO_DEAL`) |
| `guests`                          | 4                                                                                                  |
| `budget`                          | `{ amount_cents: 6000, per: "night_per_person" }` ($240 a night for the group)                     |
| `must_haves`                      | `["dedicated_workspace", "mountain_view"]`                                                         |
| `nice_to_haves`                   | `["fireplace"]` ("a fireplace or a cozy living room")                                              |
| `deal_breakers`                   | `[]`                                                                                               |
| `work_needs`                      | not null, e.g. "one guest works remotely"                                                          |
| `pets`, `accessibility`           | `0`, `[]`                                                                                          |

GH-14's pre-filter keeps listings in Kazbegi or Tbilisi with `max_guests` of at least 4 and a nightly price up to 1.2 x budget ($288); with no dates, availability is not checked.

| Expected place | Slug                               | Why                                                                                       |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| 1              | `hero-1`                           | Every must-have and the fireplace; $120 a night, well under budget                        |
| 2-4            | `kazbegi-gergeti-cabin`            | Fireplace and mountain view; no workspace, slow wifi                                      |
| 2-4            | `tbilisi-vake-family-apartment`    | Workspace and mountain view; no fireplace                                                 |
| 2-4            | `tbilisi-sololaki-loft`            | Workspace and a cozy living room; city view only                                          |
| 5              | `hero-2`                           | Workspace; no fireplace or mountain view                                                  |
| out            | `kazbegi-stepantsminda-guesthouse` | Sleeps 2                                                                                  |
| out            | `tbilisi-old-town-balcony-flat`    | Sleeps 3                                                                                  |
| out            | `kazbegi-alpine-chalet`            | $320 a night is above the $288 cap (and with dates Nov 9-13 it is also blocked on Nov 11) |
| out            | Batumi and Sighnaghi listings      | Not in the brief's destinations                                                           |

Only first place is fixed; the agent orders places 2-4 by its own reasons.
