-- Phase 3.2 follow-up: tenant-scoped read RLS for ramp orders with platform admin bypass.

create or replace function public.current_panel_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.client_id
  from public.panel_access_list p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and coalesce(p.is_active, false) = true
  limit 1;
$$;

revoke all on function public.current_panel_client_id() from public;
grant execute on function public.current_panel_client_id() to authenticated;
grant execute on function public.current_panel_client_id() to service_role;

drop policy if exists "admin_read_onramp_orders" on public.onramp_orders;
drop policy if exists "panel_read_onramp_orders" on public.onramp_orders;
create policy "panel_read_onramp_orders"
  on public.onramp_orders
  for select
  to authenticated
  using (
    public.is_panel_admin()
    or (
      client_id is not null
      and client_id = public.current_panel_client_id()
    )
  );

drop policy if exists "admin_read_offramp_orders" on public.offramp_orders;
drop policy if exists "panel_read_offramp_orders" on public.offramp_orders;
create policy "panel_read_offramp_orders"
  on public.offramp_orders
  for select
  to authenticated
  using (
    public.is_panel_admin()
    or (
      client_id is not null
      and client_id = public.current_panel_client_id()
    )
  );
