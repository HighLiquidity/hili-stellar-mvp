-- Successful fiat deposit / withdraw ledger for statement and dashboard (panel members).

create or replace function public.is_panel_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.panel_access_list p
    where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(p.is_active, false) = true
  );
$$;

revoke all on function public.is_panel_member() from public;
grant execute on function public.is_panel_member() to authenticated;
grant execute on function public.is_panel_member() to service_role;

create table if not exists public.fiat_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entry_type text not null check (entry_type in ('deposit', 'withdraw')),
  amount_brl text not null,
  status text not null default 'completed' check (status in ('completed')),
  source_id text not null,
  pix_e2e_id text,
  ramp_external_id text,
  beneficiary_name text,
  constraint fiat_ledger_entries_source_id_key unique (source_id)
);

create index if not exists fiat_ledger_entries_created_at_idx
  on public.fiat_ledger_entries (created_at desc);

create index if not exists fiat_ledger_entries_ramp_external_id_idx
  on public.fiat_ledger_entries (ramp_external_id)
  where ramp_external_id is not null;

alter table public.fiat_ledger_entries enable row level security;

drop policy if exists "panel_read_fiat_ledger_entries" on public.fiat_ledger_entries;
create policy "panel_read_fiat_ledger_entries"
  on public.fiat_ledger_entries
  for select
  to authenticated
  using (public.is_panel_member());

-- Backfill completed deposits from paid charges.
insert into public.fiat_ledger_entries (
  created_at,
  entry_type,
  amount_brl,
  source_id,
  pix_e2e_id,
  ramp_external_id
)
select
  coalesce(c.paid_at, c.updated_at, c.created_at),
  'deposit',
  c.amount_brl,
  'deposit:' || c.corpx_txid,
  c.end_to_end_id,
  case
    when c.settlement_dedupe_key is not null then
      left(
        'corpx-onramp:' || coalesce(nullif(trim(c.corpx_transaction_id), ''), c.corpx_txid),
        200
      )
    else null
  end
from public.fiat_deposit_charges c
where c.status = 'paid'
on conflict (source_id) do nothing;

-- Backfill successful withdrawals from operation events.
insert into public.fiat_ledger_entries (
  created_at,
  entry_type,
  amount_brl,
  source_id,
  pix_e2e_id,
  beneficiary_name
)
select
  e.created_at,
  'withdraw',
  e.amount_brl,
  'withdraw:' || coalesce(nullif(trim(e.idempotency_key), ''), e.id::text),
  e.e2e_id,
  e.beneficiary_name
from public.fiat_operation_events e
where e.operation = 'fiat_withdraw'
  and e.status = 'success'
  and coalesce(e.stage, 'completed') = 'completed'
  and e.amount_brl is not null
on conflict (source_id) do nothing;

-- Panel members can read ramp rows to resolve on-chain tx hashes in the statement UI.
drop policy if exists "panel_read_ramp_operations" on public.ramp_operations;
create policy "panel_read_ramp_operations"
  on public.ramp_operations
  for select
  to authenticated
  using (public.is_panel_member());
