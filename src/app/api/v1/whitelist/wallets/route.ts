import { NextResponse } from 'next/server';

import {
  listWithdrawWhitelistForUser,
  submitWithdrawWhitelistRequest,
} from '@/lib/withdraw-whitelist/submit-request';
import { WHITELIST_APPROVAL_STATUSES } from '@/lib/whitelist/approval';
import type { WhitelistApprovalStatus } from '@/lib/whitelist/approval';
import {
  toPublicWalletWhitelistResponse,
  type PublicWhitelistListResponse,
  type PublicWalletWhitelistResponse,
} from '@/lib/api-keys/v1-whitelist-responses';

import {
  badRequest,
  executeV1Route,
  handleV1WhitelistRouteError,
  requireApiKeyClientId,
} from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubmitBody = {
  address?: unknown;
  label?: unknown;
  memo?: unknown;
};

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseListQuery(url: URL): {
  status: WhitelistApprovalStatus | null;
  page: number;
  pageSize: number;
} {
  const statusRaw = url.searchParams.get('status')?.trim().toLowerCase() ?? '';
  const status =
    statusRaw && WHITELIST_APPROVAL_STATUSES.includes(statusRaw as WhitelistApprovalStatus)
      ? (statusRaw as WhitelistApprovalStatus)
      : null;
  if (statusRaw && !status) {
    throw new Error('status must be pending, approved, or rejected');
  }

  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '25') || 25));
  return { status, page, pageSize };
}

export async function POST(request: Request) {
  return executeV1Route({
    request,
    route: 'POST /api/v1/whitelist/wallets',
    requiredScope: 'whitelist:write',
    idempotent: true,
    errorHandler: handleV1WhitelistRouteError,
    handler: async (ctx) => {
      const clientId = requireApiKeyClientId(ctx);
      let body: SubmitBody;
      try {
        body = (await request.json()) as SubmitBody;
      } catch {
        return badRequest('Invalid JSON');
      }

      if (typeof body.address !== 'string' || !body.address.trim()) {
        return badRequest('address must be provided as a non-empty string');
      }

      const row = await submitWithdrawWhitelistRequest(
        { userId: ctx.userId, clientId, email: ctx.email },
        {
          address: body.address,
          label: readOptionalString(body.label) ?? null,
          memo: readOptionalString(body.memo) ?? null,
        },
      );

      return NextResponse.json(toPublicWalletWhitelistResponse(row), { status: 201 });
    },
  });
}

export async function GET(request: Request) {
  return executeV1Route({
    request,
    route: 'GET /api/v1/whitelist/wallets',
    requiredScope: 'whitelist:read',
    errorHandler: handleV1WhitelistRouteError,
    handler: async (ctx) => {
      requireApiKeyClientId(ctx);
      const url = new URL(request.url);
      let query: ReturnType<typeof parseListQuery>;
      try {
        query = parseListQuery(url);
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : String(error));
      }

      const result = await listWithdrawWhitelistForUser({
        userId: ctx.userId,
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      });

      const body: PublicWhitelistListResponse<PublicWalletWhitelistResponse> = {
        items: result.rows.map(toPublicWalletWhitelistResponse),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
      return NextResponse.json(body, { status: 200 });
    },
  });
}
