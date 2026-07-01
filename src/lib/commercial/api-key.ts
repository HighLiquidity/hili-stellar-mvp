import '@/lib/server/only';

import type { ApiKeyAuthContext } from '@/lib/api-keys/store';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { assertClientEligibleForQuotes } from './client-gate';
import {
  loadClientCommercialRecordById,
  loadClientCommercialRecordByUserEmail,
  toCommercialProfileSource,
} from './client-profile';
import { loadOperatorCommercialProfileByEmail } from './operator-profile';
import { resolveCommercialTerms } from './resolve';
import type { CommercialTerms } from './types';

export async function resolveApiKeyQuoteCommercialTerms(
  ctx: ApiKeyAuthContext,
  envSpreadBps: number,
  flow: 'onramp' | 'offramp',
): Promise<CommercialTerms> {
  const admin = createSupabaseAdmin();

  if (!admin) {
    return resolveCommercialTerms({
      envSpreadBps,
      legacyApiKeySpreadBpsOverride: ctx.spreadBpsOverride,
      legacyApiKeyMaxAmountBrl: ctx.maxAmountBrl,
    });
  }

  const clientRecord = ctx.clientId
    ? await loadClientCommercialRecordById(admin, ctx.clientId)
    : ctx.email
      ? await loadClientCommercialRecordByUserEmail(admin, ctx.email)
      : null;

  if (clientRecord) {
    assertClientEligibleForQuotes(clientRecord, flow);
  }

  const operatorProfile =
    ctx.email ? await loadOperatorCommercialProfileByEmail(admin, ctx.email) : null;

  return resolveCommercialTerms({
    envSpreadBps,
    clientProfile: toCommercialProfileSource(clientRecord),
    operatorProfile,
    legacyApiKeySpreadBpsOverride: ctx.spreadBpsOverride,
    legacyApiKeyMaxAmountBrl: ctx.maxAmountBrl,
  });
}
