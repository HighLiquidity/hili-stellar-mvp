import '@/lib/server/only';

import type { ApiKeyAuthContext } from '@/lib/api-keys/store';
import {
  assertOfframpOrderInDataScope,
  assertOnrampOrderInDataScope,
  resolveApiKeyDataScope,
  type DataScope,
  type TenantScopedRow,
} from '@/lib/clients/scope';
import { OfframpOperationError } from '@/lib/offramp/errors';
import { OnrampOperationError } from '@/lib/onramp/errors';

export type OrderOwnershipRow = TenantScopedRow;

function throwFlowNotFoundOnramp(): never {
  throw new OnrampOperationError('On-ramp order not found.', 404);
}

function throwFlowNotFoundOfframp(): never {
  throw new OfframpOperationError('Off-ramp order not found.', 404);
}

export function assertOnrampOrderOwnedByUser(
  order: OrderOwnershipRow | null | undefined,
  userId: string,
  clientId?: string | null,
): asserts order is OrderOwnershipRow {
  const scope = clientId?.trim() ? { mode: 'client' as const, clientId: clientId.trim() } : null;
  assertOnrampOrderInDataScope(order, scope, { userId });
}

export function assertOfframpOrderOwnedByUser(
  order: OrderOwnershipRow | null | undefined,
  userId: string,
  clientId?: string | null,
): asserts order is OrderOwnershipRow {
  const scope = clientId?.trim() ? { mode: 'client' as const, clientId: clientId.trim() } : null;
  assertOfframpOrderInDataScope(order, scope, { userId });
}

export function assertOnrampOrderOwnedByApiKey(
  order: OrderOwnershipRow | null | undefined,
  ctx: ApiKeyAuthContext,
): asserts order is OrderOwnershipRow {
  const scope = resolveApiKeyDataScope(ctx);
  if (scope) {
    assertOnrampOrderInDataScope(order, scope, { userId: ctx.userId });
    return;
  }

  if (!order || order.created_by_user_id !== ctx.userId) {
    throwFlowNotFoundOnramp();
  }
}

export function assertOfframpOrderOwnedByApiKey(
  order: OrderOwnershipRow | null | undefined,
  ctx: ApiKeyAuthContext,
): asserts order is OrderOwnershipRow {
  const scope = resolveApiKeyDataScope(ctx);
  if (scope) {
    assertOfframpOrderInDataScope(order, scope, { userId: ctx.userId });
    return;
  }

  if (!order || order.created_by_user_id !== ctx.userId) {
    throwFlowNotFoundOfframp();
  }
}

export function assertOnrampOrderInScope(
  order: OrderOwnershipRow | null | undefined,
  scope: DataScope,
  userId: string,
): asserts order is OrderOwnershipRow {
  assertOnrampOrderInDataScope(order, scope, { userId });
}

export function assertOfframpOrderInScope(
  order: OrderOwnershipRow | null | undefined,
  scope: DataScope,
  userId: string,
): asserts order is OrderOwnershipRow {
  assertOfframpOrderInDataScope(order, scope, { userId });
}
