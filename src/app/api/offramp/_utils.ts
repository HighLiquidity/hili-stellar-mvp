import '@/lib/server/only';

import { NextResponse } from 'next/server';

import {
  OfframpConfigError,
  OfframpOperationError,
  OfframpValidationError,
} from '@/lib/offramp/errors';
import {
  requireAdminFromAccessToken,
  type PanelAccessContext,
} from '@/lib/users/require-panel-role';

type RouteAuthResult =
  | { ok: true; ctx: PanelAccessContext }
  | { ok: false; response: NextResponse };

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Internal off-ramp routes are currently restricted to admin users. */
export async function requireOfframpRouteOperator(request: Request): Promise<RouteAuthResult> {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return {
      ok: false,
      response: jsonError('Authorization Bearer token is required', 401),
    };
  }

  try {
    const ctx = await requireAdminFromAccessToken(accessToken);
    return { ok: true, ctx };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const status =
      message === 'Acesso restrito a administradores ou operadores.'
        ? 403
        : message === 'Acesso restrito a administradores.'
          ? 403
          : 401;

    return {
      ok: false,
      response: jsonError(message, status),
    };
  }
}

export function badRequest(message: string) {
  return jsonError(message, 400);
}

export function handleOfframpRouteError(error: unknown) {
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

  console.error('[api/offramp] unexpected route error', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  });

  return jsonError('Internal server error', 500);
}
