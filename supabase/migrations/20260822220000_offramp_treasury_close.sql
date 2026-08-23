-- Phase 4.6: per-offramp USDC drain + Binance → CorpX BRL close after the SELL fill.
alter table public.treasury_runs
  drop constraint if exists treasury_runs_trigger_check;

alter table public.treasury_runs
  add constraint treasury_runs_trigger_check
  check (trigger in ('manual', 'scheduled', 'threshold', 'onramp', 'offramp'));

alter table public.treasury_runs
  add column if not exists source_offramp_order_id uuid;

create unique index if not exists treasury_runs_offramp_usdc_close_uidx
  on public.treasury_runs (source_offramp_order_id)
  where source_offramp_order_id is not null
    and kind = 'distributor_usdc_to_binance'
    and dry_run = false;

create unique index if not exists treasury_runs_offramp_brl_close_uidx
  on public.treasury_runs (source_offramp_order_id)
  where source_offramp_order_id is not null
    and kind = 'binance_brl_to_corpx'
    and dry_run = false;

comment on column public.treasury_runs.source_offramp_order_id is
  'Off-ramp order that triggered an automatic close (USDC drain and/or Binance BRL → CorpX). One live run per kind per order.';

alter table public.offramp_orders
  add column if not exists treasury_usdc_close_run_id uuid;

alter table public.offramp_orders
  add column if not exists treasury_usdc_close_external_id text;

alter table public.offramp_orders
  add column if not exists treasury_brl_close_run_id uuid;

alter table public.offramp_orders
  add column if not exists treasury_brl_close_fiat_order_id text;

comment on column public.offramp_orders.treasury_usdc_close_run_id is
  'treasury_runs.id for the automatic distributor → Binance USDC drain after SELL.';

comment on column public.offramp_orders.treasury_usdc_close_external_id is
  'Ramp treasury onramp external id for the automatic USDC drain.';

comment on column public.offramp_orders.treasury_brl_close_run_id is
  'treasury_runs.id for the automatic Binance → CorpX BRL close after SELL.';

comment on column public.offramp_orders.treasury_brl_close_fiat_order_id is
  'Binance fiat withdraw order id for the automatic BRL close.';
