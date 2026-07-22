import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, maybeSingleMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: fromMock }),
}));

vi.mock('@/lib/withdraw-whitelist/onramp-network', async () => {
  const actual = await vi.importActual<typeof import('./onramp-network')>('./onramp-network');
  return {
    ...actual,
    getOnrampWithdrawNetwork: () => 'STELLAR_TESTNET' as const,
  };
});

import {
  cancelWithdrawWhitelistRequest,
  submitWithdrawWhitelistRequest,
} from './submit-request';

const VALID_G = `G${'A'.repeat(55)}`;
const ACTOR = { userId: 'user-1', clientId: 'client-1', email: 'op@example.com' };

function mockExistingLookup(result: { data: unknown; error: unknown }) {
  maybeSingleMock.mockResolvedValue(result);
  fromMock.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: maybeSingleMock,
          }),
        }),
      }),
    }),
  });
}

describe('submitWithdrawWhitelistRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when already approved and active', async () => {
    mockExistingLookup({
      data: { id: 'row-1', approval_status: 'approved', is_active: true },
      error: null,
    });

    await expect(submitWithdrawWhitelistRequest(ACTOR, { address: VALID_G })).rejects.toThrow(
      /Wallet already whitelisted/,
    );
  });

  it('rejects when a pending request already exists', async () => {
    mockExistingLookup({
      data: { id: 'row-1', approval_status: 'pending', is_active: false },
      error: null,
    });

    await expect(submitWithdrawWhitelistRequest(ACTOR, { address: VALID_G })).rejects.toThrow(
      /already pending approval/,
    );
  });

  it('reopens a rejected request as pending', async () => {
    const updatedRow = {
      id: 'row-1',
      user_id: ACTOR.userId,
      address: VALID_G,
      network: 'STELLAR_TESTNET',
      label: null,
      memo: null,
      is_active: false,
      approval_status: 'pending',
      reviewed_at: null,
      reviewed_by_email: null,
      rejection_reason: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      created_by_email: ACTOR.email,
    };

    maybeSingleMock
      .mockResolvedValueOnce({
        data: { id: 'row-1', approval_status: 'rejected', is_active: false },
        error: null,
      })
      .mockResolvedValueOnce({ data: updatedRow, error: null });

    const updateEq = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: () => maybeSingleMock(),
      }),
    });

    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: () => maybeSingleMock(),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: updateEq,
      }),
    });

    const row = await submitWithdrawWhitelistRequest(ACTOR, { address: VALID_G });
    expect(row.id).toBe('row-1');
    expect(row.approval_status).toBe('pending');
    expect(updateEq).toHaveBeenCalled();
  });

  it('requires clientId', async () => {
    await expect(
      submitWithdrawWhitelistRequest({ ...ACTOR, clientId: '  ' }, { address: VALID_G }),
    ).rejects.toThrow(/not linked to a client/);
  });
});

describe('cancelWithdrawWhitelistRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels only pending requests owned by the user', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: 'row-1', user_id: ACTOR.userId, approval_status: 'pending' },
      error: null,
    });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: maybeSingleMock,
        }),
      }),
      delete: vi.fn().mockReturnValue({ eq: deleteEq }),
    });

    await expect(cancelWithdrawWhitelistRequest(ACTOR.userId, 'row-1')).resolves.toEqual({
      id: 'row-1',
    });
    expect(deleteEq).toHaveBeenCalledWith('id', 'row-1');
  });

  it('rejects cancel for non-pending rows', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: 'row-1', user_id: ACTOR.userId, approval_status: 'approved' },
      error: null,
    });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: maybeSingleMock,
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    await expect(cancelWithdrawWhitelistRequest(ACTOR.userId, 'row-1')).rejects.toThrow(
      /Only pending requests/,
    );
  });
});
