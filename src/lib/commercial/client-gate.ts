import '@/lib/server/only';

import type { ClientStatus } from '@/lib/clients/types';
import { OfframpValidationError } from '@/lib/offramp/errors';
import { OnrampValidationError } from '@/lib/onramp/errors';

function throwFlowValidationError(flow: 'onramp' | 'offramp', message: string): never {
  if (flow === 'offramp') throw new OfframpValidationError(message);
  throw new OnrampValidationError(message);
}

export function assertClientEligibleForQuotes(
  client: { status: ClientStatus } | null | undefined,
  flow: 'onramp' | 'offramp',
): void {
  if (!client) {
    throwFlowValidationError(flow, 'Client is not configured for this user.');
  }

  if (client.status !== 'active') {
    throwFlowValidationError(flow, `Client status "${client.status}" does not allow quoting.`);
  }
}
