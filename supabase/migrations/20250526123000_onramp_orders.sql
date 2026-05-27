-- Aggregated order state for USDC on-ramp via PIX.
-- Frontend and orchestration should track an on-ramp order, not only a CorpX txid.

create table if not exists public.onramp_orders (
  id uuid primary key default gen_random_uuid(),
  status text not null
    check (
      status in (
        'quoted',
        'awaiting_pix',
        'pix_received',
        'brh_sold',
        'usdc_delivered',
        'fx_settled',
        'brh_redeemed',
        'complete',
        'expired',
        'failed',
        'refunded',
        'needs_review'
      )
    ),

  tax_id text not null,
  amount_brl text not null,
  amount_usdc text not null,
  destination_address text not null,
  destination_memo text,

  quote_symbol text not null default 'USDCBRL',
  quote_side text not null default 'BUY'
    check (quote_side in ('BUY', 'SELL')),
  quote_expires_at timestamptz not null,
  quote_locked_at timestamptz,
  quote_rate text,
  quote_source text,
  quote_spread_bps int,

  corpx_txid text,
  corpx_identifier text,
  corpx_expires_at timestamptz,
  pix_copy_paste text,
  corpx_event_type text,
  corpx_transaction_id text,
  end_to_end_id text,

  brh_sale_external_id text,
  brh_sale_ramp_operation_id text,

  usdc_delivery_external_id text,
  usdc_delivery_ramp_operation_id text,
  usdc_delivery_tx_hash text,

  binance_symbol text,
  binance_side text
    check (binance_side is null or binance_side in ('BUY', 'SELL')),
  binance_quote_order_qty text,
  binance_client_order_id text,
  binance_order_id text,
  binance_executed_qty text,
  binance_cummulative_quote_qty text,
  binance_status text,

  brh_redemption_external_id text,
  brh_redemption_ramp_operation_id text,

  binance_withdraw_order_id text,
  binance_withdraw_id text,
  binance_withdraw_network text,
  binance_withdraw_amount text,

  failure_code text,
  failure_reason text,
  needs_review_reason text,

  created_by_user_id uuid,
  created_by_email text,

  quoted_at timestamptz not null default now(),
  pix_received_at timestamptz,
  brh_sold_at timestamptz,
  usdc_delivered_at timestamptz,
  fx_settled_at timestamptz,
  brh_redeemed_at timestamptz,
  complete_at timestamptz,
  expired_at timestamptz,
  refunded_at timestamptz,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onramp_orders_status_created_idx
  on public.onramp_orders (status, created_at desc);

create index if not exists onramp_orders_quote_expires_idx
  on public.onramp_orders (quote_expires_at)
  where status in ('quoted', 'awaiting_pix');

create unique index if not exists onramp_orders_corpx_txid_key
  on public.onramp_orders (corpx_txid)
  where corpx_txid is not null;

create unique index if not exists onramp_orders_brh_sale_external_id_key
  on public.onramp_orders (brh_sale_external_id)
  where brh_sale_external_id is not null;

create unique index if not exists onramp_orders_usdc_delivery_external_id_key
  on public.onramp_orders (usdc_delivery_external_id)
  where usdc_delivery_external_id is not null;

create unique index if not exists onramp_orders_brh_redemption_external_id_key
  on public.onramp_orders (brh_redemption_external_id)
  where brh_redemption_external_id is not null;

create unique index if not exists onramp_orders_binance_client_order_id_key
  on public.onramp_orders (binance_client_order_id)
  where binance_client_order_id is not null;

create unique index if not exists onramp_orders_binance_withdraw_order_id_key
  on public.onramp_orders (binance_withdraw_order_id)
  where binance_withdraw_order_id is not null;

alter table public.onramp_orders enable row level security;

drop policy if exists "admin_read_onramp_orders" on public.onramp_orders;
create policy "admin_read_onramp_orders"
  on public.onramp_orders
  for select
  to authenticated
  using (public.is_panel_admin());

-- Writes happen through service_role on the server.
