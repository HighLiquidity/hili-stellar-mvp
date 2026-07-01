import '@/lib/server/only';

import type { ApiKeyAuthContext } from '@/lib/api-keys/store';
import { OfframpOperationError } from '@/lib/offramp/errors';
import { OnrampOperationError } from '@/lib/onramp/errors';
import type { PanelAccessContext } from '@/lib/users/require-panel-role';
import type { PanelUserRole } from '@/lib/users/types';

export type DataScope =
  | { mode: 'platform' }
  | { mode: 'client'; clientId: string };

export type TenantScopedRow = {
  client_id?: string | null;
  created_by_user_id?: string | null;
};

export function resolvePanelDataScope(ctx: PanelAccessContext): DataScope {
  if (ctx.role === 'admin') {
    return { mode: 'platform' };
  }

  const clientId = ctx.clientId?.trim();
  if (!clientId) {
    throw new Error('Panel user is not linked to a client.');
  }

  return { mode: 'client', clientId };
}

export function resolveApiKeyDataScope(ctx: ApiKeyAuthContext): DataScope | null {
  const clientId = ctx.clientId?.trim();
  if (!clientId) return null;
  return { mode: 'client', clientId };
}

export function rowMatchesDataScope(
  row: TenantScopedRow,
  scope: DataScope | null,
  userId?: string,
): boolean {
  if (!scope || scope.mode === 'platform') {
    return true;
  }

  const resourceClientId = row.client_id?.trim();
  if (resourceClientId) {
    return resourceClientId === scope.clientId;
  }

  const normalizedUserId = userId?.trim();
  return Boolean(normalizedUserId && row.created_by_user_id === normalizedUserId);
}

function throwFlowNotFound(flow: 'onramp' | 'offramp'): never {
  const message = flow === 'offramp' ? 'Off-ramp order not found.' : 'On-ramp order not found.';
  if (flow === 'offramp') throw new OfframpOperationError(message, 404);
  throw new OnrampOperationError(message, 404);
}

export function assertOnrampOrderInDataScope(
  order: TenantScopedRow | null | undefined,
  scope: DataScope | null,
  options?: { userId?: string },
): asserts order is TenantScopedRow {
  if (!order) {
    throwFlowNotFound('onramp');
  }

  if (!scope) {
    const userId = options?.userId?.trim();
    if (!userId || order.created_by_user_id !== userId) {
      throwFlowNotFound('onramp');
    }
    return;
  }

  if (!rowMatchesDataScope(order, scope, options?.userId)) {
    throwFlowNotFound('onramp');
  }
}

export function assertOfframpOrderInDataScope(
  order: TenantScopedRow | null | undefined,
  scope: DataScope | null,
  options?: { userId?: string },
): asserts order is TenantScopedRow {
  if (!order) {
    throwFlowNotFound('offramp');
  }

  if (!scope) {
    const userId = options?.userId?.trim();
    if (!userId || order.created_by_user_id !== userId) {
      throwFlowNotFound('offramp');
    }
    return;
  }

  if (!rowMatchesDataScope(order, scope, options?.userId)) {
    throwFlowNotFound('offramp');
  }
}

export function resolveListClientId(scope: DataScope): string | undefined {
  return scope.mode === 'client' ? scope.clientId : undefined;
}

export function panelRampActor(ctx: PanelAccessContext): {
  userId: string;
  role: PanelUserRole;
  dataScope: DataScope;
} {
  return {
    userId: ctx.userId,
    role: ctx.role,
    dataScope: resolvePanelDataScope(ctx),
  };
}
