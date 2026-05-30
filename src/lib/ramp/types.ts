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

/** Custodial on-ramp; optional destination + memo for client USDC payout on Stellar. */
export type RampOnrampCreateRequest = {
  amount: string;
  externalId: string;
  callbackUrl: string;
  /** Stellar public key (G…) when the provider routes USDC to the end user. */
  destination?: string;
  /** Stellar text memo (max 28 UTF-8 bytes). */
  memo?: string;
};

export type RampOnrampCreateResponse = {
  id: string;
  status: RampOnrampStatus;
};

/** Off-ramp statuses from On/Off-Ramp API (custodial burn is provider-side). */
export type RampOfframpStatus =
  | 'pending'
  | 'awaiting_deposit'
  | 'submitting'
  | 'confirmed'
  | 'insufficient_funds'
  | 'failed'
  | 'needs_review'
  | 'callback_failed';

/** Custodial off-ramp: amount + externalId only; no deposit address or memo. */
export type RampOfframpCreateRequest = {
  amount: string;
  externalId: string;
  callbackUrl: string;
};

export type RampOfframpCreateResponse = {
  id: string;
  status: RampOfframpStatus;
};

export type RampOperationDocument = {
  id: string;
  type: RampOperationType;
  status: string;
  version: number;
  externalId: string;
  amount?: string;
  destination?: string;
  memo?: string;
  txHash?: string;
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
