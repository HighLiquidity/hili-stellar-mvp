-- Aggregated order state for USDC off-ramp (USDC -> BRL via PIX payout).

create table if not exists public.offramp_orders (
  id uuid primary key default gen_random_uuid(),
  status text not null
    check (
      status in (
        'quoted',
        'awaiting_deposit',
        'usdc_received',
        'pix_sent',
        'brh_recorded',
        'fx_settled',
        'complete',
        'expired',
        'failed',
        'refunded',
        'needs_review'
      )
    ),

  amount_usdc text not null,
  amount_brl text not null,
  quote_symbol text not null default 'USDCBRL',
  quote_side text not null default 'SELL'
    check (quote_side in ('BUY', 'SELL')),
  quote_rate text,
  quote_source text,
  quote_spread_bps int,
  quote_expires_at timestamptz not null,
  quote_locked_at timestamptz,

  payout_pix_key text not null,
  payout_beneficiary_name text,
  payout_reference text,
  payout_provider_tx_id text,
  payout_end_to_end_id text,

  usdc_deposit_external_id text,
  usdc_deposit_ramp_operation_id text,
  usdc_deposit_address text,
  usdc_deposit_memo text,
  usdc_received_amount text,
  usdc_received_tx_hash text,

  brh_issue_external_id text,
  brh_issue_ramp_operation_id text,
  brh_redemption_external_id text,
  brh_redemption_ramp_operation_id text,

  binance_symbol text,
  binance_side text
    check (binance_side is null or binance_side in ('BUY', 'SELL')),
  binance_client_order_id text,
  binance_order_id text,
  binance_executed_qty text,
  binance_cummulative_quote_qty text,
  binance_status text,

  failure_code text,
  failure_reason text,
  needs_review_reason text,

  created_by_user_id uuid,
  created_by_email text,

  quoted_at timestamptz not null default now(),
  usdc_received_at timestamptz,
  pix_sent_at timestamptz,
  brh_recorded_at timestamptz,
  fx_settled_at timestamptz,
  complete_at timestamptz,
  expired_at timestamptz,
  refunded_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offramp_orders_status_created_idx
  on public.offramp_orders (status, created_at desc);

create index if not exists offramp_orders_quote_expires_idx
  on public.offramp_orders (quote_expires_at)
  where status in ('quoted', 'awaiting_deposit');

create unique index if not exists offramp_orders_usdc_deposit_external_id_key
  on public.offramp_orders (usdc_deposit_external_id)
  where usdc_deposit_external_id is not null;

create unique index if not exists offramp_orders_brh_issue_external_id_key
  on public.offramp_orders (brh_issue_external_id)
  where brh_issue_external_id is not null;

create unique index if not exists offramp_orders_brh_redemption_external_id_key
  on public.offramp_orders (brh_redemption_external_id)
  where brh_redemption_external_id is not null;

create unique index if not exists offramp_orders_binance_client_order_id_key
  on public.offramp_orders (binance_client_order_id)
  where binance_client_order_id is not null;

alter table public.offramp_orders enable row level security;

drop policy if exists "admin_read_offramp_orders" on public.offramp_orders;
create policy "admin_read_offramp_orders"
  on public.offramp_orders
  for select
  to authenticated
  using (public.is_panel_admin());

-- Writes happen through service_role on the server.
