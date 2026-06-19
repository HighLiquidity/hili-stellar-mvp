import type { AccessProfile } from '@/lib/authService';

export type PanelUserRole = AccessProfile['role'];

export type PanelUserRow = AccessProfile & {
  client_id?: string | null;
  client_name?: string | null;
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
};
