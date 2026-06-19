import '@/lib/server/only';

import { assertClientEligibleForQuotes } from './client-gate';
import { loadClientCommercialRecordById, toCommercialProfileSource } from './client-profile';
import { loadOperatorCommercialProfileByEmail } from './operator-profile';
import { resolveCommercialTerms } from './resolve';
import type { CommercialTerms } from './types';
import type { PanelAccessContext } from '@/lib/users/require-panel-role';

export async function resolvePanelQuoteCommercialTerms(
  ctx: PanelAccessContext,
  envSpreadBps: number,
  flow: 'onramp' | 'offramp',
): Promise<CommercialTerms> {
  if (ctx.role !== 'operator') {
    return { spreadBps: envSpreadBps, maxAmountBrl: null };
  }

  const clientRecord = ctx.clientId
    ? await loadClientCommercialRecordById(ctx.admin, ctx.clientId)
    : null;

  assertClientEligibleForQuotes(clientRecord, flow);

  const operatorProfile = await loadOperatorCommercialProfileByEmail(ctx.admin, ctx.email);

  return resolveCommercialTerms({
    envSpreadBps,
    clientProfile: toCommercialProfileSource(clientRecord),
    operatorProfile,
  });
}
