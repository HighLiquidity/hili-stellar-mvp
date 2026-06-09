import type { WhitelistApprovalStatus } from '@/lib/whitelist/approval';

export type PixWhitelistRow = {
  id: string;
  user_id: string;
  pix_key: string;
  beneficiary_name: string | null;
  label: string | null;
  is_active: boolean;
  approval_status: WhitelistApprovalStatus;
  reviewed_at: string | null;
  reviewed_by_email: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by_email: string | null;
};

export type PixWhitelistInsert = {
  userId: string;
  pixKey: string;
  beneficiaryName?: string | null;
  label?: string | null;
  isActive?: boolean;
  createdByEmail?: string | null;
};
