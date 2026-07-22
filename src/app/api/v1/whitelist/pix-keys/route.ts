import { NextResponse } from 'next/server';

import {
  listPixWhitelistForUser,
  submitPixWhitelistRequest,
} from '@/lib/pix-whitelist/submit-request';
import { WHITELIST_APPROVAL_STATUSES } from '@/lib/whitelist/approval';
import type { WhitelistApprovalStatus } from '@/lib/whitelist/approval';
import {
  toPublicPixWhitelistResponse,
  type PublicPixWhitelistResponse,
  type PublicWhitelistListResponse,
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
  pixKey?: unknown;
  beneficiaryName?: unknown;
  label?: unknown;
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
    route: 'POST /api/v1/whitelist/pix-keys',
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

      if (typeof body.pixKey !== 'string' || !body.pixKey.trim()) {
        return badRequest('pixKey must be provided as a non-empty string');
      }

      const row = await submitPixWhitelistRequest(
        { userId: ctx.userId, clientId, email: ctx.email },
        {
          pixKey: body.pixKey,
          beneficiaryName: readOptionalString(body.beneficiaryName) ?? null,
          label: readOptionalString(body.label) ?? null,
        },
      );

      return NextResponse.json(toPublicPixWhitelistResponse(row), { status: 201 });
    },
  });
}

export async function GET(request: Request) {
  return executeV1Route({
    request,
    route: 'GET /api/v1/whitelist/pix-keys',
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

      const result = await listPixWhitelistForUser({
        userId: ctx.userId,
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      });

      const body: PublicWhitelistListResponse<PublicPixWhitelistResponse> = {
        items: result.rows.map(toPublicPixWhitelistResponse),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
      return NextResponse.json(body, { status: 200 });
    },
  });
}
