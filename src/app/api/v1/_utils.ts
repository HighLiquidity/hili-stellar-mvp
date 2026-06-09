import '@/lib/server/only';

import { NextResponse } from 'next/server';

import { ApiRateLimitError } from '@/lib/api-keys/errors';
import type { ApiKeyAuthContext } from '@/lib/api-keys/store';
import {
  BinanceConfigError,
  BinanceRequestError,
  BinanceValidationError,
} from '@/lib/server/binance';
import {
  OfframpConfigError,
  OfframpOperationError,
  OfframpValidationError,
} from '@/lib/offramp/errors';
import {
  OnrampConfigError,
  OnrampOperationError,
  OnrampValidationError,
} from '@/lib/onramp/errors';

export { executeV1Route } from '@/lib/api-keys/execute-v1-route';

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

export function badRequest(message: string) {
  return jsonError(message, 400);
}

export function handleV1OnrampRouteError(error: unknown) {
  if (error instanceof ApiRateLimitError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof OnrampValidationError || error instanceof BinanceValidationError) {
    return jsonError(error.message, 400);
  }

  if (error instanceof OnrampConfigError || error instanceof BinanceConfigError) {
    return jsonError(error.message, 503);
  }

  if (error instanceof BinanceRequestError) {
    return jsonError(error.message, 502, {
      code: error.code,
      upstreamStatus: error.status || undefined,
    });
  }

  if (error instanceof OnrampOperationError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof SyntaxError) {
    return jsonError('Invalid JSON', 400);
  }

  console.error('[api/v1/onramp] unexpected route error', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  });

  return jsonError('Internal server error', 500);
}

export function handleV1OfframpRouteError(error: unknown) {
  if (error instanceof ApiRateLimitError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof OfframpValidationError) {
    return jsonError(error.message, 400);
  }

  if (error instanceof OfframpConfigError) {
    return jsonError(error.message, 503);
  }

  if (error instanceof OfframpOperationError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof SyntaxError) {
    return jsonError('Invalid JSON', 400);
  }

  console.error('[api/v1/offramp] unexpected route error', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  });

  return jsonError('Internal server error', 500);
}

/** API integrators always follow operator whitelist rules (no admin bypass). */
export function apiKeyActor(ctx: ApiKeyAuthContext) {
  return {
    userId: ctx.userId,
    role: 'operator' as const,
    email: ctx.email,
  };
}
