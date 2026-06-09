import '@/lib/server/only';

import type { ApiKeyAuthContext } from '@/lib/api-keys/store';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { loadOperatorCommercialProfileByEmail } from './operator-profile';
import { resolveCommercialTerms } from './resolve';
import type { CommercialTerms } from './types';

export async function resolveApiKeyQuoteCommercialTerms(
  ctx: ApiKeyAuthContext,
  envSpreadBps: number,
): Promise<CommercialTerms> {
  const admin = createSupabaseAdmin();
  const operatorProfile =
    admin && ctx.email ? await loadOperatorCommercialProfileByEmail(admin, ctx.email) : null;

  return resolveCommercialTerms({
    envSpreadBps,
    operatorProfile,
    legacyApiKeySpreadBpsOverride: ctx.spreadBpsOverride,
    legacyApiKeyMaxAmountBrl: ctx.maxAmountBrl,
  });
}
