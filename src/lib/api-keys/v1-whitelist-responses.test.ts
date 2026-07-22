import { describe, expect, it } from 'vitest';

import {
  toPublicPixWhitelistResponse,
  toPublicWalletWhitelistResponse,
} from '@/lib/api-keys/v1-whitelist-responses';
import type { PixWhitelistRow } from '@/lib/pix-whitelist/types';
import type { WithdrawWhitelistRow } from '@/lib/withdraw-whitelist/types';

describe('public whitelist DTOs', () => {
  it('sanitizes wallet rows without reviewer emails', () => {
    const row: WithdrawWhitelistRow = {
      id: 'w1',
      user_id: 'u1',
      address: `G${'A'.repeat(55)}`,
      network: 'STELLAR_TESTNET',
      label: 'Main',
      memo: 'm1',
      is_active: false,
      approval_status: 'pending',
      reviewed_at: null,
      reviewed_by_email: 'admin@example.com',
      rejection_reason: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      created_by_email: 'op@example.com',
    };

    const pub = toPublicWalletWhitelistResponse(row);
    expect(pub).toEqual({
      id: 'w1',
      approvalStatus: 'pending',
      isActive: false,
      address: row.address,
      network: 'STELLAR_TESTNET',
      label: 'Main',
      memo: 'm1',
      rejectionReason: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    expect(pub).not.toHaveProperty('reviewed_by_email');
    expect(pub).not.toHaveProperty('created_by_email');
  });

  it('sanitizes PIX rows', () => {
    const row: PixWhitelistRow = {
      id: 'p1',
      user_id: 'u1',
      pix_key: 'a@b.com',
      beneficiary_name: 'Acme',
      label: null,
      is_active: true,
      approval_status: 'approved',
      reviewed_at: '2026-01-02T00:00:00.000Z',
      reviewed_by_email: 'admin@example.com',
      rejection_reason: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      created_by_email: 'op@example.com',
    };

    const pub = toPublicPixWhitelistResponse(row);
    expect(pub.pixKey).toBe('a@b.com');
    expect(pub.beneficiaryName).toBe('Acme');
    expect(pub.approvalStatus).toBe('approved');
    expect(pub).not.toHaveProperty('reviewed_by_email');
  });
});
