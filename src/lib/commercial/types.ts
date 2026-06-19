export type CommercialProfileSource = {
  spreadBpsOverride: number | null;
  maxAmountBrl: string | null;
};

/** @deprecated Use CommercialProfileSource; kept for legacy operator reads. */
export type OperatorCommercialProfile = CommercialProfileSource;

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
