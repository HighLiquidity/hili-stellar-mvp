import { createSupabaseAdmin } from '@/lib/supabase/admin';

export async function incrementBrhBalanceFromPix(amount: string): Promise<{ ok: true; balance: string } | { ok: false }> {
  const delta = amount.trim();
  if (!delta) return { ok: false };

  const admin = createSupabaseAdmin();
  if (!admin) {
    console.warn('[brh/balance] SUPABASE_SERVICE_ROLE_KEY missing — skip balance increment');
    return { ok: false };
  }

  const { data, error } = await admin.rpc('increment_brh_balance', { delta });
  if (error) {
    console.error('[brh/balance] increment_brh_balance RPC failed', error);
    return { ok: false };
  }

  const balance = typeof data === 'string' ? data : null;
  if (balance == null) {
    console.error('[brh/balance] unexpected RPC return', data);
    return { ok: false };
  }

  return { ok: true, balance };
}

export function parseBrhBalance(balance: string): number {
  const n = Number(balance.trim());
  return Number.isFinite(n) ? n : 0;
}

export function hasSufficientBrhBalance(balance: string, amountBrl: number): boolean {
  return parseBrhBalance(balance) >= amountBrl;
}

/** Decrements singleton BRH balance after a successful withdraw (1 BRH ≈ 1 BRL in MVP). */
export async function decrementBrhBalance(amountBrl: string): Promise<{ ok: true; balance: string } | { ok: false }> {
  const trimmed = amountBrl.trim();
  if (!trimmed) return { ok: false };

  const admin = createSupabaseAdmin();
  if (!admin) {
    console.warn('[brh/balance] SUPABASE_SERVICE_ROLE_KEY missing — skip balance decrement');
    return { ok: false };
  }

  const delta = trimmed.startsWith('-') ? trimmed : `-${trimmed}`;
  const { data, error } = await admin.rpc('increment_brh_balance', { delta });
  if (error) {
    console.error('[brh/balance] decrement via increment_brh_balance failed', error);
    return { ok: false };
  }

  const balance = typeof data === 'string' ? data : null;
  if (balance == null) {
    console.error('[brh/balance] unexpected RPC return after decrement', data);
    return { ok: false };
  }

  return { ok: true, balance };
}

export async function readBrhBalanceAdmin(): Promise<string> {
  const admin = createSupabaseAdmin();
  if (!admin) return '0';

  const { data, error } = await admin.from('brh_balance').select('balance').eq('id', 1).maybeSingle();
  if (error) {
    console.error('[brh/balance] read failed', error);
    return '0';
  }
  if (data && typeof data.balance === 'string' && data.balance.trim()) return data.balance.trim();
  return '0';
}
