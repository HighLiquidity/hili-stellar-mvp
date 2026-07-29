import '@/lib/server/only';

import { NextResponse } from 'next/server';

import { requireAdminFromAccessToken } from '@/lib/users/require-admin';

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Internal admin-only guard for treasury routes. */
export async function requireTreasuryRouteAdmin(request: Request): Promise<NextResponse | null> {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return jsonError('Authorization Bearer token is required', 401);
  }

  try {
    await requireAdminFromAccessToken(accessToken);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const status = message === 'Acesso restrito a administradores.' ? 403 : 401;
    return jsonError(message, status);
  }
}

export function handleTreasuryRouteError(error: unknown) {
  console.error('[api/treasury] unexpected route error', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  });

  return jsonError('Internal server error', 500);
}
