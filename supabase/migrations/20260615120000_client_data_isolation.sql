-- Phase 3.2: tenant isolation via client_id on operational tables.

alter table public.api_keys
  add column if not exists client_id uuid references public.clients (id) on delete restrict;

alter table public.onramp_orders
  add column if not exists client_id uuid references public.clients (id) on delete restrict;

alter table public.offramp_orders
  add column if not exists client_id uuid references public.clients (id) on delete restrict;

alter table public.user_withdraw_whitelist
  add column if not exists client_id uuid references public.clients (id) on delete restrict;

alter table public.user_pix_whitelist
  add column if not exists client_id uuid references public.clients (id) on delete restrict;

alter table public.api_key_request_logs
  add column if not exists client_id uuid references public.clients (id) on delete set null;

-- api_keys: panel user → client
update public.api_keys ak
set client_id = p.client_id
from auth.users u
join public.panel_access_list p on lower(p.email) = lower(u.email)
where ak.linked_user_id = u.id
  and p.client_id is not null
  and ak.client_id is null;

update public.api_keys
set client_id = '00000000-0000-4000-8000-000000000001'
where client_id is null;

-- orders: creator email or auth user → client
update public.onramp_orders o
set client_id = p.client_id
from public.panel_access_list p
where o.client_id is null
  and o.created_by_email is not null
  and lower(p.email) = lower(o.created_by_email)
  and p.client_id is not null;

update public.onramp_orders o
set client_id = p.client_id
from auth.users u
join public.panel_access_list p on lower(p.email) = lower(u.email)
where o.client_id is null
  and o.created_by_user_id = u.id
  and p.client_id is not null;

update public.offramp_orders o
set client_id = p.client_id
from public.panel_access_list p
where o.client_id is null
  and o.created_by_email is not null
  and lower(p.email) = lower(o.created_by_email)
  and p.client_id is not null;

update public.offramp_orders o
set client_id = p.client_id
from auth.users u
join public.panel_access_list p on lower(p.email) = lower(u.email)
where o.client_id is null
  and o.created_by_user_id = u.id
  and p.client_id is not null;

update public.onramp_orders
set client_id = '00000000-0000-4000-8000-000000000001'
where client_id is null;

update public.offramp_orders
set client_id = '00000000-0000-4000-8000-000000000001'
where client_id is null;

-- whitelist entries
update public.user_withdraw_whitelist w
set client_id = p.client_id
from auth.users u
join public.panel_access_list p on lower(p.email) = lower(u.email)
where w.user_id = u.id
  and p.client_id is not null
  and w.client_id is null;

update public.user_pix_whitelist w
set client_id = p.client_id
from auth.users u
join public.panel_access_list p on lower(p.email) = lower(u.email)
where w.user_id = u.id
  and p.client_id is not null
  and w.client_id is null;

update public.user_withdraw_whitelist
set client_id = '00000000-0000-4000-8000-000000000001'
where client_id is null;

update public.user_pix_whitelist
set client_id = '00000000-0000-4000-8000-000000000001'
where client_id is null;

-- request logs via api key
update public.api_key_request_logs l
set client_id = ak.client_id
from public.api_keys ak
where l.api_key_id = ak.id
  and ak.client_id is not null
  and l.client_id is null;

-- externalId uniqueness per client (replaces per-user index)
drop index if exists public.onramp_orders_integrator_external_id_user_key;
drop index if exists public.offramp_orders_integrator_external_id_user_key;

create unique index if not exists onramp_orders_client_external_id_key
  on public.onramp_orders (client_id, integrator_external_id)
  where client_id is not null and integrator_external_id is not null;

create unique index if not exists offramp_orders_client_external_id_key
  on public.offramp_orders (client_id, integrator_external_id)
  where client_id is not null and integrator_external_id is not null;

create index if not exists onramp_orders_client_created_at_idx
  on public.onramp_orders (client_id, created_at desc)
  where client_id is not null;

create index if not exists offramp_orders_client_created_at_idx
  on public.offramp_orders (client_id, created_at desc)
  where client_id is not null;

create index if not exists onramp_orders_client_status_idx
  on public.onramp_orders (client_id, status, created_at desc)
  where client_id is not null;

create index if not exists offramp_orders_client_status_idx
  on public.offramp_orders (client_id, status, created_at desc)
  where client_id is not null;

create index if not exists api_keys_client_active_idx
  on public.api_keys (client_id, is_active, created_at desc)
  where client_id is not null;

create index if not exists api_key_request_logs_client_created_at_idx
  on public.api_key_request_logs (client_id, created_at desc)
  where client_id is not null;

create index if not exists user_withdraw_whitelist_client_idx
  on public.user_withdraw_whitelist (client_id, approval_status, created_at desc)
  where client_id is not null;

create index if not exists user_pix_whitelist_client_idx
  on public.user_pix_whitelist (client_id, approval_status, created_at desc)
  where client_id is not null;
