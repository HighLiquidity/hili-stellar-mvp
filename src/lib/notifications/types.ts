export type NotificationSeverity = 'info' | 'warning' | 'action';

export type NotificationKind =
  | 'whitelist_wallet_pending'
  | 'whitelist_pix_pending'
  | 'whitelist_own_pending'
  | 'kyb_pending_review'
  | 'kyb_status'
  | 'treasury_pending_refills'
  | 'ramp_needs_review';

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  href: string;
  fingerprint: string;
  count?: number;
  meta?: {
    kybStatus?: 'not_started' | 'pending' | 'rejected' | 'approved';
  };
};

export type NotificationsSummary = {
  items: NotificationItem[];
  fetchedAt: string;
};
