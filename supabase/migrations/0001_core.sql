-- =============================================================================
-- 0001_core.sql — Glasshouse core schema
-- CONTRACT FILE (GH-5, owner: Beka; Temuri reviews). Draft from the project plan.
--
-- Before it is applied: review, adjust, then `pnpm db:push` and `pnpm db:types`.
-- After it is applied: NEVER edit this file. Add supabase/migrations/0002_<name>.sql.
--
-- Conventions: money in integer cents, dates as `date`, ids are uuid.
-- Security: RLS is ON everywhere. The browser (anon key) can only READ non-secret
-- tables. All writes go through API routes with the service-role key.
-- host_policies and deal_secrets have no policies at all: server only.
-- =============================================================================

-- gen_random_uuid() is built into Postgres 13+, so no extension is needed.

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  role        text not null check (role in ('guest', 'host')),
  name        text not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create table public.listings (
  id                   uuid primary key default gen_random_uuid(),
  host_id              uuid not null references public.profiles (id) on delete cascade,
  slug                 text not null unique,
  title                text not null,
  description          text not null default '',
  city                 text not null,
  neighborhood         text,
  lat                  double precision,
  lng                  double precision,
  property_type        text not null default 'apartment',
  max_guests           int not null check (max_guests > 0),
  bedrooms             int not null default 1 check (bedrooms >= 0),
  beds                 int not null default 1 check (beds >= 0),
  baths                numeric(3, 1) not null default 1 check (baths >= 0),
  base_price_cents     int not null check (base_price_cents > 0),
  weekend_price_cents  int check (weekend_price_cents > 0),   -- null = same as base
  cleaning_fee_cents   int not null default 0 check (cleaning_fee_cents >= 0),
  currency             text not null default 'USD',
  amenities            jsonb not null default '[]'::jsonb,
  house_rules          jsonb not null default '{}'::jsonb,
  house_manual         text not null default '',
  status               text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_world_id   uuid,                                   -- FK added after worlds
  rating               numeric(2, 1),
  review_count         int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index listings_city_idx on public.listings (city);

create table public.listing_photos (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  url         text not null,
  room_label  text,
  sort        int not null default 0,
  source      text not null default 'upload' check (source in ('upload', 'capture_frame')),
  created_at  timestamptz not null default now()
);
create index listing_photos_listing_idx on public.listing_photos (listing_id, sort);

create table public.availability (
  listing_id            uuid not null references public.listings (id) on delete cascade,
  date                  date not null,
  is_blocked            boolean not null default false,
  price_override_cents  int check (price_override_cents > 0),
  primary key (listing_id, date)
);

-- Verifier X-ray output (GH-9)
create table public.listing_facts (
  listing_id      uuid primary key references public.listings (id) on delete cascade,
  facts           jsonb not null default '[]'::jsonb,
  contradictions  jsonb not null default '[]'::jsonb,
  missing_photos  jsonb not null default '[]'::jsonb,
  model           text,
  created_at      timestamptz not null default now()
);

-- Host rules for the host agent. SERVER ONLY (no RLS policies).
create table public.host_policies (
  listing_id               uuid primary key references public.listings (id) on delete cascade,
  negotiable               boolean not null default true,
  floor_nightly_cents      int not null check (floor_nightly_cents > 0),
  max_discount_pct         int not null default 15 check (max_discount_pct between 0 and 100),
  auto_accept_total_cents  int check (auto_accept_total_cents > 0),
  long_stay_rules          jsonb not null default '[]'::jsonb,
  gap_night_pct            int not null default 0 check (gap_night_pct between 0 and 100),
  max_rounds               int not null default 6 check (max_rounds between 1 and 20),
  allowed_terms            jsonb not null default '[]'::jsonb,
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Capture and 3D
-- ---------------------------------------------------------------------------
create table public.captures (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings (id) on delete cascade,
  kind            text not null check (kind in ('walkthrough', 'fill_in', 'checkin')),
  raw_url         text,
  prepared_url    text,
  duration_s      numeric,
  size_bytes      bigint,
  room_markers    jsonb not null default '[]'::jsonb,   -- [{ room, t }]
  heading_track   jsonb not null default '[]'::jsonb,   -- [{ t, heading }]
  quality_flags   jsonb not null default '[]'::jsonb,
  transcript      text,
  gap_id          uuid,                                 -- FK added after gaps
  status          text not null default 'uploaded' check (status in ('uploading', 'uploaded', 'prepared', 'failed')),
  created_at      timestamptz not null default now()
);
create index captures_listing_idx on public.captures (listing_id, created_at desc);

-- One row per generated version of a whole house. Assets are copied into OUR storage.
create table public.worlds (
  id                   uuid primary key default gen_random_uuid(),
  listing_id           uuid not null references public.listings (id) on delete cascade,
  version              int not null check (version > 0),
  status               text not null default 'queued'
                       check (status in ('queued', 'generating', 'ready', 'failed', 'published', 'archived')),
  model                text,
  input_kind           text check (input_kind in ('video', 'multi-image', 'image', 'text')),
  input_capture_ids    uuid[] not null default '{}',
  marble_world_id      text,
  operation_id         text,
  spz_url              text,
  spz_hq_url           text,
  collider_mesh_url    text,
  hq_mesh_url          text,
  pano_url             text,
  thumbnail_url        text,
  caption              text,
  metric_scale_factor  double precision,
  ground_plane_offset  double precision,
  coverage_score       numeric(4, 3) check (coverage_score between 0 and 1),
  cost_credits         int,
  error                text,
  created_at           timestamptz not null default now(),
  ready_at             timestamptz,
  published_at         timestamptz,
  unique (listing_id, version)
);

alter table public.listings
  add constraint listings_published_world_fk
  foreign key (published_world_id) references public.worlds (id) on delete set null;

create table public.anchors (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null references public.worlds (id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('room', 'object', 'viewpoint')),
  room        text,
  position    jsonb not null,            -- { x, y, z } in meters
  look_at     jsonb,
  source      text not null default 'manual' check (source in ('auto', 'manual')),
  created_at  timestamptz not null default now()
);
create index anchors_world_idx on public.anchors (world_id);

create table public.gaps (
  id                 uuid primary key default gen_random_uuid(),
  world_id           uuid not null references public.worlds (id) on delete cascade,
  room               text,
  issue              text not null check (issue in ('blank', 'smeared', 'stretched', 'invented', 'dark')),
  description        text not null,
  severity           int not null check (severity between 1 and 3),
  position           jsonb,
  view_dir           jsonb,
  radius_m           double precision not null default 1.0 check (radius_m > 0),
  screenshot_url     text,
  status             text not null default 'open' check (status in ('open', 'requested', 'filled', 'dismissed')),
  filled_by_capture  uuid references public.captures (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index gaps_world_idx on public.gaps (world_id, status);

alter table public.captures
  add constraint captures_gap_fk
  foreign key (gap_id) references public.gaps (id) on delete set null;

create table public.floor_plans (
  id             uuid primary key default gen_random_uuid(),
  world_id       uuid not null references public.worlds (id) on delete cascade,
  svg_url        text,
  rooms          jsonb not null default '[]'::jsonb,
  walls          jsonb not null default '[]'::jsonb,
  doors          jsonb not null default '[]'::jsonb,
  total_area_m2  numeric,
  scale_source   text,
  version        text not null default 'v1' check (version in ('v1', 'v2')),
  status         text not null default 'ready' check (status in ('building', 'ready', 'failed')),
  created_at     timestamptz not null default now()
);
create index floor_plans_world_idx on public.floor_plans (world_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  guest_id     uuid references public.profiles (id) on delete set null,
  author_name  text,
  rating       int not null check (rating between 1 and 5),
  sub_ratings  jsonb not null default '{}'::jsonb,   -- cleanliness, accuracy, check_in, communication, location, value
  body         text not null,
  created_at   timestamptz not null default now()
);
create index reviews_listing_idx on public.reviews (listing_id);

create table public.review_claims (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews (id) on delete cascade,
  claim       text not null,
  sentiment   text not null check (sentiment in ('positive', 'negative', 'neutral')),
  room        text,
  anchor_id   uuid references public.anchors (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Deals, bookings, conversations
-- ---------------------------------------------------------------------------
create table public.deals (
  id                   uuid primary key default gen_random_uuid(),
  listing_id           uuid not null references public.listings (id) on delete cascade,
  guest_id             uuid not null references public.profiles (id) on delete cascade,
  check_in             date not null,
  check_out            date not null,
  guests               int not null check (guests > 0),
  status               text not null default 'open'
                       check (status in ('open', 'agreed_pending_host', 'escalated', 'approved', 'declined', 'expired')),
  list_total_cents     int not null check (list_total_cents > 0),
  current_offer_cents  int,
  final_total_cents    int,
  final_terms          jsonb not null default '{}'::jsonb,
  rounds               int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (check_out > check_in)
);
create index deals_listing_idx on public.deals (listing_id, created_at desc);

-- The guest's private limits. SERVER ONLY (no RLS policies). Only the guest agent reads it.
create table public.deal_secrets (
  deal_id             uuid primary key references public.deals (id) on delete cascade,
  guest_target_cents  int,
  guest_max_cents     int not null check (guest_max_cents > 0)
);

create table public.deal_messages (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id) on delete cascade,
  actor         text not null check (actor in ('guest_agent', 'host_agent', 'guest', 'host', 'system')),
  type          text not null check (type in ('question', 'offer', 'counter', 'accept', 'decline', 'escalate', 'info', 'rejected')),
  amount_cents  int,
  terms         jsonb not null default '{}'::jsonb,
  body          text not null default '',
  created_at    timestamptz not null default now()
);
create index deal_messages_deal_idx on public.deal_messages (deal_id, created_at);

create table public.reservations (
  id                   uuid primary key default gen_random_uuid(),
  listing_id           uuid not null references public.listings (id) on delete cascade,
  guest_id             uuid not null references public.profiles (id) on delete cascade,
  deal_id              uuid references public.deals (id) on delete set null,
  check_in             date not null,
  check_out            date not null,
  guests               int not null check (guests > 0),
  nightly_total_cents  int not null,
  cleaning_cents       int not null,
  discount_cents       int not null default 0,
  service_fee_cents    int not null,
  total_cents          int not null,
  terms                jsonb not null default '{}'::jsonb,
  status               text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  created_at           timestamptz not null default now(),
  check (check_out > check_in)
);
create index reservations_listing_idx on public.reservations (listing_id, check_in);

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  guest_id    uuid references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('qa', 'concierge')),
  created_at  timestamptz not null default now()
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  actor            text not null check (actor in ('guest', 'guest_agent', 'host', 'host_agent', 'system')),
  body             text not null,
  sources          jsonb not null default '[]'::jsonb,   -- [{ type: fact|rule|manual, key, quote }]
  needs_host       boolean not null default false,
  answered_by      text,
  created_at       timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_needs_host_idx on public.messages (needs_host) where needs_host;

create table public.checkins (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations (id) on delete cascade,
  capture_id      uuid references public.captures (id) on delete set null,
  report          jsonb,
  status          text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  created_at      timestamptz not null default now()
);

create table public.trip_briefs (
  id          uuid primary key default gen_random_uuid(),
  guest_id    uuid references public.profiles (id) on delete set null,
  body        text not null,
  parsed      jsonb,
  results     jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Activity feed: every agent and human action (GH-12)
-- ---------------------------------------------------------------------------
create table public.events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_type  text not null check (actor_type in ('human', 'agent', 'system')),
  actor_name  text not null,
  agent       text check (agent in ('guest', 'host', 'verifier')),
  action      text not null,
  listing_id  uuid references public.listings (id) on delete cascade,
  deal_id     uuid references public.deals (id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  summary     text not null check (char_length(summary) <= 140)
);
create index events_created_idx on public.events (created_at desc);
create index events_listing_idx on public.events (listing_id, created_at desc);
create index events_deal_idx on public.events (deal_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();
create trigger host_policies_updated_at before update on public.host_policies
  for each row execute function public.set_updated_at();
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: on for every table; public READ only where it is safe.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'listings', 'listing_photos', 'availability', 'listing_facts', 'host_policies',
    'captures', 'worlds', 'anchors', 'gaps', 'floor_plans', 'reviews', 'review_claims', 'deals',
    'deal_secrets', 'deal_messages', 'reservations', 'conversations', 'messages', 'checkins',
    'trip_briefs', 'events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- No policies on host_policies, deal_secrets, captures (private videos), trip_briefs.
  foreach t in array array[
    'profiles', 'listings', 'listing_photos', 'availability', 'listing_facts', 'worlds',
    'anchors', 'gaps', 'floor_plans', 'reviews', 'review_claims', 'deals', 'deal_messages',
    'reservations', 'conversations', 'messages', 'checkins', 'events'
  ] loop
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supabase-only setup (skipped on plain Postgres)
-- ---------------------------------------------------------------------------
do $$
begin
  -- Realtime for the live feed, deal room, world status and gap pins.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.events, public.deal_messages, public.deals, public.worlds, public.gaps;
  end if;

  -- Storage: `media` is public (World Labs must fetch inputs without login), `captures` is private.
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('media', 'media', true), ('captures', 'captures', false)
    on conflict (id) do nothing;
  end if;
end;
$$;
