-- Commercial terms (spread, BRL limit) per panel operator — shared by UI and API.

alter table public.panel_access_list
  add column if not exists spread_bps_override int
    check (spread_bps_override is null or (spread_bps_override >= 0 and spread_bps_override <= 10000)),
  add column if not exists max_amount_brl text;
