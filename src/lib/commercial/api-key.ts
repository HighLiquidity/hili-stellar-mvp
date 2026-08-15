import '@/lib/server/only';

import { loadPlatformUsdcMaxBrl } from '@/lib/admin-test-settings/store';
import type { ApiKeyAuthContext } from '@/lib/api-keys/store';
import { OfframpConfigError } from '@/lib/offramp/errors';
import { OnrampConfigError } from '@/lib/onramp/errors';
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

async function loadRequiredPlatformUsdcMax(flow: 'onramp' | 'offramp'): Promise<string> {
  const platformMax = await loadPlatformUsdcMaxBrl(flow);
  if (!platformMax.ok) {
    if (flow === 'offramp') {
      throw new OfframpConfigError(platformMax.reason);
    }
    throw new OnrampConfigError(platformMax.reason);
  }
  return platformMax.data;
}

export async function resolveApiKeyQuoteCommercialTerms(
  ctx: ApiKeyAuthContext,
  envSpreadBps: number,
  flow: 'onramp' | 'offramp',
): Promise<CommercialTerms> {
  const platformMaxAmountBrl = await loadRequiredPlatformUsdcMax(flow);
  const admin = createSupabaseAdmin();

  if (!admin) {
    return resolveCommercialTerms({
      envSpreadBps,
      platformMaxAmountBrl,
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
    platformMaxAmountBrl,
    legacyApiKeySpreadBpsOverride: ctx.spreadBpsOverride,
    legacyApiKeyMaxAmountBrl: ctx.maxAmountBrl,
  });
}
