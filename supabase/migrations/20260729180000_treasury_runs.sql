-- Treasury run audit log for manual/automated capital moves (Phase 4.1+).
create table if not exists public.treasury_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null
    check (trigger in ('manual', 'scheduled', 'threshold')),
  kind text not null default 'binance_usdc_refill'
    check (kind in ('binance_usdc_refill')),
  status text not null
    check (status in ('pending', 'running', 'completed', 'failed', 'dry_run')),
  dry_run boolean not null default false,
  requested_amount_usdc text,
  executed_amount_usdc text,
  binance_usdc_free text,
  binance_withdraw_order_id text,
  binance_withdraw_id text,
  binance_withdraw_network text,
  distributor_address text,
  distributor_address_tag text,
  steps jsonb not null default '[]'::jsonb,
  error text,
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists treasury_runs_withdraw_order_id_uidx
  on public.treasury_runs (binance_withdraw_order_id)
  where binance_withdraw_order_id is not null;

create index if not exists treasury_runs_created_at_idx
  on public.treasury_runs (created_at desc);

alter table public.treasury_runs enable row level security;

drop policy if exists "Admins can read treasury runs" on public.treasury_runs;
create policy "Admins can read treasury runs"
  on public.treasury_runs
  for select
  to authenticated
  using (public.is_panel_admin());

comment on table public.treasury_runs is
  'Audit trail for treasury capital moves (Binance USDC refill to Stellar distributor). Writes via service_role.';
