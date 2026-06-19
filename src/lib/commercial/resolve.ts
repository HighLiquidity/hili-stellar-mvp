import '@/lib/server/only';

import type { CommercialProfileSource, CommercialTerms, OperatorCommercialProfile } from './types';

export function resolveCommercialTerms(params: {
  envSpreadBps: number;
  clientProfile?: CommercialProfileSource | null;
  /** @deprecated Legacy operator profile; client profile takes precedence. */
  operatorProfile?: OperatorCommercialProfile | null;
  /** @deprecated Legacy per-key overrides; client/operator profile takes precedence. */
  legacyApiKeySpreadBpsOverride?: number | null;
  /** @deprecated Legacy per-key limits; client/operator profile takes precedence. */
  legacyApiKeyMaxAmountBrl?: string | null;
}): CommercialTerms {
  const clientSpread = params.clientProfile?.spreadBpsOverride;
  const clientMax = params.clientProfile?.maxAmountBrl?.trim() || null;
  const operatorSpread = params.operatorProfile?.spreadBpsOverride;
  const operatorMax = params.operatorProfile?.maxAmountBrl?.trim() || null;

  const spreadBps =
    clientSpread != null
      ? clientSpread
      : operatorSpread != null
        ? operatorSpread
        : params.legacyApiKeySpreadBpsOverride != null
          ? params.legacyApiKeySpreadBpsOverride
          : params.envSpreadBps;

  const maxAmountBrl =
    clientMax ?? operatorMax ?? (params.legacyApiKeyMaxAmountBrl?.trim() || null);

  return { spreadBps, maxAmountBrl };
}
