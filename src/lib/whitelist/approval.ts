export type WhitelistApprovalStatus = 'approved' | 'pending' | 'rejected';

export const WHITELIST_APPROVAL_STATUSES: WhitelistApprovalStatus[] = [
  'approved',
  'pending',
  'rejected',
];

export function isWhitelistEntryUsable(row: {
  is_active: boolean;
  approval_status: WhitelistApprovalStatus;
}): boolean {
  return row.is_active && row.approval_status === 'approved';
}
