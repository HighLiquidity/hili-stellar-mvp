-- Phase 3.3: client_admin role for delegated tenant management.

alter table public.panel_access_list
  drop constraint if exists panel_access_list_role_check;

alter table public.panel_access_list
  add constraint panel_access_list_role_check
  check (role in ('admin', 'client_admin', 'operator', 'viewer'));

-- client_admin must belong to a client (same as operator/viewer).
-- platform admin remains client_id = null.
