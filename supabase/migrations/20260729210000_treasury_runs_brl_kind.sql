-- Allow CorpX BRL → Binance fiat deposit runs (treasury funding).
alter table public.treasury_runs
  drop constraint if exists treasury_runs_kind_check;

alter table public.treasury_runs
  add constraint treasury_runs_kind_check
  check (kind in ('binance_usdc_refill', 'binance_xlm_refill', 'corpx_brl_to_binance'));
