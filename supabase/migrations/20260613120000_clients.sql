-- B2B clients (multi-tenant root). Phase 3.0: foundation + Legacy bootstrap.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  tax_id text not null,
  contact_email text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'suspended', 'archived')),
  spread_bps_override int
    check (spread_bps_override is null or (spread_bps_override >= 0 and spread_bps_override <= 10000)),
  max_amount_brl text,
  metadata jsonb,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_tax_id_unique unique (tax_id)
);

create index if not exists clients_status_idx
  on public.clients (status, created_at desc);

alter table public.clients enable row level security;

drop policy if exists "admin_read_clients" on public.clients;
create policy "admin_read_clients"
  on public.clients
  for select
  to authenticated
  using (public.is_panel_admin());

drop policy if exists "admin_write_clients" on public.clients;
create policy "admin_write_clients"
  on public.clients
  for all
  to authenticated
  using (public.is_panel_admin())
  with check (public.is_panel_admin());

-- Panel users link to a client (null = platform admin only).
alter table public.panel_access_list
  add column if not exists client_id uuid references public.clients (id) on delete restrict;

create index if not exists panel_access_list_client_idx
  on public.panel_access_list (client_id)
  where client_id is not null;

-- Fixed UUID documented in CLIENTS_ARCHITECTURE.md
insert into public.clients (
  id,
  legal_name,
  trade_name,
  tax_id,
  status,
  created_by_email
) values (
  '00000000-0000-4000-8000-000000000001',
  'Legacy Integrators',
  'Legacy',
  '00000000000000',
  'active',
  'migration@hili.internal'
)
on conflict (id) do nothing;

update public.panel_access_list
set client_id = '00000000-0000-4000-8000-000000000001'
where role in ('operator', 'viewer')
  and client_id is null;
