import '@/lib/server/only';

import { assertAmountBrlWithinLimit } from '@/lib/commercial/limits';
import { resolveApiKeyQuoteCommercialTerms } from '@/lib/commercial/api-key';
import { resolveCommercialTerms } from '@/lib/commercial/resolve';
import {
  parseMaxAmountBrl as parseCommercialMaxAmountBrl,
  parseSpreadBpsOverride as parseCommercialSpreadBpsOverride,
} from '@/lib/commercial/parse';

import type { ApiKeyAuthContext } from './store';

export { assertAmountBrlWithinLimit };

export async function resolveApiKeyCommercialTerms(
  ctx: ApiKeyAuthContext,
  envSpreadBps: number,
  flow: 'onramp' | 'offramp',
) {
  return resolveApiKeyQuoteCommercialTerms(ctx, envSpreadBps, flow);
}

/** @deprecated Use resolveApiKeyCommercialTerms — kept for transitional imports. */
export function resolveApiKeyQuoteSpreadBps(envSpreadBps: number, ctx: ApiKeyAuthContext): number {
  return resolveCommercialTerms({
    envSpreadBps,
    legacyApiKeySpreadBpsOverride: ctx.spreadBpsOverride,
    legacyApiKeyMaxAmountBrl: ctx.maxAmountBrl,
  }).spreadBps;
}

export function assertWithinApiKeyMaxAmountBrl(
  amountBrl: string,
  ctx: ApiKeyAuthContext,
  flow: 'onramp' | 'offramp',
): void {
  assertAmountBrlWithinLimit(amountBrl, ctx.maxAmountBrl, flow);
}

export const parseApiKeySpreadBpsOverride = parseCommercialSpreadBpsOverride;
export const parseApiKeyMaxAmountBrl = parseCommercialMaxAmountBrl;
