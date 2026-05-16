import type { CorpXAuthManager } from '../auth/auth-manager';

export type BalanceRequest = {
  accountId: string;
};

export type BalanceResponse = {
  accountId: string;
  /** Decimal strings (boundary-safe, like Go decimal at app edge). */
  available: string;
  reserved: string;
  total: string;
  currency: string;
  lastUpdated: string;
};

export type TransactionHistoryRequest = {
  accountId: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
};

/** Normalized ledger line — maps from CorpX statement rows (adapter.go). */
export type LedgerTransactionStatus = 'completed' | 'pending' | 'failed';

export type Transaction = {
  providerTxId: string;
  type: 'credit' | 'debit';
  amount: string;
  currency: string;
  description: string;
  status: LedgerTransactionStatus;
  timestamp: string;
  referenceId: string;
};

export type TransactionHistoryResponse = {
  transactions: Transaction[];
  totalCount: number;
  hasMore: boolean;
};

export type ProviderCapabilities = {
  supportsPIX: boolean;
  supportsPIXCashOut: boolean;
  supportsTED: boolean;
  supportsBoleto: boolean;
  supportsWebhooks: boolean;
  supportsBalanceQuery: boolean;
  supportsTxHistory: boolean;
};

export type ProviderInfo = {
  name: string;
  type: string;
  version: string;
  capabilities: ProviderCapabilities;
  healthStatus: string;
  /** ISO 8601 */
  lastHealthCheck: string;
};

export type CorpXAdapterConfig = {
  apiBaseURL: string;
  auth: CorpXAuthManager;
  accountId: string;
  pixKey: string;
  /** Webhook source IP allowlist (see {@link loadWebhookAllowlistForAdapter}). */
  webhookIpAllowlist: ReadonlySet<string>;
  timeoutMs?: number;
};
