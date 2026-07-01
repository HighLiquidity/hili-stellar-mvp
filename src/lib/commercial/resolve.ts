import '@/lib/server/only';

import { tightenMaxAmountBrl } from './operator-limits';
import type { CommercialProfileSource, CommercialTerms, OperatorCommercialProfile } from './types';

export function resolveCommercialTerms(params: {
  envSpreadBps: number;
  clientProfile?: CommercialProfileSource | null;
  /** Operator sub-limit (max BRL only); spread is ignored. */
  operatorProfile?: OperatorCommercialProfile | null;
  /** @deprecated Legacy per-key overrides; client profile takes precedence. */
  legacyApiKeySpreadBpsOverride?: number | null;
  /** @deprecated Legacy per-key limits; client/operator profile takes precedence. */
  legacyApiKeyMaxAmountBrl?: string | null;
}): CommercialTerms {
  const clientSpread = params.clientProfile?.spreadBpsOverride;
  const clientMax = params.clientProfile?.maxAmountBrl?.trim() || null;
  const operatorMax = params.operatorProfile?.maxAmountBrl?.trim() || null;

  const spreadBps =
    clientSpread != null
      ? clientSpread
      : params.legacyApiKeySpreadBpsOverride != null
        ? params.legacyApiKeySpreadBpsOverride
        : params.envSpreadBps;

  const maxAmountBrl =
    tightenMaxAmountBrl(clientMax, operatorMax) ??
    (params.legacyApiKeyMaxAmountBrl?.trim() || null);

  return { spreadBps, maxAmountBrl };
}
