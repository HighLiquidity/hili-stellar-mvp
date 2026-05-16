-- Audit log for fiat deposit / withdraw UI operations (server actions).
-- Inserts via service role only; admins can read for support and debugging.

create table if not exists public.fiat_operation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  operation text not null check (operation in ('fiat_deposit', 'fiat_withdraw')),
  phase text not null,
  status text not null check (status in ('success', 'error')),
  error_code text,
  error_message text,
  actor_email text,
  actor_user_id text,
  tax_id text,
  amount_brl text,
  provider_tx_id text,
  e2e_id text,
  correlation_id text,
  idempotency_key text,
  beneficiary_name text,
  stage text,
  brh_balance_before text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists fiat_operation_events_created_at_idx
  on public.fiat_operation_events (created_at desc);

create index if not exists fiat_operation_events_operation_idx
  on public.fiat_operation_events (operation, created_at desc);

alter table public.fiat_operation_events enable row level security;

drop policy if exists "admin_read_fiat_operation_events" on public.fiat_operation_events;
create policy "admin_read_fiat_operation_events"
  on public.fiat_operation_events
  for select
  to authenticated
  using (public.is_panel_admin());

-- No insert/update/delete for authenticated clients; server uses service_role.
