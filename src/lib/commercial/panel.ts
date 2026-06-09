import '@/lib/server/only';

import { loadOperatorCommercialProfileByEmail } from './operator-profile';
import { resolveCommercialTerms } from './resolve';
import type { CommercialTerms } from './types';
import type { PanelAccessContext } from '@/lib/users/require-panel-role';

export async function resolvePanelQuoteCommercialTerms(
  ctx: PanelAccessContext,
  envSpreadBps: number,
): Promise<CommercialTerms> {
  if (ctx.role !== 'operator') {
    return { spreadBps: envSpreadBps, maxAmountBrl: null };
  }

  const operatorProfile = await loadOperatorCommercialProfileByEmail(ctx.admin, ctx.email);
  return resolveCommercialTerms({ envSpreadBps, operatorProfile });
}
