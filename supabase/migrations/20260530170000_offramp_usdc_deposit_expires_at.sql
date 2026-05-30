-- Ramp API deposit window for USDC off-ramp (distinct from quote TTL).

alter table public.offramp_orders
  add column if not exists usdc_deposit_expires_at timestamptz;
