export type OperatorCommercialProfile = {
  spreadBpsOverride: number | null;
  maxAmountBrl: string | null;
};

export type CommercialTerms = {
  spreadBps: number;
  maxAmountBrl: string | null;
};

export const EMPTY_OPERATOR_COMMERCIAL_PROFILE: OperatorCommercialProfile = {
  spreadBpsOverride: null,
  maxAmountBrl: null,
};
