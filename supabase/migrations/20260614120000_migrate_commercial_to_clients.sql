-- Phase 3.1: migrate operator commercial terms to clients (keep operator columns for legacy read).

update public.clients c
set
  spread_bps_override = coalesce(c.spread_bps_override, sub.spread_bps_override),
  max_amount_brl = coalesce(c.max_amount_brl, sub.max_amount_brl),
  updated_at = now()
from (
  select distinct on (p.client_id)
    p.client_id,
    p.spread_bps_override,
    p.max_amount_brl
  from public.panel_access_list p
  where p.client_id is not null
    and p.role = 'operator'
    and (p.spread_bps_override is not null or p.max_amount_brl is not null)
  order by p.client_id, p.updated_at desc nulls last
) sub
where c.id = sub.client_id
  and (c.spread_bps_override is null or c.max_amount_brl is null);
