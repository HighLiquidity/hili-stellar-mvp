-- Singleton BRH balance (MVP). Webhook uses service role + RPC; UI reads via RLS / Realtime.
-- Apply in Supabase SQL Editor or `supabase db push` when using the CLI.

create table if not exists public.brh_balance (
  id smallint primary key default 1,
  balance text not null default '0',
  updated_at timestamptz not null default now(),
  constraint brh_balance_singleton check (id = 1)
);

insert into public.brh_balance (id, balance) values (1, '0')
on conflict (id) do nothing;

alter table public.brh_balance enable row level security;

drop policy if exists "Anyone can read BRH balance" on public.brh_balance;
create policy "Anyone can read BRH balance"
  on public.brh_balance for select
  using (true);

-- Atomic credit when PIX inbound is confirmed (delta is a decimal string, e.g. '1500.50').
create or replace function public.increment_brh_balance(delta text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  out_balance text;
begin
  if delta is null or btrim(delta) = '' then
    raise exception 'delta required';
  end if;

  insert into public.brh_balance (id, balance)
  values (1, btrim(delta))
  on conflict (id) do update
    set balance = ((public.brh_balance.balance::numeric + excluded.balance::numeric))::text,
        updated_at = now()
  returning public.brh_balance.balance into out_balance;

  return out_balance;
end;
$$;

revoke all on function public.increment_brh_balance(text) from public;
grant execute on function public.increment_brh_balance(text) to service_role;

-- Enable Realtime on this table (Supabase Dashboard → Database → Publications, or run once below).
-- If the table is already in the publication, this will error — safe to ignore.
-- alter publication supabase_realtime add table public.brh_balance;
