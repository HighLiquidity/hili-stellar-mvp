export type WithdrawWhitelistNetwork = 'STELLAR_TESTNET' | 'STELLAR_PUBLIC';

export type WithdrawWhitelistRow = {
  id: string;
  user_id: string;
  address: string;
  network: WithdrawWhitelistNetwork;
  label: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_email: string | null;
};

export type WithdrawWhitelistInsert = {
  userId: string;
  address: string;
  network: WithdrawWhitelistNetwork;
  label?: string | null;
  isActive?: boolean;
  createdByEmail?: string | null;
};
