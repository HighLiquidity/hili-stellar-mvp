import { createClient } from '@supabase/supabase-js';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { PanelUserRole } from './types';

export type PanelAccessContext = {
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>;
  userId: string;
  email: string;
  role: PanelUserRole;
};

function normalizeAllowedRoles(allowedRoles: readonly PanelUserRole[]): PanelUserRole[] {
  const roles = Array.from(new Set(allowedRoles));
  if (!roles.length) {
    throw new Error('Nenhum papel autorizado foi informado.');
  }

  return roles;
}

function buildAccessDeniedMessage(allowedRoles: readonly PanelUserRole[]): string {
  if (allowedRoles.length === 1 && allowedRoles[0] === 'admin') {
    return 'Acesso restrito a administradores.';
  }

  return 'Acesso restrito a administradores ou operadores.';
}

export async function requirePanelRoleFromAccessToken(
  accessToken: string,
  allowedRoles: readonly PanelUserRole[],
): Promise<PanelAccessContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = createSupabaseAdmin();

  if (!url || !anonKey || !admin) {
    throw new Error('Supabase não configurado no servidor.');
  }

  const trimmedToken = accessToken.trim();
  if (!trimmedToken) {
    throw new Error('Sessão inválida.');
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(trimmedToken);
  if (userError || !userData.user?.email || !userData.user.id) {
    throw new Error('Sessão expirada ou inválida.');
  }

  const email = userData.user.email.trim().toLowerCase();
  const roles = normalizeAllowedRoles(allowedRoles);

  const { data: profile, error: profileError } = await admin
    .from('panel_access_list')
    .select('email, role, is_active')
    .eq('email', email)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile?.is_active || !roles.includes(profile.role as PanelUserRole)) {
    throw new Error(buildAccessDeniedMessage(roles));
  }

  return {
    admin,
    userId: userData.user.id,
    email,
    role: profile.role as PanelUserRole,
  };
}

export async function requireAdminFromAccessToken(accessToken: string): Promise<PanelAccessContext> {
  return requirePanelRoleFromAccessToken(accessToken, ['admin']);
}

export async function requireOperatorOrAdminFromAccessToken(
  accessToken: string,
): Promise<PanelAccessContext> {
  return requirePanelRoleFromAccessToken(accessToken, ['admin', 'operator']);
}
