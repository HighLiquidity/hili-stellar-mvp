import type { WhitelistApprovalStatus } from '@/lib/whitelist/approval';

export type WithdrawWhitelistNetwork = 'STELLAR_TESTNET' | 'STELLAR_PUBLIC';

export type WithdrawWhitelistRow = {
  id: string;
  user_id: string;
  address: string;
  network: WithdrawWhitelistNetwork;
  label: string | null;
  memo: string | null;
  is_active: boolean;
  approval_status: WhitelistApprovalStatus;
  reviewed_at: string | null;
  reviewed_by_email: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by_email: string | null;
};

export type WithdrawWhitelistInsert = {
  userId: string;
  address: string;
  network: WithdrawWhitelistNetwork;
  label?: string | null;
  memo?: string | null;
  isActive?: boolean;
  createdByEmail?: string | null;
};
