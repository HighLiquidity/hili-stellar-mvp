'use server';

import type { PanelUserInput, PanelUserRole, PanelUserRow } from '@/lib/users/types';
import { requireAdminFromAccessToken } from '@/lib/users/require-admin';

const PANEL_ACCESS_TABLE = 'panel_access_list';
const PANEL_USER_COLUMNS = 'email, full_name, role, is_active';
const ROLES: PanelUserRole[] = ['admin', 'operator', 'viewer'];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateRole(role: string): role is PanelUserRole {
  return ROLES.includes(role as PanelUserRole);
}

async function findAuthUserIdByEmail(
  admin: Awaited<ReturnType<typeof requireAdminFromAccessToken>>['admin'],
  email: string,
): Promise<string | null> {
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match?.id) return match.id;

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

export type UserManagementActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export async function listPanelUsersAction(
  accessToken: string,
): Promise<UserManagementActionResult<PanelUserRow[]>> {
  try {
    const { admin } = await requireAdminFromAccessToken(accessToken);

    const { data, error } = await admin
      .from(PANEL_ACCESS_TABLE)
      .select(PANEL_USER_COLUMNS)
      .order('email', { ascending: true });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, data: (data ?? []) as PanelUserRow[] };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function createPanelUserAction(
  accessToken: string,
  input: PanelUserInput,
): Promise<UserManagementActionResult<PanelUserRow>> {
  try {
    const { admin, email: actorEmail } = await requireAdminFromAccessToken(accessToken);

    const email = normalizeEmail(input.email);
    const fullName = input.fullName.trim();
    const password = input.password?.trim() ?? '';

    if (!email || !email.includes('@')) {
      return { ok: false, message: 'E-mail inválido.' };
    }
    if (!fullName) {
      return { ok: false, message: 'Nome é obrigatório.' };
    }
    if (!validateRole(input.role)) {
      return { ok: false, message: 'Perfil inválido.' };
    }
    if (password.length < 8) {
      return { ok: false, message: 'Senha deve ter pelo menos 8 caracteres.' };
    }

    const { data: existing } = await admin.from(PANEL_ACCESS_TABLE).select('email').eq('email', email).maybeSingle();
    if (existing) {
      return { ok: false, message: 'Este e-mail já está cadastrado.' };
    }

    const { error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      return { ok: false, message: authError.message };
    }

    const row = {
      email,
      full_name: fullName,
      role: input.role,
      is_active: input.isActive ?? true,
    };

    const { data, error } = await admin
      .from(PANEL_ACCESS_TABLE)
      .insert(row)
      .select(PANEL_USER_COLUMNS)
      .single();

    if (error) {
      return { ok: false, message: error.message };
    }

    console.info('[users/create] panel user created', { email, by: actorEmail });
    return { ok: true, data: data as PanelUserRow };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function updatePanelUserAction(
  accessToken: string,
  emailRaw: string,
  input: Omit<PanelUserInput, 'email'> & { email?: never },
): Promise<UserManagementActionResult<PanelUserRow>> {
  try {
    const { admin, email: actorEmail } = await requireAdminFromAccessToken(accessToken);

    const email = normalizeEmail(emailRaw);
    const fullName = input.fullName.trim();
    const password = input.password?.trim();
    const isActive = input.isActive ?? true;

    if (!validateRole(input.role)) {
      return { ok: false, message: 'Perfil inválido.' };
    }
    if (!fullName) {
      return { ok: false, message: 'Nome é obrigatório.' };
    }
    if (password && password.length < 8) {
      return { ok: false, message: 'Nova senha deve ter pelo menos 8 caracteres.' };
    }

    const { data: existing, error: readError } = await admin
      .from(PANEL_ACCESS_TABLE)
      .select('email, role, is_active')
      .eq('email', email)
      .maybeSingle();

    if (readError) {
      return { ok: false, message: readError.message };
    }
    if (!existing) {
      return { ok: false, message: 'Usuário não encontrado.' };
    }

    if (email === actorEmail && (!isActive || input.role !== 'admin')) {
      return { ok: false, message: 'Você não pode remover seu próprio acesso de administrador.' };
    }

    if (existing.role === 'admin' && input.role !== 'admin') {
      const { count, error: countError } = await admin
        .from(PANEL_ACCESS_TABLE)
        .select('email', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);

      if (countError) {
        return { ok: false, message: countError.message };
      }
      if ((count ?? 0) <= 1) {
        return { ok: false, message: 'Deve existir pelo menos um administrador ativo.' };
      }
    }

    const authUserId = await findAuthUserIdByEmail(admin, email);
    if (authUserId) {
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(authUserId, {
        ...(password ? { password } : {}),
        user_metadata: { full_name: fullName },
      });
      if (authUpdateError) {
        return { ok: false, message: authUpdateError.message };
      }
    }

    const { data, error } = await admin
      .from(PANEL_ACCESS_TABLE)
      .update({
        full_name: fullName,
        role: input.role,
        is_active: isActive,
      })
      .eq('email', email)
      .select(PANEL_USER_COLUMNS)
      .single();

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, data: data as PanelUserRow };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function deletePanelUserAction(
  accessToken: string,
  emailRaw: string,
): Promise<UserManagementActionResult<{ email: string }>> {
  try {
    const { admin, email: actorEmail } = await requireAdminFromAccessToken(accessToken);

    const email = normalizeEmail(emailRaw);
    if (!email) {
      return { ok: false, message: 'E-mail inválido.' };
    }

    if (email === actorEmail) {
      return { ok: false, message: 'Você não pode excluir sua própria conta.' };
    }

    const { data: existing, error: readError } = await admin
      .from(PANEL_ACCESS_TABLE)
      .select('email, role, is_active')
      .eq('email', email)
      .maybeSingle();

    if (readError) {
      return { ok: false, message: readError.message };
    }
    if (!existing) {
      return { ok: false, message: 'Usuário não encontrado.' };
    }

    if (existing.role === 'admin' && existing.is_active) {
      const { count, error: countError } = await admin
        .from(PANEL_ACCESS_TABLE)
        .select('email', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);

      if (countError) {
        return { ok: false, message: countError.message };
      }
      if ((count ?? 0) <= 1) {
        return { ok: false, message: 'Não é possível excluir o último administrador ativo.' };
      }
    }

    const authUserId = await findAuthUserIdByEmail(admin, email);
    if (authUserId) {
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(authUserId);
      if (deleteAuthError) {
        return { ok: false, message: deleteAuthError.message };
      }
    }

    const { error } = await admin.from(PANEL_ACCESS_TABLE).delete().eq('email', email);
    if (error) {
      return { ok: false, message: error.message };
    }

    console.info('[users/delete] panel user removed', { email, by: actorEmail });
    return { ok: true, data: { email } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
