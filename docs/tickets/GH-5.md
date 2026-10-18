# GH-5: Shared contracts: DB schema, Zod types, logEvent, page slots, tour API, agent core (Temuri reviews)

> The ticket text below the line is a copy of [GH-5](https://hacktoberfest.atlassian.net/browse/GH-5) from Jira (2026-10-17); for scope and acceptance criteria, Jira wins. The sections above the line are repo facts Jira does not have (**In the starter**, **Build notes**, **Needs from people**), and `/start-ticket` reads them every time.

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Beka | Task | Highest | 2-4 | GH-2, GH-4 | `shared-contracts`, `supabase-data` |

Labels: backend, contracts, hours-2-4, must-have

## In the starter

- A complete draft to review together (not applied to Supabase yet): `supabase/migrations/0001_core.sql` (22 tables, tested on Postgres 18), Zod schemas in `lib/schemas/core.ts`, `world.ts` and `verifier.ts`, a working `logEvent`, `computeQuote` (implemented and tested), `createAgent` (implemented and tested), the context builder stubs, all 8 slot stubs already rendered on the listing page and host dashboard, the `useTour()` type in `components/tour/TourContext.tsx`, and docs/CONTRACTS.md.
- Differences from the text below: RLS is on, with public read on non-secret tables and no policies on `host_policies`, `deal_secrets`, `captures` and `trip_briefs` (D-006). `deal_messages.type` adds `rejected` (validator notes). `computeQuote` takes no `guests` (the price doesn't depend on it) and also returns `hostSubtotalCents`. `createAgent` also takes `listingId`, `dealId` and `toolsContext`. The migration also creates the storage buckets and the Realtime publication entries.
- Left: review the draft together, `pnpm db:push`, `pnpm db:types`, commit `lib/database.types.ts`, post "Contracts frozen".

## Build notes

- The draft migration now also has `unique (listing_id, sort)` on `listing_photos`, one live deal per guest and listing (partial unique index) and `messages` in Realtime, so Q&A answers appear live. Review it, then `pnpm db:push`.
- Contracts 9 to 14 in docs/CONTRACTS.md came out of the ticket review (askHome, uploads, demo ids, viewer, tour add-ons, coordinates); review them with the rest.
- If `pnpm db:types` fails, the `>` redirect leaves an empty `lib/database.types.ts`: restore it from git and fix the link first.

## Needs from people

- Both developers review and approve; the Supabase database password for `db push`.

---

## Goal

Define everything both halves of the app depend on **before** parallel work starts, so the two of you never edit each other's files. After this PR merges (target: hour 4), contract files change only through a PR approved by both.

**Owner:** Beka (Temuri reviews and adds his stubs on the same branch) · **When:** hours 2–4 · **Estimate:** 2h · **Depends on:** GH-2, GH-4 · **Blocks:** all feature tickets

## 1. Database migration: `supabase/migrations/0001_core.sql` (Beka)

Prices are stored in cents. Tables and their key columns (the full DDL is in the plan doc):

- `profiles` (id, role guest|host, name, avatar_url)
- `listings` (id, host_id, slug, title, description, city, neighborhood, lat, lng, property_type, max_guests, bedrooms, beds, baths, base_price_cents, weekend_price_cents, cleaning_fee_cents, currency, amenities jsonb, house_rules jsonb, house_manual text, status, published_world_id)
- `listing_photos` (id, listing_id, url, room_label, sort, source upload|capture_frame)
- `availability` (listing_id, date, is_blocked, price_override_cents)
- `listing_facts` (listing_id pk, facts jsonb, contradictions jsonb, missing_photos jsonb, model, created_at): X-ray output
- `host_policies` (listing_id pk, negotiable, floor_nightly_cents, max_discount_pct, auto_accept_total_cents, long_stay_rules jsonb, gap_night_pct, max_rounds default 6, allowed_terms jsonb). **The guest agent never reads this.**
- `captures` (id, listing_id, kind walkthrough|fill_in|checkin, raw_url, prepared_url, duration_s, size_bytes, room_markers jsonb, heading_track jsonb, quality_flags jsonb, transcript, gap_id, status)
- `worlds` (id, listing_id, version, status queued|generating|ready|failed|published|archived, model, input_kind, input_capture_ids uuid[], marble_world_id, operation_id, spz_url, spz_hq_url, collider_mesh_url, hq_mesh_url, pano_url, caption, metric_scale_factor, ground_plane_offset, coverage_score, error, timestamps, unique(listing_id, version))
- `anchors` (id, world_id, name, kind room|object|viewpoint, room, position jsonb {x,y,z}, look_at jsonb, source auto|manual)
- `gaps` (id, world_id, room, issue blank|smeared|stretched|invented|dark, description, severity 1–3, position jsonb, view_dir jsonb, radius_m, screenshot_url, status open|requested|filled|dismissed, filled_by_capture)
- `floor_plans` (id, world_id, svg_url, rooms jsonb, walls jsonb, doors jsonb, total_area_m2, scale_source, version v1|v2, status)
- `reviews` (id, listing_id, guest_id, rating, sub_ratings jsonb, body) and `review_claims` (id, review_id, claim, sentiment, room, anchor_id)
- `deals` (id, listing_id, guest_id, check_in, check_out, guests, status open|agreed_pending_host|escalated|approved|declined|expired, list_total_cents, current_offer_cents, final_total_cents, rounds)
- `deal_secrets` (deal_id pk, guest_target_cents, guest_max_cents). **Only the guest agent reads this.**
- `deal_messages` (id, deal_id, actor guest_agent|host_agent|guest|host|system, type question|offer|counter|accept|decline|escalate|info, amount_cents, terms jsonb, body, created_at)
- `reservations` (id, listing_id, guest_id, deal_id, check_in, check_out, guests, nightly_total_cents, cleaning_cents, service_fee_cents, discount_cents, total_cents, status)
- `conversations` (id, listing_id, guest_id, kind qa|concierge) and `messages` (id, conversation_id, actor, body, sources jsonb, needs_host bool, answered_by, created_at)
- `checkins` (id, reservation_id, capture_id, report jsonb, status)
- `trip_briefs` (id, guest_id, body, parsed jsonb, results jsonb)
- `events` (id bigserial, created_at, actor_type human|agent|system, actor_name, agent guest|host|verifier, action, listing_id, deal_id, payload jsonb, summary)

Then:

- Enable Realtime on `events`, `deal_messages`, `deals`, `worlds`, `gaps`.
- Leave RLS off for the hackathon.
- Run `supabase gen types typescript > lib/database.types.ts`.

## 2. Shared code contracts

```ts
// lib/events.ts (Beka)
logEvent(e: {
  actor_type: 'human' | 'agent' | 'system'; actor_name: string;
  agent?: 'guest' | 'host' | 'verifier'; action: string; summary: string;
  listing_id?: string; deal_id?: string; payload?: unknown
}): Promise<void>

// lib/pricing.ts (Beka): signature now, implementation in GH-8
computeQuote(i: { listing: Listing; checkIn: string; checkOut: string;
  guests: number; discountCents?: number }): Quote
// Quote = { nights, nightlyTotalCents, cleaningCents, serviceFeeCents, discountCents, totalCents }

// agents/core.ts (Beka)
createAgent(o: { name: 'guest' | 'host' | 'verifier'; system: string;
  tools: Record<string, Tool>; model?: 'agent' | 'bulk'; maxSteps?: number }): ToolLoopAgent
// agents/context.ts (Beka)
buildHostContext(listingId: string, mode: 'qa' | 'negotiate'): Promise<HostContext>  // policy only in 'negotiate'
buildGuestContext(dealId: string): Promise<GuestContext>                              // includes deal_secrets
```

## 3. Zod schemas

- `lib/schemas/core.ts` (Beka): Listing, HostPolicy, TripBrief, Deal, DealMessage, Quote, Event.
- `lib/schemas/world.ts` (Temuri): World, Anchor, Gap, FloorPlan, Capture.
- `lib/schemas/verifier.ts` (Temuri): XrayResult, GapCheckResult.

## 4. Page slots: Temuri's components rendered inside Beka's pages

Temuri commits **stub versions** (a card with "Coming soon") on this branch so the imports compile from day one.

| Slot | Component file (Temuri owns) | Rendered in (Beka owns) |
| --- | --- | --- |
| X-ray panel | `components/xray/XrayPanel.tsx` `({listingId})` | Listing page |
| 3D launcher | `components/tour/TourLauncher.tsx` `({listingId})` | Listing page |
| Floor plan card | `components/floorplan/FloorPlanCard.tsx` `({listingId})` | Listing page |
| Ask this home | `components/ask-home/AskThisHome.tsx` `({listingId})` | Listing page |
| Questions waiting | `components/ask-home/QuestionsWaiting.tsx` `({hostId})` | Host dashboard |
| Gap tasks | `components/gaps/GapTasks.tsx` `({listingId})` | Host dashboard |
| World versions | `components/tour/WorldVersions.tsx` `({listingId})` | Host dashboard |
| Capture launcher | `components/capture/CaptureLauncher.tsx` `({listingId})` | Host dashboard |

## 5. Tour extension API (Temuri implements in GH-11; agree on it now)

```ts
// components/tour/TourContext.tsx
useTour(): {
  ready: boolean; worldId: string; scene: THREE.Scene; camera: THREE.Camera;
  anchors: Anchor[]; gaps: Gap[];
  flyTo(anchorId: string): Promise<void>; lookAt(p: Vec3): Promise<void>;
  highlightRoom(name: string | null): void;
  addOverlay(obj: THREE.Object3D): () => void   // returns a remove function
}
```

Beka's add-ons on top of the tour (Ask the space panel, honesty overlay) live in `components/tour-ext/` and only use this hook. They never edit `components/tour/`.

## Acceptance criteria

- [ ] Migration applied to Supabase; types generated and committed.
- [ ] All contract files exist with signatures (bodies may be `TODO` except `logEvent`, which works).
- [ ] All 8 slot stubs render on the listing page and host dashboard without errors.
- [ ] PR approved by **both** developers; merged by hour 4.
- [ ] A comment in this ticket says "Contracts frozen" with the merge commit hash.

## Rule after merge

Need a new column? Add a **new** migration file (`0002_<name>.sql`), never edit `0001`, and post a message to the other developer.

## Decision updates

- 2026-10-18 D-009: (agreed by Beka and Temuri, migration `0002_world_spots.sql`) A home version has one world per spot: `worlds` gains `spot` (text) and `links` (jsonb, `[{ to, azimuth }]`), unique on (listing_id, version, spot); `listings.published_world_id` points at the entry spot of the published version; `captures.kind` gains `ring`. `useTour()` keeps its names; `flyTo` may switch spots. 0001 is applied, so this is a new `supabase/migrations/0002_<name>.sql` that drops `unique (listing_id, version)` and widens the `captures.kind` check, then `pnpm db:types` and a CONTRACTS.md change-log row; not additive, so both developers approve it (was: one world per home version). Jira: updated
