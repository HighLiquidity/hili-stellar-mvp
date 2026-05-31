import '@/lib/server/only';

import { isOfframpQuotePlaceholderPixKey, OFFRAMP_QUOTE_PLACEHOLDER_PIX_KEY } from '@/lib/ramp/quote-placeholders';
import {
  findActivePixWhitelistEntry,
  findActivePixWhitelistEntryForUser,
} from '@/lib/pix-whitelist/store';
import type { PanelUserRole } from '@/lib/users/types';

import { OfframpOperationError } from './errors';
import { normalizeOfframpPayoutPixKey } from './quote';

export async function resolveWhitelistedOfframpPayout(params: {
  role: PanelUserRole;
  userId: string;
  payoutPixKey: string;
  payoutBeneficiaryName?: string | null;
}): Promise<{ pixKey: string; beneficiaryName: string | null }> {
  const normalizedKey = normalizeOfframpPayoutPixKey(params.payoutPixKey);

  if (isOfframpQuotePlaceholderPixKey(normalizedKey)) {
    throw new OfframpOperationError(
      'Select a whitelisted PIX key before locking this off-ramp quote.',
      403,
    );
  }

  const entry =
    params.role === 'admin'
      ? await findActivePixWhitelistEntry({ pixKey: normalizedKey })
      : await findActivePixWhitelistEntryForUser({
          userId: params.userId,
          pixKey: normalizedKey,
        });

  if (!entry) {
    throw new OfframpOperationError('Payout PIX key is not whitelisted for off-ramp.', 403);
  }

  const beneficiaryName =
    typeof params.payoutBeneficiaryName === 'string' && params.payoutBeneficiaryName.trim()
      ? params.payoutBeneficiaryName.trim()
      : entry.beneficiary_name;

  return {
    pixKey: entry.pix_key,
    beneficiaryName,
  };
}

export { OFFRAMP_QUOTE_PLACEHOLDER_PIX_KEY };
