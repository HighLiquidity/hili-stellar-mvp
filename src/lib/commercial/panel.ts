import '@/lib/server/only';

import { assertClientEligibleForQuotes } from './client-gate';
import { loadClientCommercialRecordById, toCommercialProfileSource } from './client-profile';
import { loadOperatorCommercialProfileByEmail } from './operator-profile';
import { resolveCommercialTerms } from './resolve';
import type { CommercialTerms } from './types';
import type { PanelAccessContext } from '@/lib/users/require-panel-role';
import {
  isClientTenantRampActor,
  isOperatorRole,
  isPlatformAdminRole,
} from '@/lib/users/roles';

export async function resolvePanelQuoteCommercialTerms(
  ctx: PanelAccessContext,
  envSpreadBps: number,
  flow: 'onramp' | 'offramp',
): Promise<CommercialTerms> {
  if (isPlatformAdminRole(ctx.role)) {
    return { spreadBps: envSpreadBps, maxAmountBrl: null };
  }

  if (!isClientTenantRampActor(ctx.role)) {
    return { spreadBps: envSpreadBps, maxAmountBrl: null };
  }

  const clientId = ctx.clientId?.trim();
  if (!clientId) {
    throw new Error('Panel user is not linked to a client.');
  }

  const clientRecord = await loadClientCommercialRecordById(ctx.admin, clientId);

  assertClientEligibleForQuotes(clientRecord, flow);

  const operatorProfile = isOperatorRole(ctx.role)
    ? await loadOperatorCommercialProfileByEmail(ctx.admin, ctx.email)
    : null;

  return resolveCommercialTerms({
    envSpreadBps,
    clientProfile: toCommercialProfileSource(clientRecord),
    operatorProfile,
  });
}
