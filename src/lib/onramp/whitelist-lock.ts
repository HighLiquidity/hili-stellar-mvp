import '@/lib/server/only';

import { isOnrampQuotePlaceholderDestination } from '@/lib/ramp/quote-placeholders';
import type { PanelUserRole } from '@/lib/users/types';
import { getOnrampWithdrawNetwork } from '@/lib/withdraw-whitelist/onramp-network';
import {
  findActiveWithdrawWhitelistEntry,
  findActiveWithdrawWhitelistEntryForUser,
} from '@/lib/withdraw-whitelist/store';

import { OnrampOperationError } from './errors';
import { normalizeOnrampDestinationAddress } from './quote';

export async function resolveWhitelistedOnrampDestination(params: {
  role: PanelUserRole;
  userId: string;
  destinationAddress: string;
}): Promise<{ address: string; memo: string | null }> {
  const network = getOnrampWithdrawNetwork();
  const normalizedAddress = normalizeOnrampDestinationAddress(params.destinationAddress);

  if (isOnrampQuotePlaceholderDestination(normalizedAddress)) {
    throw new OnrampOperationError(
      'Select a whitelisted wallet before locking this on-ramp quote.',
      403,
    );
  }

  const entry =
    params.role === 'admin'
      ? await findActiveWithdrawWhitelistEntry({
          address: normalizedAddress,
          network,
        })
      : await findActiveWithdrawWhitelistEntryForUser({
          userId: params.userId,
          address: normalizedAddress,
          network,
        });

  if (!entry) {
    throw new OnrampOperationError(
      `Destination address is not whitelisted for on-ramp network ${network}.`,
      403,
    );
  }

  return {
    address: entry.address,
    memo: entry.memo,
  };
}
