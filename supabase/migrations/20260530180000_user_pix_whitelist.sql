-- Whitelist de chaves PIX para payout do off-ramp (mesmo modelo das wallets Stellar).

create table if not exists public.user_pix_whitelist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  pix_key text not null,
  beneficiary_name text,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text,
  constraint user_pix_whitelist_unique_per_user unique (user_id, pix_key)
);

alter table public.user_pix_whitelist
  add constraint user_pix_whitelist_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

create index if not exists user_pix_whitelist_user_idx
  on public.user_pix_whitelist (user_id, is_active, created_at desc);

create index if not exists user_pix_whitelist_active_pix_key_idx
  on public.user_pix_whitelist (pix_key)
  where is_active = true;

alter table public.user_pix_whitelist enable row level security;

drop policy if exists "admin_read_user_pix_whitelist" on public.user_pix_whitelist;
create policy "admin_read_user_pix_whitelist"
  on public.user_pix_whitelist
  for select
  to authenticated
  using (public.is_panel_admin());
