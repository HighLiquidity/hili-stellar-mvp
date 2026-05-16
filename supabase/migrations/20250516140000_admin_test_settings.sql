-- Admin-only test / sandbox parameters (fiat limits, BRH wallet, PIX key for withdrawals).
-- Requires existing public.panel_access_list with role = 'admin'.

create table if not exists public.admin_test_settings (
  id smallint primary key default 1,
  constraint admin_test_settings_singleton check (id = 1),
  max_deposit_brl text not null default '100000.00',
  max_withdraw_brl text not null default '100000.00',
  brh_wallet_address text not null default '',
  fiat_pix_withdraw_key text not null default '',
  updated_at timestamptz not null default now(),
  updated_by_email text
);

insert into public.admin_test_settings (id) values (1)
on conflict (id) do nothing;

alter table public.admin_test_settings enable row level security;

create or replace function public.is_panel_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.panel_access_list p
    where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and p.role = 'admin'
      and coalesce(p.is_active, false) = true
  );
$$;

revoke all on function public.is_panel_admin() from public;
grant execute on function public.is_panel_admin() to authenticated;
grant execute on function public.is_panel_admin() to service_role;

drop policy if exists "admin_read_test_settings" on public.admin_test_settings;
create policy "admin_read_test_settings"
  on public.admin_test_settings
  for select
  to authenticated
  using (public.is_panel_admin());

drop policy if exists "admin_insert_test_settings" on public.admin_test_settings;
create policy "admin_insert_test_settings"
  on public.admin_test_settings
  for insert
  to authenticated
  with check (public.is_panel_admin());

drop policy if exists "admin_update_test_settings" on public.admin_test_settings;
create policy "admin_update_test_settings"
  on public.admin_test_settings
  for update
  to authenticated
  using (public.is_panel_admin())
  with check (public.is_panel_admin());
