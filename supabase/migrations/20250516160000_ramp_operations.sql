-- On/Off-Ramp API operation tracking (on-ramp first; off-ramp later).
-- Ledger balance (brh_balance) credits on PIX; on-chain state lives here.

create table if not exists public.ramp_operations (
  id uuid primary key default gen_random_uuid(),
  ramp_operation_id text,
  operation_type text not null check (operation_type in ('onramp', 'offramp')),
  external_id text not null,
  status text not null,
  version int not null default 0,
  amount text,
  destination text,
  memo text,
  tx_hash text,
  failure_reason text,
  corpx_event_type text,
  corpx_provider_tx_id text,
  corpx_dedupe_key text,
  callback_last_version int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ramp_operations_external_id_key unique (external_id)
);

create index if not exists ramp_operations_ramp_operation_id_idx
  on public.ramp_operations (ramp_operation_id)
  where ramp_operation_id is not null;

create index if not exists ramp_operations_status_created_idx
  on public.ramp_operations (operation_type, status, created_at desc);

alter table public.ramp_operations enable row level security;

drop policy if exists "admin_read_ramp_operations" on public.ramp_operations;
create policy "admin_read_ramp_operations"
  on public.ramp_operations
  for select
  to authenticated
  using (public.is_panel_admin());

-- Inserts/updates via service_role only (Next.js server).
