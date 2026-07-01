export const KYB_STATUSES = ['not_started', 'pending', 'approved', 'rejected'] as const;
export type KybStatus = (typeof KYB_STATUSES)[number];

export const KYC_STATUSES = ['not_started', 'pending', 'approved', 'rejected', 'not_applicable'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export type ClientComplianceRow = {
  client_id: string;
  kyb_status: KybStatus;
  kyc_status: KycStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by_email: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientComplianceUpdateInput = {
  kybStatus?: KybStatus;
  kycStatus?: KycStatus;
  notes?: string | null;
  rejectionReason?: string | null;
};

export type ClientListRow = {
  kyb_status: KybStatus;
  kyc_status: KycStatus;
};
