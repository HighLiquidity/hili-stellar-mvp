'use server';

import { incrementBrhBalanceFromPix, readBrhBalanceAdmin } from '@/lib/brh/balance-store';

const TEST_CREDIT_AMOUNT = '1.00';

function isTestBrhCreditEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return process.env.ENABLE_BRH_TEST_CREDIT === 'true';
}

export type CreditTestBrhResult =
  | { ok: true; balance: string; credited: string }
  | { ok: false; code: 'DISABLED' | 'FAILED'; message?: string };

/** Adds 1 BRH to the singleton balance — dev only unless ENABLE_BRH_TEST_CREDIT=true. */
export async function creditTestBrhBalanceAction(): Promise<CreditTestBrhResult> {
  if (!isTestBrhCreditEnabled()) {
    return {
      ok: false,
      code: 'DISABLED',
      message: 'Crédito de teste desativado. Use NODE_ENV=development ou ENABLE_BRH_TEST_CREDIT=true.',
    };
  }

  const result = await incrementBrhBalanceFromPix(TEST_CREDIT_AMOUNT);
  if (!result.ok) {
    const balance = await readBrhBalanceAdmin();
    return {
      ok: false,
      code: 'FAILED',
      message:
        balance === '0'
          ? 'Não foi possível creditar. Verifique SUPABASE_SERVICE_ROLE_KEY e a migration brh_balance.'
          : 'Não foi possível creditar BRH (RPC increment_brh_balance).',
    };
  }

  return { ok: true, balance: result.balance, credited: TEST_CREDIT_AMOUNT };
}
