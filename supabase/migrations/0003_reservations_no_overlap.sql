-- =============================================================================
-- 0003_reservations_no_overlap.sql — two confirmed bookings of a home never overlap (GH-15).
-- The app checks before booking, but two requests (two approvals, Reserve + an approval) can
-- pass that check together. This makes the database refuse the second one (error 23P01).
-- Apply with `pnpm db:push` after this PR merges; no column changes, so no db:types diff.
-- =============================================================================

create extension if not exists btree_gist;

alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (listing_id with =, daterange(check_in, check_out) with &&)
  where (status = 'confirmed');
