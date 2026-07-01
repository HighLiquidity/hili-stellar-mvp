import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { LEGACY_CLIENT_ID } from './constants';

export async function resolveClientIdForAuthUserId(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  userId: string,
): Promise<string | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const match = data.users.find((user) => user.id === normalizedUserId);
    if (match?.email) {
      const email = match.email.trim().toLowerCase();
      const { data: panelRow, error: panelError } = await admin
        .from('panel_access_list')
        .select('client_id')
        .eq('email', email)
        .maybeSingle();

      if (panelError) throw new Error(panelError.message);
      return (panelRow as { client_id: string | null } | null)?.client_id ?? null;
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function resolveClientIdForAuthUserEmail(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  email: string,
): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data, error } = await admin
    .from('panel_access_list')
    .select('client_id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as { client_id: string | null } | null)?.client_id ?? null;
}

export function fallbackLegacyClientId(clientId: string | null | undefined): string | null {
  const trimmed = clientId?.trim();
  return trimmed || LEGACY_CLIENT_ID;
}
