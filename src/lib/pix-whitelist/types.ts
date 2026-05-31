export type PixWhitelistRow = {
  id: string;
  user_id: string;
  pix_key: string;
  beneficiary_name: string | null;
  label: string | null;
  is_active: boolean;
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
