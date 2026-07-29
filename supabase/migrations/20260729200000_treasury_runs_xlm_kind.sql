-- Allow Binance XLM → distributor refill runs (Phase 4.1 UX).
alter table public.treasury_runs
  drop constraint if exists treasury_runs_kind_check;

alter table public.treasury_runs
  add constraint treasury_runs_kind_check
  check (kind in ('binance_usdc_refill', 'binance_xlm_refill'));
