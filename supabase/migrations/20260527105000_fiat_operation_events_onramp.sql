-- Allow on-ramp events in fiat_operation_events audit log.

alter table public.fiat_operation_events
  drop constraint if exists fiat_operation_events_operation_check;

alter table public.fiat_operation_events
  add constraint fiat_operation_events_operation_check
  check (operation in ('fiat_deposit', 'fiat_withdraw', 'fiat_onramp'));
