import '@/lib/server/only';

import { isDepositAboveMax, parseMaxDepositBrl } from '@/lib/admin-test-settings/deposit-limits';
import { brlStringToJsonNumber } from '@/lib/corpx/pix/brl';

export function tightenMaxAmountBrl(
  clientMax: string | null | undefined,
  operatorMax: string | null | undefined,
): string | null {
  const client = clientMax?.trim() || null;
  const operator = operatorMax?.trim() || null;

  if (!client) return operator;
  if (!operator) return client;

  const clientValue = parseMaxDepositBrl(client);
  const operatorValue = parseMaxDepositBrl(operator);
  if (clientValue == null || operatorValue == null) {
    return operator;
  }

  return isDepositAboveMax(operatorValue, clientValue) ? client : operator;
}

export function assertOperatorMaxWithinClientCeiling(
  operatorMax: string | null | undefined,
  clientMax: string | null | undefined,
): void {
  const operator = operatorMax?.trim();
  if (!operator) return;

  const client = clientMax?.trim();
  if (!client) return;

  const clientLimit = parseMaxDepositBrl(client);
  const operatorLimit = parseMaxDepositBrl(operator);
  if (clientLimit == null) {
    throw new Error('Client maxAmountBrl is invalid.');
  }
  if (operatorLimit == null) {
    throw new Error('Operator maxAmountBrl is invalid.');
  }

  const operatorAmount = brlStringToJsonNumber(operator);
  if (isDepositAboveMax(operatorAmount, clientLimit)) {
    throw new Error(`Operator maxAmountBrl cannot exceed the client limit of ${client}.`);
  }
}
