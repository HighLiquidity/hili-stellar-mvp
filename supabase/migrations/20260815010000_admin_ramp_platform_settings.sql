-- Platform-wide USDC/BRH ramp kill switches and USDC amount ceilings.
-- Defaults keep existing behavior: both ramps on, USDC ceiling matches BRH 100000.00.

alter table public.admin_test_settings
  add column if not exists usdc_ramp_enabled boolean not null default true;

alter table public.admin_test_settings
  add column if not exists brh_ramp_enabled boolean not null default true;

alter table public.admin_test_settings
  add column if not exists max_onramp_brl text not null default '100000.00';

alter table public.admin_test_settings
  add column if not exists max_offramp_brl text not null default '100000.00';
