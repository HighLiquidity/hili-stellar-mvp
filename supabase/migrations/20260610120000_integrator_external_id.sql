-- Integrator-supplied reference id on API-created orders (scoped per operator user).

alter table public.onramp_orders
  add column if not exists integrator_external_id text;

alter table public.offramp_orders
  add column if not exists integrator_external_id text;

create unique index if not exists onramp_orders_integrator_external_id_user_key
  on public.onramp_orders (created_by_user_id, integrator_external_id)
  where created_by_user_id is not null and integrator_external_id is not null;

create unique index if not exists offramp_orders_integrator_external_id_user_key
  on public.offramp_orders (created_by_user_id, integrator_external_id)
  where created_by_user_id is not null and integrator_external_id is not null;

create index if not exists onramp_orders_created_by_user_created_at_idx
  on public.onramp_orders (created_by_user_id, created_at desc)
  where created_by_user_id is not null;

create index if not exists offramp_orders_created_by_user_created_at_idx
  on public.offramp_orders (created_by_user_id, created_at desc)
  where created_by_user_id is not null;
