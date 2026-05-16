-- Inbound CorpX webhook audit trail (debugging + ops).

create table if not exists public.corpx_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dedupe_key text not null,
  event_type text not null,
  client_ip text,
  duplicate_delivery boolean not null default false,
  processed_status text not null,
  settled boolean not null default false,
  error_message text,
  provider_tx_id text,
  corpx_txid text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb
);

create index if not exists corpx_webhook_deliveries_created_at_idx
  on public.corpx_webhook_deliveries (created_at desc);

create index if not exists corpx_webhook_deliveries_event_type_idx
  on public.corpx_webhook_deliveries (event_type, created_at desc);

create index if not exists corpx_webhook_deliveries_corpx_txid_idx
  on public.corpx_webhook_deliveries (corpx_txid)
  where corpx_txid is not null;

alter table public.corpx_webhook_deliveries enable row level security;

drop policy if exists "admin_read_corpx_webhook_deliveries" on public.corpx_webhook_deliveries;
create policy "admin_read_corpx_webhook_deliveries"
  on public.corpx_webhook_deliveries
  for select
  to authenticated
  using (public.is_panel_admin());
