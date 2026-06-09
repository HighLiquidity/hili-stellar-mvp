import '@/lib/server/only';

import type { CommercialTerms, OperatorCommercialProfile } from './types';

export function resolveCommercialTerms(params: {
  envSpreadBps: number;
  operatorProfile?: OperatorCommercialProfile | null;
  /** @deprecated Legacy per-key overrides; operator profile takes precedence. */
  legacyApiKeySpreadBpsOverride?: number | null;
  /** @deprecated Legacy per-key limits; operator profile takes precedence. */
  legacyApiKeyMaxAmountBrl?: string | null;
}): CommercialTerms {
  const operatorSpread = params.operatorProfile?.spreadBpsOverride;
  const operatorMax = params.operatorProfile?.maxAmountBrl?.trim() || null;

  const spreadBps =
    operatorSpread != null
      ? operatorSpread
      : params.legacyApiKeySpreadBpsOverride != null
        ? params.legacyApiKeySpreadBpsOverride
        : params.envSpreadBps;

  const maxAmountBrl =
    operatorMax ??
    (params.legacyApiKeyMaxAmountBrl?.trim() || null);

  return { spreadBps, maxAmountBrl };
}
