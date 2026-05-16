-- Pending dynamic PIX charges (txid from CorpX QR generation) + webhook dedup.

create table if not exists public.fiat_deposit_charges (
  corpx_txid text primary key,
  amount_brl text not null,
  tax_id text,
  identifier text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),
  paid_at timestamptz,
  corpx_event_type text,
  corpx_transaction_id text,
  end_to_end_id text,
  settlement_dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fiat_deposit_charges_status_idx
  on public.fiat_deposit_charges (status, created_at desc);

alter table public.fiat_deposit_charges enable row level security;

drop policy if exists "admin_read_fiat_deposit_charges" on public.fiat_deposit_charges;
create policy "admin_read_fiat_deposit_charges"
  on public.fiat_deposit_charges
  for select
  to authenticated
  using (public.is_panel_admin());

create table if not exists public.corpx_webhook_dedup (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.corpx_webhook_dedup enable row level security;
-- No client policies; service_role only.
