import '@/lib/server/only';

import { isClientKybRequired } from '@/lib/clients/compliance-config';
import type { KybStatus } from '@/lib/clients/compliance-types';
import type { ClientStatus } from '@/lib/clients/types';
import { OfframpValidationError } from '@/lib/offramp/errors';
import { OnrampValidationError } from '@/lib/onramp/errors';

function throwFlowValidationError(flow: 'onramp' | 'offramp', message: string): never {
  if (flow === 'offramp') throw new OfframpValidationError(message);
  throw new OnrampValidationError(message);
}

export type ClientQuoteEligibility = {
  status: ClientStatus;
  kybStatus?: KybStatus | null;
};

export function assertClientEligibleForQuotes(
  client: ClientQuoteEligibility | null | undefined,
  flow: 'onramp' | 'offramp',
): void {
  if (!client) {
    throwFlowValidationError(flow, 'Client is not configured for this user.');
  }

  if (client.status !== 'active') {
    throwFlowValidationError(flow, `Client status "${client.status}" does not allow quoting.`);
  }

  if (isClientKybRequired()) {
    const kybStatus = client.kybStatus ?? 'not_started';
    if (kybStatus !== 'approved') {
      throwFlowValidationError(flow, `Client KYB status "${kybStatus}" does not allow quoting.`);
    }
  }
}
