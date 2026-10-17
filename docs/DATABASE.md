# Database

Supabase Postgres. Schema: `supabase/migrations/0001_core.sql` (applied in GH-5: 22 tables, constraints, RLS, cascades; generated types in `lib/database.types.ts`, rerun `pnpm db:types` after every migration). Conventions: money in integer cents, `date` for stay dates, uuid ids, `timestamptz` timestamps, jsonb for agent outputs (validated with Zod).

## Tables

| Group              | Tables                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| People             | `profiles` (guest or host)                                                                                                  |
| Listings           | `listings`, `listing_photos`, `availability` (per-date block and price), `listing_facts` (X-ray), `host_policies` (private) |
| 3D                 | `captures`, `worlds` (one row per version), `anchors`, `gaps`, `floor_plans`                                                |
| Reviews            | `reviews` (six sub-ratings), `review_claims`                                                                                |
| Deals and bookings | `deals`, `deal_secrets` (private), `deal_messages`, `reservations`                                                          |
| Conversations      | `conversations`, `messages` (sources, needs_host)                                                                           |
| Trips              | `checkins`, `trip_briefs`                                                                                                   |
| Feed               | `events` (summary at most 140 characters)                                                                                   |

## Security model

- Row level security is on for every table.
- Public **read** policy on non-secret tables, so the browser can render pages and subscribe to Realtime with the anon key.
- **No policies at all** on `host_policies`, `deal_secrets`, `captures` and `trip_briefs`: only the server (service role) reads them. This is what keeps the host's minimum and the guest's maximum away from the other side, even with the anon key.
- All writes go through API routes with `supabaseAdmin()`.

## Realtime

Published tables: `events`, `deal_messages`, `deals`, `worlds`, `gaps`, `messages` (Q&A answers). Subscribe with `supabaseBrowser().channel(...).on("postgres_changes", ...)` (supabase-data skill).

## Storage

- `media` (public): photos, prepared videos (World Labs fetches them), splats, meshes, screenshots, floor plans.
- `captures` (private): raw walkthroughs and check-in videos.
  The migration creates both buckets when it runs on Supabase.

## Workflow

1. `pnpm supabase login`, then `pnpm supabase link --project-ref <ref>` (once per machine).
2. `pnpm db:push` applies new migrations.
3. `pnpm db:types` regenerates `lib/database.types.ts`.
4. Never edit an applied migration; add `supabase/migrations/000N_<name>.sql`.
