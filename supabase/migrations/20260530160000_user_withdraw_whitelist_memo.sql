-- Optional Stellar text memo per whitelisted payout wallet (max 28 UTF-8 bytes at app layer).

alter table public.user_withdraw_whitelist
  add column if not exists memo text;
