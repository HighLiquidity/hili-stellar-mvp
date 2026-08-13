-- Allow treasury pocket-to-pocket events in the admin audit log (no BRH credit).

alter table public.fiat_operation_events
  drop constraint if exists fiat_operation_events_operation_check;

alter table public.fiat_operation_events
  add constraint fiat_operation_events_operation_check
  check (operation in ('fiat_deposit', 'fiat_withdraw', 'fiat_onramp', 'treasury_transfer'));
