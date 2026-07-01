import { NextResponse } from 'next/server';

import { listV1OnrampOrdersForClient } from '@/lib/api-keys/v1-list-orders';

import { badRequest, executeV1Route, handleV1OnrampRouteError } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'GET /api/v1/onramp/orders';

function readPositiveInt(value: string | null, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  return executeV1Route({
    request,
    route: ROUTE,
    requiredScope: 'orders:read',
    errorHandler: handleV1OnrampRouteError,
    handler: async (ctx) => {
      const url = new URL(request.url);
      const page = readPositiveInt(url.searchParams.get('page'), 1);
      const pageSize = readPositiveInt(url.searchParams.get('pageSize'), 25);
      const status = url.searchParams.get('status')?.trim() || undefined;
      const externalId = url.searchParams.get('externalId')?.trim() || undefined;

      if (pageSize > 100) {
        return badRequest('pageSize cannot exceed 100');
      }

      if (!ctx.clientId) {
        return badRequest('API key is not linked to a client.');
      }

      const result = await listV1OnrampOrdersForClient({
        clientId: ctx.clientId,
        page,
        pageSize,
        status,
        externalId,
      });

      return NextResponse.json(result, { status: 200 });
    },
  });
}
