-- =============================================================================
-- 0002_world_spots.sql — one 3D world per room spot (D-009, GH-3)
-- Agreed by Beka and Temuri on 2026-10-18. Apply with `pnpm db:push`, then
-- `pnpm db:types` (lib/database.types.ts already matches this file).
--
-- A home version is now a set of spot worlds, one per room spot (an 8-photo ring),
-- linked by doorway arrows that our viewer draws: `links` holds, for each doorway,
-- the spot it leads to and its direction from this spot (degrees clockwise from the
-- spot's first ring photo). `listings.published_world_id` points at the entry spot
-- of the published version. Captures gain the `ring` kind for photo rings.
-- =============================================================================

alter table public.worlds
  add column spot       text  not null default 'main',
  add column spot_label text,
  add column links      jsonb not null default '[]'::jsonb;   -- [{ to, azimuth }]

-- unique (listing_id, version) becomes unique (listing_id, version, spot).
-- The old constraint has a generated name, so find it by its definition.
do $$
declare
  old_name text;
begin
  select conname into old_name
  from pg_constraint
  where conrelid = 'public.worlds'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (listing_id, version)';
  if old_name is not null then
    execute format('alter table public.worlds drop constraint %I', old_name);
  end if;
end $$;

alter table public.worlds
  add constraint worlds_listing_version_spot_key unique (listing_id, version, spot);

-- captures.kind gains 'ring' (the per-spot photo ring).
do $$
declare
  old_name text;
begin
  select conname into old_name
  from pg_constraint
  where conrelid = 'public.captures'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%kind%walkthrough%';
  if old_name is not null then
    execute format('alter table public.captures drop constraint %I', old_name);
  end if;
end $$;

alter table public.captures
  add constraint captures_kind_check
  check (kind in ('walkthrough', 'ring', 'fill_in', 'checkin'));
