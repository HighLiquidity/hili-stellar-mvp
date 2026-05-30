/** BRS on-ramp statuses from On/Off-Ramp API. */
export type RampOnrampStatus =
  | 'pending'
  | 'submitting'
  | 'confirmed'
  | 'insufficient_funds'
  | 'failed'
  | 'needs_review'
  | 'callback_failed';

export type RampOperationType = 'onramp' | 'offramp';

export type RampAssetCode = 'BRH' | 'USDC';

export type RampOperationCategory = 'client' | 'treasury';

export type RampPayoutMethod = 'classic' | 'soroban';

export type RampDepositMethod = 'classic' | 'soroban';

/** On-ramp create request (BRH or USDC rail). */
export type RampOnrampCreateRequest = {
  amount: string;
  externalId: string;
  callbackUrl: string;
  assetCode?: RampAssetCode;
  category?: RampOperationCategory;
  payoutMethod?: RampPayoutMethod;
  /** Stellar public key (G…) or Soroban contract (C…) for USDC payout. */
  destination?: string;
  /** Stellar text memo (max 28 UTF-8 bytes). */
  memo?: string;
};

export type RampOnrampCreateResponse = {
  id: string;
  status: RampOnrampStatus;
  payoutMethod?: RampPayoutMethod;
};

/** Off-ramp statuses from On/Off-Ramp API. */
export type RampOfframpStatus =
  | 'pending'
  | 'awaiting_deposit'
  | 'submitting'
  | 'confirmed'
  | 'completed'
  | 'insufficient_funds'
  | 'failed'
  | 'expired'
  | 'needs_review'
  | 'callback_failed';

/** Off-ramp create request (BRH or USDC rail). */
export type RampOfframpCreateRequest = {
  externalId: string;
  callbackUrl: string;
  assetCode?: RampAssetCode;
  category?: RampOperationCategory;
  depositMethod?: RampDepositMethod;
  /** Required in custodial mode; optional hint otherwise. */
  amount?: string;
};

/** Classic off-ramp deposit instructions returned by the API. */
export type RampOfframpClassicDepositResponse = {
  id: string;
  status: RampOfframpStatus;
  memo: string;
  depositAddress: string;
  expiresAt: string;
  depositMethod?: 'classic';
  custodial?: boolean;
};

/** Soroban USDC deposit instructions (not used in MVP classic flow). */
export type RampOfframpSorobanDepositResponse = {
  id: string;
  status: RampOfframpStatus;
  expiresAt: string;
  depositMethod: 'soroban';
  gatewayContractId: string;
  orderReference: string;
  custodial?: boolean;
};

export type RampOfframpCreateResponse = RampOfframpClassicDepositResponse | RampOfframpSorobanDepositResponse;

export type RampOperationDocument = {
  id: string;
  type: RampOperationType;
  status: string;
  version: number;
  externalId: string;
  assetCode?: RampAssetCode;
  category?: RampOperationCategory;
  custodial?: boolean;
  callbackUrl?: string;
  amount?: string;
  destination?: string;
  memo?: string;
  clientMemo?: string;
  depositAddress?: string;
  expiresAt?: string;
  receivedAmount?: string;
  depositTxHash?: string;
  depositFrom?: string;
  txHash?: string;
  failureReason?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RampCallbackPayload = {
  operationId: string;
  type: RampOperationType;
  status: string;
  version: number;
  data?: Record<string, unknown>;
};

export type RampApiErrorBody = {
  error?: { code?: string; message?: string };
};
