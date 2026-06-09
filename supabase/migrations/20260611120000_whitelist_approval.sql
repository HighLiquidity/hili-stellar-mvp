-- Operator-submitted whitelist entries require admin approval before becoming active.

alter table public.user_withdraw_whitelist
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('approved', 'pending', 'rejected')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_email text,
  add column if not exists rejection_reason text;

alter table public.user_pix_whitelist
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('approved', 'pending', 'rejected')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_email text,
  add column if not exists rejection_reason text;

create index if not exists user_withdraw_whitelist_pending_idx
  on public.user_withdraw_whitelist (approval_status, created_at desc)
  where approval_status = 'pending';

create index if not exists user_pix_whitelist_pending_idx
  on public.user_pix_whitelist (approval_status, created_at desc)
  where approval_status = 'pending';
