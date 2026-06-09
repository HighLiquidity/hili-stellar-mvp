-- API key request audit log (rate limiting + admin activity tab).

create table if not exists public.api_key_request_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  api_key_id uuid not null,
  key_prefix text not null,
  method text not null,
  route text not null,
  status_code int not null,
  duration_ms int,
  idempotency_key text,
  constraint api_key_request_logs_api_key_id_fkey
    foreign key (api_key_id) references public.api_keys (id) on delete cascade
);

create index if not exists api_key_request_logs_created_at_idx
  on public.api_key_request_logs (created_at desc);

create index if not exists api_key_request_logs_key_created_at_idx
  on public.api_key_request_logs (api_key_id, created_at desc);

create index if not exists api_key_request_logs_rate_limit_idx
  on public.api_key_request_logs (api_key_id, created_at);

alter table public.api_key_request_logs enable row level security;

drop policy if exists "admin_read_api_key_request_logs" on public.api_key_request_logs;
create policy "admin_read_api_key_request_logs"
  on public.api_key_request_logs
  for select
  to authenticated
  using (public.is_panel_admin());

-- Idempotent replay cache for POST quote/lock (per key + route + Idempotency-Key header).

create table if not exists public.api_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null,
  route text not null,
  idempotency_key text not null,
  status_code int not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint api_idempotency_records_api_key_id_fkey
    foreign key (api_key_id) references public.api_keys (id) on delete cascade,
  constraint api_idempotency_records_unique_key
    unique (api_key_id, route, idempotency_key)
);

create index if not exists api_idempotency_records_expires_at_idx
  on public.api_idempotency_records (expires_at);

alter table public.api_idempotency_records enable row level security;

-- Writes via service-role only; no authenticated client access needed.
