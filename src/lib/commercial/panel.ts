import '@/lib/server/only';

import { loadPlatformUsdcMaxBrl } from '@/lib/admin-test-settings/store';
import { OfframpConfigError } from '@/lib/offramp/errors';
import { OnrampConfigError } from '@/lib/onramp/errors';

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

async function loadRequiredPlatformUsdcMax(
  flow: 'onramp' | 'offramp',
): Promise<string> {
  const platformMax = await loadPlatformUsdcMaxBrl(flow);
  if (!platformMax.ok) {
    if (flow === 'offramp') {
      throw new OfframpConfigError(platformMax.reason);
    }
    throw new OnrampConfigError(platformMax.reason);
  }
  return platformMax.data;
}

export async function resolvePanelQuoteCommercialTerms(
  ctx: PanelAccessContext,
  envSpreadBps: number,
  flow: 'onramp' | 'offramp',
): Promise<CommercialTerms> {
  const platformMaxAmountBrl = await loadRequiredPlatformUsdcMax(flow);

  if (isPlatformAdminRole(ctx.role)) {
    return { spreadBps: envSpreadBps, maxAmountBrl: platformMaxAmountBrl };
  }

  if (!isClientTenantRampActor(ctx.role)) {
    return { spreadBps: envSpreadBps, maxAmountBrl: platformMaxAmountBrl };
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
    platformMaxAmountBrl,
  });
}
