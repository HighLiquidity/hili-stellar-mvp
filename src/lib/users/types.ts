import type { AccessProfile } from '@/lib/authService';

export type PanelUserRole = AccessProfile['role'];

export type PanelUserRow = AccessProfile & {
  client_id?: string | null;
  client_name?: string | null;
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
  clientId?: string;
  /** Operator sub-limit (BRL); must be within client ceiling. */
  maxAmountBrl?: string;
};
