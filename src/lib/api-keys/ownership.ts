import '@/lib/server/only';

import { OfframpOperationError } from '@/lib/offramp/errors';
import { OnrampOperationError } from '@/lib/onramp/errors';

type OrderOwnershipRow = {
  created_by_user_id: string | null;
};

export function assertOnrampOrderOwnedByUser(
  order: OrderOwnershipRow | null | undefined,
  userId: string,
): asserts order is OrderOwnershipRow {
  if (!order || order.created_by_user_id !== userId) {
    throw new OnrampOperationError('On-ramp order not found.', 404);
  }
}

export function assertOfframpOrderOwnedByUser(
  order: OrderOwnershipRow | null | undefined,
  userId: string,
): asserts order is OrderOwnershipRow {
  if (!order || order.created_by_user_id !== userId) {
    throw new OfframpOperationError('Off-ramp order not found.', 404);
  }
}
