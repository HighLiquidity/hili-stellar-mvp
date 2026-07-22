import type { KybStatus, KycStatus } from './compliance-types';

export type ClientStatus = 'draft' | 'active' | 'suspended' | 'archived';

export const CLIENT_STATUSES: ClientStatus[] = ['draft', 'active', 'suspended', 'archived'];

export type ClientType = 'company' | 'individual';

export const CLIENT_TYPES: ClientType[] = ['company', 'individual'];

export type ClientRow = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  tax_id: string;
  contact_email: string | null;
  status: ClientStatus;
  spread_bps_override: number | null;
  max_amount_brl: string | null;
  created_at: string;
  updated_at: string;
  created_by_email: string | null;
  client_type: ClientType;
  kyb_status?: KybStatus;
  kyc_status?: KycStatus;
};

export type ClientInput = {
  legalName: string;
  tradeName?: string | null;
  taxId: string;
  contactEmail?: string | null;
  status?: ClientStatus;
  clientType?: ClientType;
  spreadBpsOverride?: string;
  maxAmountBrl?: string;
};

export type ClientUpdateInput = Partial<ClientInput>;
