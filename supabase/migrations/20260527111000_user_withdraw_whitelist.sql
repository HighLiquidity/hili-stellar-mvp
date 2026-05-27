-- Whitelist de wallets para saque/entrega de USDC por usuário de painel.

create table if not exists public.user_withdraw_whitelist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  address text not null,
  network text not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text,
  constraint user_withdraw_whitelist_unique_per_user
    unique (user_id, address, network)
);

alter table public.user_withdraw_whitelist
  add constraint user_withdraw_whitelist_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

create index if not exists user_withdraw_whitelist_user_idx
  on public.user_withdraw_whitelist (user_id, is_active, created_at desc);

alter table public.user_withdraw_whitelist enable row level security;

drop policy if exists "admin_read_user_withdraw_whitelist" on public.user_withdraw_whitelist;
create policy "admin_read_user_withdraw_whitelist"
  on public.user_withdraw_whitelist
  for select
  to authenticated
  using (public.is_panel_admin());

-- Writes acontecem apenas via service-role (server-only), usando painel/admin.
