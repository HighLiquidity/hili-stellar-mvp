export type WebhookRequiresAction =
  | 'update_balance'
  | 'mark_settlement_complete'
  | 'mark_settlement_failed';

export type WebhookProcessingResult = {
  providerTxId?: string;
  eventType: string;
  status: 'completed' | 'failed';
  errorMessage?: string;
  updatedFields?: Record<string, unknown>;
  requiresAction?: WebhookRequiresAction;
};

export type CorpXWebhookEventInput = {
  eventType: string;
  payload: unknown;
};
