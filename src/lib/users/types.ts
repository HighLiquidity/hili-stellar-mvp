import type { AccessProfile } from '@/lib/authService';

export type PanelUserRole = AccessProfile['role'];

export type PanelUserRow = AccessProfile & {
  spread_bps_override?: number | null;
  max_amount_brl?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PanelUserInput = {
  email: string;
  fullName: string;
  role: PanelUserRole;
  password?: string;
  isActive?: boolean;
  spreadBpsOverride?: string;
  maxAmountBrl?: string;
};
