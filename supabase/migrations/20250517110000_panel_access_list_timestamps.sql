-- Existing deployments may have panel_access_list without timestamp columns.
-- CREATE TABLE IF NOT EXISTS does not add columns to an already-created table.

alter table public.panel_access_list
  add column if not exists created_at timestamptz not null default now();

alter table public.panel_access_list
  add column if not exists updated_at timestamptz not null default now();

-- Backfill any nulls if columns existed but were nullable (defensive).
update public.panel_access_list
set
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where created_at is null or updated_at is null;
