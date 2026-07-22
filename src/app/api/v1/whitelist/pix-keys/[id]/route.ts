import { NextResponse } from 'next/server';

import { cancelPixWhitelistRequest } from '@/lib/pix-whitelist/submit-request';

import {
  executeV1Route,
  handleV1WhitelistRouteError,
  requireApiKeyClientId,
} from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  return executeV1Route({
    request,
    route: 'DELETE /api/v1/whitelist/pix-keys/:id',
    requiredScope: 'whitelist:write',
    errorHandler: handleV1WhitelistRouteError,
    handler: async (ctx) => {
      requireApiKeyClientId(ctx);
      const result = await cancelPixWhitelistRequest(ctx.userId, id);
      return NextResponse.json(result, { status: 200 });
    },
  });
}
