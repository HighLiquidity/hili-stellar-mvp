import { createClient } from '@supabase/supabase-js';

import { getAalFromAccessToken, mfaSessionIsInsufficient } from '@/lib/auth/aal';
import { adminUserHasVerifiedTotp } from '@/lib/auth/admin-mfa';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { PanelUserRole } from './types';
import { ALL_PANEL_ROLES } from './roles';

export type PanelAccessContext = {
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>;
  userId: string;
  email: string;
  role: PanelUserRole;
  clientId: string | null;
};

function normalizeAllowedRoles(allowedRoles: readonly PanelUserRole[]): PanelUserRole[] {
  const roles = Array.from(new Set(allowedRoles));
  if (!roles.length) {
    throw new Error('Nenhum papel autorizado foi informado.');
  }

  return roles;
}

function buildAccessDeniedMessage(allowedRoles: readonly PanelUserRole[]): string {
  const unique = new Set(allowedRoles);

  if (unique.size === 1 && unique.has('admin')) {
    return 'Acesso restrito a administradores.';
  }

  if (unique.has('admin') && unique.has('client_admin') && unique.size === 2) {
    return 'Acesso restrito a administradores da plataforma ou do cliente.';
  }

  if (unique.has('admin') && unique.has('operator') && unique.size === 2) {
    return 'Acesso restrito a administradores ou operadores.';
  }

  if (unique.has('admin') && unique.has('client_admin') && unique.has('operator')) {
    return 'Acesso restrito a administradores, administradores do cliente ou operadores.';
  }

  return 'Acesso não autorizado para este perfil.';
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
    .select('email, role, is_active, client_id')
    .eq('email', email)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile?.is_active || !roles.includes(profile.role as PanelUserRole)) {
    throw new Error(buildAccessDeniedMessage(roles));
  }

  const aal = getAalFromAccessToken(trimmedToken);
  const hasVerifiedTotp = await adminUserHasVerifiedTotp(admin, userData.user.id);
  if (mfaSessionIsInsufficient(aal, hasVerifiedTotp)) {
    throw new Error('Complete a autenticação em duas etapas para continuar.');
  }

  return {
    admin,
    userId: userData.user.id,
    email,
    role: profile.role as PanelUserRole,
    clientId: (profile.client_id as string | null) ?? null,
  };
}

export async function requireAdminFromAccessToken(accessToken: string): Promise<PanelAccessContext> {
  return requirePanelRoleFromAccessToken(accessToken, ['admin']);
}

export async function requireOperatorOrAdminFromAccessToken(
  accessToken: string,
): Promise<PanelAccessContext> {
  return requirePanelRoleFromAccessToken(accessToken, ['admin', 'client_admin', 'operator']);
}

export async function requirePanelMemberFromAccessToken(
  accessToken: string,
): Promise<PanelAccessContext> {
  return requirePanelRoleFromAccessToken(accessToken, ALL_PANEL_ROLES);
}
