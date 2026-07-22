import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, maybeSingleMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: fromMock }),
}));

import { cancelPixWhitelistRequest, submitPixWhitelistRequest } from './submit-request';

const ACTOR = { userId: 'user-1', clientId: 'client-1', email: 'op@example.com' };

describe('submitPixWhitelistRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects duplicate pending PIX keys', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: 'p1', approval_status: 'pending', is_active: false },
      error: null,
    });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: maybeSingleMock,
          }),
        }),
      }),
    });

    await expect(
      submitPixWhitelistRequest(ACTOR, { pixKey: 'Finance@Empresa.COM' }),
    ).rejects.toThrow(/already pending approval/);
  });

  it('inserts a new pending PIX key', async () => {
    const created = {
      id: 'p-new',
      user_id: ACTOR.userId,
      pix_key: 'finance@empresa.com',
      beneficiary_name: 'Acme',
      label: null,
      is_active: false,
      approval_status: 'pending',
      reviewed_at: null,
      reviewed_by_email: null,
      rejection_reason: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      created_by_email: ACTOR.email,
    };

    maybeSingleMock
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: created, error: null });

    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: () => maybeSingleMock(),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: () => maybeSingleMock(),
        }),
      }),
    });

    const row = await submitPixWhitelistRequest(ACTOR, {
      pixKey: 'Finance@Empresa.COM',
      beneficiaryName: 'Acme',
    });
    expect(row.pix_key).toBe('finance@empresa.com');
    expect(row.approval_status).toBe('pending');
  });
});

describe('cancelPixWhitelistRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires ownership', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: 'p1', user_id: 'other-user', approval_status: 'pending' },
      error: null,
    });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: maybeSingleMock,
        }),
      }),
    });

    await expect(cancelPixWhitelistRequest(ACTOR.userId, 'p1')).rejects.toThrow(/not found/);
  });
});
