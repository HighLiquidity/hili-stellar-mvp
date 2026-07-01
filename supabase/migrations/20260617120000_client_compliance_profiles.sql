-- Phase 3.4: client KYB/KYC compliance profiles.

create table if not exists public.client_compliance_profiles (
  client_id uuid primary key references public.clients (id) on delete cascade,

  kyb_status text not null default 'not_started'
    check (kyb_status in ('not_started', 'pending', 'approved', 'rejected')),
  kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started', 'pending', 'approved', 'rejected', 'not_applicable')),

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_email text,
  rejection_reason text,
  notes text,
  metadata jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_compliance_profiles_kyb_status_idx
  on public.client_compliance_profiles (kyb_status, updated_at desc);

alter table public.client_compliance_profiles enable row level security;

drop policy if exists "admin_read_client_compliance_profiles" on public.client_compliance_profiles;
create policy "admin_read_client_compliance_profiles"
  on public.client_compliance_profiles
  for select
  to authenticated
  using (public.is_panel_admin());

drop policy if exists "admin_write_client_compliance_profiles" on public.client_compliance_profiles;
create policy "admin_write_client_compliance_profiles"
  on public.client_compliance_profiles
  for all
  to authenticated
  using (public.is_panel_admin())
  with check (public.is_panel_admin());

-- Backfill: one profile per existing client.
insert into public.client_compliance_profiles (client_id, kyb_status, kyc_status, reviewed_at, notes)
select
  c.id,
  case when c.id = '00000000-0000-4000-8000-000000000001' then 'approved' else 'not_started' end,
  case when c.id = '00000000-0000-4000-8000-000000000001' then 'not_applicable' else 'not_started' end,
  case when c.id = '00000000-0000-4000-8000-000000000001' then now() else null end,
  case when c.id = '00000000-0000-4000-8000-000000000001' then 'Legacy bootstrap (pre-KYB gate).' else null end
from public.clients c
on conflict (client_id) do nothing;
