import { createHash } from 'node:crypto';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { FiatOperationEventInsert } from './types';

function trimOrNull(value: string | null | undefined, maxLen: number): string | null {
  if (value == null) return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/** Stable short fingerprint for PIX EMV payloads (avoid storing full copy-paste in logs). */
export function fingerprintPixEmv(emv: string): string {
  const normalized = emv.trim();
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Persists a fiat UI operation event. Never throws — logging must not break user flows.
 */
export async function insertFiatOperationEvent(event: FiatOperationEventInsert): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    console.warn('[fiat-operations] SUPABASE_SERVICE_ROLE_KEY missing — skip event log', {
      operation: event.operation,
      phase: event.phase,
      status: event.status,
    });
    return;
  }

  const row = {
    operation: event.operation,
    phase: event.phase,
    status: event.status,
    error_code: trimOrNull(event.errorCode, 64),
    error_message: trimOrNull(event.errorMessage, 2000),
    actor_email: trimOrNull(event.actorEmail?.toLowerCase(), 320),
    actor_user_id: trimOrNull(event.actorUserId, 64),
    tax_id: trimOrNull(event.taxId, 32),
    amount_brl: trimOrNull(event.amountBrl, 32),
    provider_tx_id: trimOrNull(event.providerTxId, 128),
    e2e_id: trimOrNull(event.e2eId, 128),
    correlation_id: trimOrNull(event.correlationId, 64),
    idempotency_key: trimOrNull(event.idempotencyKey, 64),
    beneficiary_name: trimOrNull(event.beneficiaryName, 256),
    stage: trimOrNull(event.stage, 32),
    brh_balance_before: trimOrNull(event.brhBalanceBefore, 32),
    metadata: event.metadata ?? {},
  };

  const { error } = await admin.from('fiat_operation_events').insert(row);
  if (error) {
    console.error('[fiat-operations] insert failed', error.message, {
      operation: event.operation,
      phase: event.phase,
    });
  }
}
