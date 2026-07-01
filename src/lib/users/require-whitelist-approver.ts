import type { createSupabaseAdmin } from '@/lib/supabase/admin';

import { requirePanelRoleFromAccessToken, type PanelAccessContext } from './require-panel-role';

export async function requireWhitelistApproverFromAccessToken(
  accessToken: string,
): Promise<PanelAccessContext> {
  return requirePanelRoleFromAccessToken(accessToken, ['admin', 'client_admin']);
}

export function resolveWhitelistClientFilter(ctx: PanelAccessContext): string | undefined {
  if (ctx.role === 'admin') return undefined;
  const clientId = ctx.clientId?.trim();
  if (!clientId) {
    throw new Error('Client admin is not linked to a client.');
  }
  return clientId;
}

export function assertWhitelistRowInApproverScope(
  ctx: PanelAccessContext,
  rowClientId: string | null | undefined,
): void {
  const filter = resolveWhitelistClientFilter(ctx);
  if (!filter) return;

  if (rowClientId?.trim() !== filter) {
    throw new Error('Request not found.');
  }
}

export async function loadWhitelistRowClientId(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  table: 'user_withdraw_whitelist' | 'user_pix_whitelist',
  rowId: string,
): Promise<{ id: string; approval_status: string; client_id: string | null }> {
  const targetId = rowId.trim();
  if (!targetId) {
    throw new Error('ID inválido.');
  }

  const { data: row, error } = await admin
    .from(table)
    .select('id, approval_status, client_id')
    .eq('id', targetId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error('Request not found.');

  return row as { id: string; approval_status: string; client_id: string | null };
}