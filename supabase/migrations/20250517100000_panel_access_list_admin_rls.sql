-- Panel access allowlist (auth gate) + admin-only management policies.

create table if not exists public.panel_access_list (
  email text primary key,
  full_name text,
  role text not null default 'viewer'
    check (role in ('admin', 'operator', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists panel_access_list_role_idx
  on public.panel_access_list (role);

create index if not exists panel_access_list_active_idx
  on public.panel_access_list (is_active)
  where is_active = true;

alter table public.panel_access_list enable row level security;

drop policy if exists "panel_access_select_own" on public.panel_access_list;
create policy "panel_access_select_own"
  on public.panel_access_list
  for select
  to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "panel_access_select_admin" on public.panel_access_list;
create policy "panel_access_select_admin"
  on public.panel_access_list
  for select
  to authenticated
  using (public.is_panel_admin());

drop policy if exists "panel_access_insert_admin" on public.panel_access_list;
create policy "panel_access_insert_admin"
  on public.panel_access_list
  for insert
  to authenticated
  with check (public.is_panel_admin());

drop policy if exists "panel_access_update_admin" on public.panel_access_list;
create policy "panel_access_update_admin"
  on public.panel_access_list
  for update
  to authenticated
  using (public.is_panel_admin())
  with check (public.is_panel_admin());

drop policy if exists "panel_access_delete_admin" on public.panel_access_list;
create policy "panel_access_delete_admin"
  on public.panel_access_list
  for delete
  to authenticated
  using (public.is_panel_admin());
