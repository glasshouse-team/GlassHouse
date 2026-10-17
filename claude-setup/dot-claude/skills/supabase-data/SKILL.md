---
name: supabase-data
description: Work with Glasshouse's Supabase - Postgres migrations, row level security, storage buckets, Realtime, type generation, idempotent seed and demo reset scripts. Use for GH-2 (setup), GH-5 (schema), GH-7 (seed data) and GH-26 (reset), and for any query, upload or subscription.
when_to_use: "set up Supabase", "migration", "add a table", "seed the database", "upload to storage", "public URL", "realtime subscription", "RLS", "reset the demo", "db types", "service role".
---

# Supabase data

Schema: `supabase/migrations/0001_core.sql`. Clients: `lib/supabase.ts`. Overview: docs/DATABASE.md.

## Two clients, two trust levels

- `supabaseAdmin()` uses the service-role key. **Server only:** API routes, server components, scripts. It bypasses row level security and is the only way to write data or read `host_policies` and `deal_secrets`.
- `supabaseBrowser()` uses the anon (publishable) key. Browser: public reads and Realtime subscriptions only.
- RLS is on for every table. Public read policies exist on non-secret tables. `host_policies`, `deal_secrets`, `captures` and `trip_briefs` have no policies at all.

## Migrations

- New change, new file: `supabase/migrations/0002_<what>.sql`. Never edit a migration that was applied.
- First time on a machine: `pnpm supabase login`, then `pnpm supabase link --project-ref <ref>` (the ref is in the project URL).
- Apply: `pnpm db:push`. Types: `pnpm db:types` (writes lib/database.types.ts; commit it).
- New table checklist: `enable row level security`; a public read policy only if nothing secret is in it; add it to the `supabase_realtime` publication if the UI needs live updates.

## Conventions

- Money: integer cents. Dates: `date` columns as "YYYY-MM-DD" strings. Timestamps: `timestamptz`.
- jsonb for agent outputs (facts, contradictions, sources, terms); validate with the Zod schemas in lib/schemas before writing and after reading.
- Every write that a person or agent does also calls `logEvent` (lib/events.ts).

## Storage

- `media` (public): listing photos, prepared walkthrough mp4s, splats, meshes, screenshots, floor plan SVGs. World Labs downloads inputs from here, so the URL must open in an incognito window.
- `captures` (private): raw walkthroughs and check-in videos.
- Paths: `listings/{listing_id}/photos/{photo_id}.jpg`, `worlds/{world_id}/scene-web.spz | scene-hq.spz | collider.glb | pano.jpg | floorplan.svg | screens/{view}.jpg`, `captures/{listing_id}/{capture_id}/raw.mp4`.
- Server upload: `supabaseAdmin().storage.from("media").upload(path, buffer, { contentType, upsert: true })`. Public URL: `publicMediaUrl(path)`.
- Big uploads from a phone: the server creates `createSignedUploadUrl(path)`, the browser calls `uploadToSignedUrl(path, token, file)`. Never send the service key to the browser.

## Realtime

```ts
const channel = supabaseBrowser()
  .channel(`deal-${dealId}`)
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "deal_messages", filter: `deal_id=eq.${dealId}` },
    (payload) => addMessage(payload.new),
  )
  .subscribe();
return () => {
  supabaseBrowser().removeChannel(channel);
};
```

Tables in the publication: events, deal_messages, deals, worlds, gaps. Realtime respects RLS, so subscribed tables need the public read policy.

## Seed (GH-7) and reset (GH-26)

- `scripts/seed.ts`: upsert by `listings.slug` (`.upsert(rows, { onConflict: "slug" })`) so it can run many times; profiles by a fixed uuid. Demo numbers come from `seed/fixtures.ts`; never retype them.
- Hero home 1 must keep `weekend_price_cents = null` so the demo dates (Mon Nov 9 to Fri Nov 13, 2026) price at $520.
- `scripts/reset-demo.ts`: delete rows created after the seed (deals cascade to deal_messages and deal_secrets), restore the hero policy, publish Hero 1 v1 (the gap version), print "Demo ready". Run it before every rehearsal.

## Setup (GH-2)

Project in an EU region; keys from Project Settings > API: URL, publishable (anon) key, secret (service role) key, into `.env.local` and Vercel. New Supabase projects show "publishable" and "secret" keys; the legacy anon and service_role keys work the same way. Steps: docs/SETUP.md.
