import type { PixWhitelistRow } from '@/lib/pix-whitelist/types';
import type { WithdrawWhitelistRow } from '@/lib/withdraw-whitelist/types';
import type { WhitelistApprovalStatus } from '@/lib/whitelist/approval';

export type PublicWalletWhitelistResponse = {
  id: string;
  approvalStatus: WhitelistApprovalStatus;
  isActive: boolean;
  address: string;
  network: string;
  label: string | null;
  memo: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicPixWhitelistResponse = {
  id: string;
  approvalStatus: WhitelistApprovalStatus;
  isActive: boolean;
  pixKey: string;
  beneficiaryName: string | null;
  label: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicWhitelistListResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function toPublicWalletWhitelistResponse(row: WithdrawWhitelistRow): PublicWalletWhitelistResponse {
  return {
    id: row.id,
    approvalStatus: row.approval_status,
    isActive: row.is_active,
    address: row.address,
    network: row.network,
    label: row.label,
    memo: row.memo,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicPixWhitelistResponse(row: PixWhitelistRow): PublicPixWhitelistResponse {
  return {
    id: row.id,
    approvalStatus: row.approval_status,
    isActive: row.is_active,
    pixKey: row.pix_key,
    beneficiaryName: row.beneficiary_name,
    label: row.label,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
