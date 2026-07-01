export type CommercialProfileSource = {
  spreadBpsOverride: number | null;
  maxAmountBrl: string | null;
};

/** Operator sub-limit (max BRL only); spread is ignored at resolve time. */
export type OperatorCommercialProfile = {
  spreadBpsOverride?: number | null;
  maxAmountBrl: string | null;
};

export type CommercialTerms = {
  spreadBps: number;
  maxAmountBrl: string | null;
};

export const EMPTY_COMMERCIAL_PROFILE_SOURCE: CommercialProfileSource = {
  spreadBpsOverride: null,
  maxAmountBrl: null,
};

export const EMPTY_OPERATOR_COMMERCIAL_PROFILE: OperatorCommercialProfile =
  EMPTY_COMMERCIAL_PROFILE_SOURCE;
