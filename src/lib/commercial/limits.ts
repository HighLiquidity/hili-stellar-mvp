import '@/lib/server/only';

import { isDepositAboveMax, parseMaxDepositBrl } from '@/lib/admin-test-settings/deposit-limits';
import { brlStringToJsonNumber } from '@/lib/corpx/pix/brl';
import { OfframpValidationError } from '@/lib/offramp/errors';
import { OnrampValidationError } from '@/lib/onramp/errors';

function throwFlowValidationError(flow: 'onramp' | 'offramp', message: string): never {
  if (flow === 'offramp') throw new OfframpValidationError(message);
  throw new OnrampValidationError(message);
}

export function assertAmountBrlWithinLimit(
  amountBrl: string,
  maxAmountBrl: string | null | undefined,
  flow: 'onramp' | 'offramp',
): void {
  const limit = maxAmountBrl?.trim();
  if (!limit) return;

  const max = parseMaxDepositBrl(limit);
  if (max == null) {
    throwFlowValidationError(flow, 'Client maxAmountBrl is invalid.');
  }

  const amount = brlStringToJsonNumber(amountBrl);
  if (isDepositAboveMax(amount, max)) {
    throwFlowValidationError(flow, `amountBrl exceeds the limit of ${limit}.`);
  }
}
