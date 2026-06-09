import '@/lib/server/only';

import { isDepositAboveMax, parseMaxDepositBrl } from '@/lib/admin-test-settings/deposit-limits';
import { brlStringToJsonNumber } from '@/lib/corpx/pix/brl';
import { OfframpValidationError } from '@/lib/offramp/errors';
import { OnrampValidationError } from '@/lib/onramp/errors';

import type { ApiKeyAuthContext } from './store';

export function resolveApiKeyQuoteSpreadBps(envSpreadBps: number, ctx: ApiKeyAuthContext): number {
  if (ctx.spreadBpsOverride == null) {
    return envSpreadBps;
  }
  return ctx.spreadBpsOverride;
}

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
    throwFlowValidationError(flow, 'API key maxAmountBrl is invalid.');
  }

  const amount = brlStringToJsonNumber(amountBrl);
  if (isDepositAboveMax(amount, max)) {
    throwFlowValidationError(flow, `amountBrl exceeds the API key limit of ${limit}.`);
  }
}

export function assertWithinApiKeyMaxAmountBrl(
  amountBrl: string,
  ctx: ApiKeyAuthContext,
  flow: 'onramp' | 'offramp',
): void {
  assertAmountBrlWithinLimit(amountBrl, ctx.maxAmountBrl, flow);
}

export function parseApiKeySpreadBpsOverride(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error('spreadBpsOverride must be an integer between 0 and 10000.');
  }

  return parsed;
}

export function parseApiKeyMaxAmountBrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const max = parseMaxDepositBrl(trimmed);
  if (max == null || max <= 0) {
    throw new Error('maxAmountBrl must be a positive BRL amount with up to 2 decimals.');
  }

  return trimmed;
}
