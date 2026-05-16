export type FiatOperationEventRow = {
  id: string;
  created_at: string;
  operation: 'fiat_deposit' | 'fiat_withdraw';
  phase: string;
  status: 'success' | 'error';
  error_code: string | null;
  error_message: string | null;
  actor_email: string | null;
  actor_user_id: string | null;
  tax_id: string | null;
  amount_brl: string | null;
  provider_tx_id: string | null;
  e2e_id: string | null;
  correlation_id: string | null;
  idempotency_key: string | null;
  beneficiary_name: string | null;
  stage: string | null;
  brh_balance_before: string | null;
  metadata: Record<string, unknown> | null;
};

export const FIAT_OPERATION_EVENTS_TABLE = 'fiat_operation_events';
