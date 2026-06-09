-- API keys for public /api/v1 integration (linked to panel operator users).

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key_prefix text not null,
  secret_hash text not null,
  linked_user_id uuid not null,
  scopes text[] not null default '{}',
  is_active boolean not null default true,
  revoked_at timestamptz,
  last_used_at timestamptz,
  spread_bps_override int,
  max_amount_brl text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint api_keys_key_prefix_unique unique (key_prefix),
  constraint api_keys_secret_hash_unique unique (secret_hash),
  constraint api_keys_spread_bps_non_negative
    check (spread_bps_override is null or spread_bps_override >= 0)
);

alter table public.api_keys
  add constraint api_keys_linked_user_id_fkey
  foreign key (linked_user_id) references auth.users (id) on delete cascade;

create index if not exists api_keys_linked_user_active_idx
  on public.api_keys (linked_user_id, is_active, created_at desc);

create index if not exists api_keys_active_last_used_idx
  on public.api_keys (is_active, last_used_at desc nulls last);

alter table public.api_keys enable row level security;

drop policy if exists "admin_read_api_keys" on public.api_keys;
create policy "admin_read_api_keys"
  on public.api_keys
  for select
  to authenticated
  using (public.is_panel_admin());

-- Writes happen via service-role (server actions / API auth).
