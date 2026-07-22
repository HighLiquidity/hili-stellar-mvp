-- Phase 3.5 pre-work: support individual (PF) and company (PJ) clients.

alter table public.clients
  add column if not exists client_type text not null default 'company'
    check (client_type in ('company', 'individual'));

-- Existing rows remain typed as 'company' by default; individual clients
-- are created explicitly via the panel going forward.

