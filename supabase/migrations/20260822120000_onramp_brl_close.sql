-- Phase 4.5: per-onramp CorpX → Binance BRL close after the BUY fill.
alter table public.treasury_runs
  drop constraint if exists treasury_runs_trigger_check;

alter table public.treasury_runs
  add constraint treasury_runs_trigger_check
  check (trigger in ('manual', 'scheduled', 'threshold', 'onramp'));

alter table public.treasury_runs
  add column if not exists source_onramp_order_id uuid;

create unique index if not exists treasury_runs_onramp_brl_close_uidx
  on public.treasury_runs (source_onramp_order_id)
  where source_onramp_order_id is not null
    and kind = 'corpx_brl_to_binance'
    and dry_run = false;

comment on column public.treasury_runs.source_onramp_order_id is
  'On-ramp order that triggered an automatic BRL close (kind corpx_brl_to_binance). One live run per order.';

alter table public.onramp_orders
  add column if not exists treasury_brl_close_run_id uuid;

alter table public.onramp_orders
  add column if not exists treasury_brl_close_fiat_order_id text;

comment on column public.onramp_orders.treasury_brl_close_run_id is
  'treasury_runs.id for the automatic CorpX → Binance BRL close after BUY.';

comment on column public.onramp_orders.treasury_brl_close_fiat_order_id is
  'Binance fiat deposit order id paid by the automatic BRL close.';
