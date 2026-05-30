import { beforeEach, describe, expect, it, vi } from 'vitest';

const createOfframpOperationMock = vi.fn();
const getRampOperationMock = vi.fn();
const findRampOperationByExternalIdMock = vi.fn();
const insertRampOperationPendingMock = vi.fn();
const updateRampOperationAfterCreateMock = vi.fn();

vi.mock('./client', () => ({
  createOfframpOperation: createOfframpOperationMock,
  getRampOperation: getRampOperationMock,
  RampApiError: class RampApiError extends Error {
    code: string;
    httpStatus: number;
    constructor(code: string, httpStatus: number, message: string) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
    }
  },
}));

vi.mock('./operation-store', () => ({
  findRampOperationByExternalId: findRampOperationByExternalIdMock,
  insertRampOperationPending: insertRampOperationPendingMock,
  updateRampOperationAfterCreate: updateRampOperationAfterCreateMock,
}));

describe('ensureOfframpUsdcDepositOperation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    findRampOperationByExternalIdMock.mockResolvedValue(null);
    insertRampOperationPendingMock.mockResolvedValue({ ok: true });
    updateRampOperationAfterCreateMock.mockResolvedValue(undefined);
    createOfframpOperationMock.mockResolvedValue({
      id: 'op-usdc-1',
      status: 'awaiting_deposit',
      memo: 'K5QF3ZB7H2N8XA1C',
      depositAddress: 'G...USDC-DEPOSIT',
      expiresAt: '2026-05-17T14:30:00Z',
    });
  });

  it('creates a USDC client off-ramp and returns API deposit instructions verbatim', async () => {
    const { ensureOfframpUsdcDepositOperation } = await import('./offramp-usdc-deposit');

    const result = await ensureOfframpUsdcDepositOperation({
      externalId: 'offramp-usdc-deposit:order-123',
      callbackUrl: 'https://example.com/webhooks/ramp',
      amountUsdc: '100.00',
    });

    expect(createOfframpOperationMock).toHaveBeenCalledWith({
      externalId: 'offramp-usdc-deposit:order-123',
      callbackUrl: 'https://example.com/webhooks/ramp',
      amount: '100.0',
      assetCode: 'USDC',
      category: 'client',
      depositMethod: 'classic',
    });
    expect(result).toEqual({
      rampOperationId: 'op-usdc-1',
      status: 'awaiting_deposit',
      depositAddress: 'G...USDC-DEPOSIT',
      memo: 'K5QF3ZB7H2N8XA1C',
      expiresAt: '2026-05-17T14:30:00Z',
    });
  });

  it('reloads deposit instructions from GET when create response omits fields', async () => {
    createOfframpOperationMock.mockResolvedValueOnce({
      id: 'op-usdc-2',
      status: 'awaiting_deposit',
    });
    getRampOperationMock.mockResolvedValueOnce({
      id: 'op-usdc-2',
      status: 'awaiting_deposit',
      memo: 'MEMO123',
      depositAddress: 'G...ADDR',
      expiresAt: '2026-05-18T14:30:00Z',
    });

    const { ensureOfframpUsdcDepositOperation } = await import('./offramp-usdc-deposit');

    const result = await ensureOfframpUsdcDepositOperation({
      externalId: 'offramp-usdc-deposit:order-456',
      callbackUrl: 'https://example.com/webhooks/ramp',
      amountUsdc: '50',
    });

    expect(getRampOperationMock).toHaveBeenCalledWith('op-usdc-2');
    expect(result.memo).toBe('MEMO123');
    expect(result.depositAddress).toBe('G...ADDR');
  });
});
