# GH-8: Core pages: search, listing page with slots, booking box + computeQuote, host dashboard, role switcher

> Offline copy of [GH-8](https://hacktoberfest.atlassian.net/browse/GH-8), taken 2026-10-17. Read the live ticket when the Atlassian MCP server is connected: Jira wins on scope and acceptance criteria. "In the starter" below wins on repo facts (paths, versions, dates).

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Beka | Story | High | 4-8 | GH-4, GH-5, GH-7 | `ui-pages`, `reverse-engineer-airbnb` |

Labels: frontend, hours-4-8, must-have

## In the starter

- Placeholder pages: `/search`, `/listing/[id]` (renders the four listing slots and `<ActivityFeed filter="listing">`), `/host/dashboard` (renders the four host slots and the feed). Header nav, React Query and sonner providers.
- `computeQuote` in `lib/pricing.ts` with tests (weekday stay, weekend rate, per-date override, discount, zero nights rejected, never negative) and `formatCents` in `lib/utils.ts`.
- Differences from the text below: the service fee is 10% of the host subtotal **after** the discount (D-010; demo total $528). The dashboard is `app/host/dashboard`.
- Left: the real UI, the role switcher (cookie), the booking box with Reserve, the rules form. Add shadcn components with `pnpm dlx shadcn@latest add card sheet dialog calendar tabs`.

---

## Goal

The Airbnb-like shell that every feature plugs into. It looks familiar, works on phone and laptop, and leaves slots for Temuri's components.

**Owner:** Beka · **When:** hours 4–8 · **Estimate:** 2.5–3h · **Depends on:** GH-4, GH-5, GH-7 · **Blocks:** GH-14, GH-15, GH-16 and all slot features

## Pages and components (all in Beka's folders)

### 1. Layout `app/layout.tsx`

- Header with the logo, the search entry point and the **role switcher**: "View as Guest (Nino) / Host (Giorgi)". It is stored in a cookie and read on the server; there is no real login.
- React Query provider and the toast system (sonner).

### 2. Search `/search` (`components/search/`)

- A trip brief box (textarea + mic button placeholder) at the top. GH-14 wires it to the guest agent.
- Until then, a card grid of all listings with photo, title, area, price per night, rating, and a coverage-score badge (empty until GH-21).
- Simple filters (city, guests) as fallback.

### 3. Listing page `/listing/[id]` (`components/listing/`)

- Gallery with a lightbox, title, host, key facts (guests, beds, baths), amenities, house rules, reviews with sub-ratings, location text.
- **Slots** from GH-5: `<XrayPanel/>`, `<TourLauncher/>`, `<FloorPlanCard/>`, `<AskThisHome/>`.
- A sidebar slot for `<ActivityFeed filter="listing"/>` (GH-12).
- A **sticky booking box:** check-in/out dates, guests, a live price breakdown from `computeQuote`, a **Reserve** button (mocked: creates a `reservations` row after a confirm dialog), and a **Negotiate** button (opens the GH-15 sheet; disabled until then).

### 4. Host dashboard `/host/dashboard`

- Sections: Approvals queue (GH-15), Questions waiting slot, Gap tasks slot, World versions slot, Capture launcher slot, Agent rules form (edits `host_policies`: negotiable, floor, max discount, auto-accept, allowed terms), Activity feed.

### 5. `computeQuote()` in `lib/pricing.ts`

- Nights = check-out minus check-in. Friday and Saturday nights use the weekend rate. A per-date `price_override_cents` wins.
- Service fee = 10% of (nights total + cleaning), rounded to whole cents. This is our own product setting.
- Discount is subtracted last; the total is never negative.
- **Unit tests** cover weekday only, a weekend mix, an override, a discount, and zero nights (which is rejected).

## Acceptance criteria

- [ ] All pages render with seed data on a phone (375 px) and a laptop with no horizontal scroll.
- [ ] Slot stubs render in place, so Temuri can replace them without touching these pages.
- [ ] Booking totals match `computeQuote` tests; Reserve creates a reservation and logs an event.
- [ ] The role switcher changes what the header and dashboard show.
- [ ] No Airbnb branding anywhere.

## Owns

`app/layout.tsx`, `app/(guest)/search`, `app/(guest)/listing/[id]`, `app/(host)/dashboard`, `components/ui`, `components/search`, `components/listing`, `lib/pricing.ts`

## Notes for Claude Code

Use shadcn components (Card, Sheet, Dialog, Calendar, Tabs). Ask for the booking box and `computeQuote` + tests first, then the pages.
