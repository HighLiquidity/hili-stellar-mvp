'use server';

import { assertOperatorMaxWithinClientCeiling } from '@/lib/commercial/operator-limits';
import { parseMaxAmountBrl } from '@/lib/commercial/parse';
import {
  CLIENT_ADMIN_MANAGEABLE_ROLES,
  isClientAdminRole,
  isPlatformAdminRole,
  PLATFORM_ADMIN_ASSIGNABLE_ROLES,
  requiresClientId,
} from '@/lib/users/roles';
import { requireUserManagerFromAccessToken } from '@/lib/users/require-delegated-admin';
import type { PanelAccessContext } from '@/lib/users/require-panel-role';
import type { PanelUserInput, PanelUserRole, PanelUserRow } from '@/lib/users/types';

const PANEL_ACCESS_TABLE = 'panel_access_list';
const PANEL_USER_COLUMNS =
  'email, full_name, role, is_active, client_id, max_amount_brl, created_at, updated_at';
const CLIENTS_TABLE = 'clients';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeOperatorMaxAmount(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return parseMaxAmountBrl(trimmed);
}

function assignableRolesForActor(ctx: PanelAccessContext): PanelUserRole[] {
  return isPlatformAdminRole(ctx.role) ? PLATFORM_ADMIN_ASSIGNABLE_ROLES : CLIENT_ADMIN_MANAGEABLE_ROLES;
}

function validateAssignableRole(ctx: PanelAccessContext, role: PanelUserRole): boolean {
  return assignableRolesForActor(ctx).includes(role);
}

async function fetchClientCeiling(
  admin: PanelAccessContext['admin'],
  clientId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from(CLIENTS_TABLE)
    .select('max_amount_brl')
    .eq('id', clientId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Cliente não encontrado.');

  return (data.max_amount_brl as string | null) ?? null;
}

async function resolvePanelUserClientId(
  ctx: PanelAccessContext,
  input: Pick<PanelUserInput, 'role' | 'clientId'>,
): Promise<{ ok: true; clientId: string | null } | { ok: false; message: string }> {
  if (input.role === 'admin') {
    return { ok: true, clientId: null };
  }

  if (isClientAdminRole(ctx.role)) {
    const actorClientId = ctx.clientId?.trim();
    if (!actorClientId) {
      return { ok: false, message: 'Administrador do cliente não está vinculado a um cliente.' };
    }
    return { ok: true, clientId: actorClientId };
  }

  const clientId = input.clientId?.trim();
  if (!clientId) {
    return { ok: false, message: 'Cliente é obrigatório para este perfil.' };
  }

  const { data, error } = await ctx.admin.from(CLIENTS_TABLE).select('id').eq('id', clientId).maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'Cliente não encontrado.' };

  return { ok: true, clientId };
}

function assertActorCanManageExistingUser(
  ctx: PanelAccessContext,
  existing: { role: PanelUserRole; client_id?: string | null },
): void {
  if (isPlatformAdminRole(ctx.role)) return;

  const actorClientId = ctx.clientId?.trim();
  if (!actorClientId || existing.client_id?.trim() !== actorClientId) {
    throw new Error('Usuário não encontrado.');
  }

  if (!CLIENT_ADMIN_MANAGEABLE_ROLES.includes(existing.role)) {
    throw new Error('Você não pode gerenciar este usuário.');
  }
}

async function resolveOperatorMaxForWrite(
  ctx: PanelAccessContext,
  input: Pick<PanelUserInput, 'role' | 'maxAmountBrl'>,
  clientId: string | null,
): Promise<{ ok: true; maxAmountBrl: string | null } | { ok: false; message: string }> {
  if (input.role !== 'operator') {
    return { ok: true, maxAmountBrl: null };
  }

  let maxAmountBrl: string | null = null;
  try {
    maxAmountBrl = normalizeOperatorMaxAmount(input.maxAmountBrl);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Limite transacional inválido.',
    };
  }

  if (!clientId) {
    return { ok: false, message: 'Operador deve estar vinculado a um cliente.' };
  }

  try {
    const clientCeiling = await fetchClientCeiling(ctx.admin, clientId);
    assertOperatorMaxWithinClientCeiling(maxAmountBrl, clientCeiling);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Limite transacional inválido.',
    };
  }

  return { ok: true, maxAmountBrl };
}

function clientDisplayName(client: { trade_name: string | null; legal_name: string }): string {
  return client.trade_name?.trim() || client.legal_name;
}

async function findAuthUserIdByEmail(
  admin: PanelAccessContext['admin'],
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

export async function getManagedClientCeilingAction(
  accessToken: string,
): Promise<UserManagementActionResult<{ maxAmountBrl: string | null; clientName: string | null }>> {
  try {
    const ctx = await requireUserManagerFromAccessToken(accessToken);

    if (isPlatformAdminRole(ctx.role)) {
      return { ok: true, data: { maxAmountBrl: null, clientName: null } };
    }

    const clientId = ctx.clientId?.trim();
    if (!clientId) {
      return { ok: false, message: 'Administrador do cliente não está vinculado a um cliente.' };
    }

    const { data, error } = await ctx.admin
      .from(CLIENTS_TABLE)
      .select('max_amount_brl, legal_name, trade_name')
      .eq('id', clientId)
      .maybeSingle();

    if (error) return { ok: false, message: error.message };
    if (!data) return { ok: false, message: 'Cliente não encontrado.' };

    return {
      ok: true,
      data: {
        maxAmountBrl: (data.max_amount_brl as string | null) ?? null,
        clientName: clientDisplayName(data as { trade_name: string | null; legal_name: string }),
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function listPanelUsersAction(
  accessToken: string,
): Promise<UserManagementActionResult<PanelUserRow[]>> {
  try {
    const ctx = await requireUserManagerFromAccessToken(accessToken);

    let usersQuery = ctx.admin
      .from(PANEL_ACCESS_TABLE)
      .select(PANEL_USER_COLUMNS)
      .order('email', { ascending: true });

    if (isClientAdminRole(ctx.role)) {
      const clientId = ctx.clientId?.trim();
      if (!clientId) {
        return { ok: false, message: 'Administrador do cliente não está vinculado a um cliente.' };
      }
      usersQuery = usersQuery.eq('client_id', clientId);
    }

    const [{ data, error }, clientsResult] = await Promise.all([
      usersQuery,
      isPlatformAdminRole(ctx.role)
        ? ctx.admin.from(CLIENTS_TABLE).select('id, legal_name, trade_name')
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (error) {
      return { ok: false, message: error.message };
    }
    if (clientsResult.error) {
      return { ok: false, message: clientsResult.error.message };
    }

    const clientNameById = new Map(
      (clientsResult.data ?? []).map((client) => [
        client.id as string,
        clientDisplayName(client as { trade_name: string | null; legal_name: string }),
      ]),
    );

    if (isClientAdminRole(ctx.role) && ctx.clientId) {
      const { data: ownClient, error: ownClientError } = await ctx.admin
        .from(CLIENTS_TABLE)
        .select('id, legal_name, trade_name')
        .eq('id', ctx.clientId)
        .maybeSingle();

      if (ownClientError) return { ok: false, message: ownClientError.message };
      if (ownClient) {
        clientNameById.set(
          ownClient.id as string,
          clientDisplayName(ownClient as { trade_name: string | null; legal_name: string }),
        );
      }
    }

    const rows = ((data ?? []) as PanelUserRow[]).map((row) => ({
      ...row,
      client_name: row.client_id ? clientNameById.get(row.client_id) ?? null : null,
    }));

    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function createPanelUserAction(
  accessToken: string,
  input: PanelUserInput,
): Promise<UserManagementActionResult<PanelUserRow>> {
  try {
    const ctx = await requireUserManagerFromAccessToken(accessToken);

    const email = normalizeEmail(input.email);
    const fullName = input.fullName.trim();
    const password = input.password?.trim() ?? '';

    if (!email || !email.includes('@')) {
      return { ok: false, message: 'E-mail inválido.' };
    }
    if (!fullName) {
      return { ok: false, message: 'Nome é obrigatório.' };
    }
    if (!validateAssignableRole(ctx, input.role)) {
      return { ok: false, message: 'Perfil inválido.' };
    }
    if (requiresClientId(input.role) && isPlatformAdminRole(ctx.role) && !input.clientId?.trim()) {
      return { ok: false, message: 'Cliente é obrigatório para este perfil.' };
    }
    if (password.length < 8) {
      return { ok: false, message: 'Senha deve ter pelo menos 8 caracteres.' };
    }

    const { data: existing } = await ctx.admin
      .from(PANEL_ACCESS_TABLE)
      .select('email')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      return { ok: false, message: 'Este e-mail já está cadastrado.' };
    }

    const clientResult = await resolvePanelUserClientId(ctx, input);
    if (!clientResult.ok) return clientResult;

    const maxResult = await resolveOperatorMaxForWrite(ctx, input, clientResult.clientId);
    if (!maxResult.ok) return maxResult;

    const { error: authError } = await ctx.admin.auth.admin.createUser({
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
      client_id: clientResult.clientId,
      max_amount_brl: maxResult.maxAmountBrl,
    };

    const { data, error } = await ctx.admin
      .from(PANEL_ACCESS_TABLE)
      .insert(row)
      .select(PANEL_USER_COLUMNS)
      .single();

    if (error) {
      return { ok: false, message: error.message };
    }

    console.info('[users/create] panel user created', { email, by: ctx.email });
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
    const ctx = await requireUserManagerFromAccessToken(accessToken);

    const email = normalizeEmail(emailRaw);
    const fullName = input.fullName.trim();
    const password = input.password?.trim();
    const isActive = input.isActive ?? true;

    if (!validateAssignableRole(ctx, input.role)) {
      return { ok: false, message: 'Perfil inválido.' };
    }
    if (!fullName) {
      return { ok: false, message: 'Nome é obrigatório.' };
    }
    if (password && password.length < 8) {
      return { ok: false, message: 'Nova senha deve ter pelo menos 8 caracteres.' };
    }

    const { data: existing, error: readError } = await ctx.admin
      .from(PANEL_ACCESS_TABLE)
      .select('email, role, is_active, client_id')
      .eq('email', email)
      .maybeSingle();

    if (readError) {
      return { ok: false, message: readError.message };
    }
    if (!existing) {
      return { ok: false, message: 'Usuário não encontrado.' };
    }

    assertActorCanManageExistingUser(ctx, existing as { role: PanelUserRole; client_id?: string | null });

    if (email === ctx.email) {
      if (isPlatformAdminRole(ctx.role) && (!isActive || input.role !== 'admin')) {
        return { ok: false, message: 'Você não pode remover seu próprio acesso de administrador.' };
      }
      if (isClientAdminRole(ctx.role) && (!isActive || input.role !== 'client_admin')) {
        return {
          ok: false,
          message: 'Você não pode remover seu próprio acesso de administrador do cliente.',
        };
      }
    }

    if (existing.role === 'admin' && input.role !== 'admin') {
      const { count, error: countError } = await ctx.admin
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

    const authUserId = await findAuthUserIdByEmail(ctx.admin, email);
    if (authUserId) {
      const { error: authUpdateError } = await ctx.admin.auth.admin.updateUserById(authUserId, {
        ...(password ? { password } : {}),
        user_metadata: { full_name: fullName },
      });
      if (authUpdateError) {
        return { ok: false, message: authUpdateError.message };
      }
    }

    const clientResult = await resolvePanelUserClientId(ctx, input);
    if (!clientResult.ok) return clientResult;

    const maxResult = await resolveOperatorMaxForWrite(ctx, input, clientResult.clientId);
    if (!maxResult.ok) return maxResult;

    const updatePayload: Record<string, unknown> = {
      full_name: fullName,
      role: input.role,
      is_active: isActive,
      client_id: clientResult.clientId,
    };

    if (input.role === 'operator' || existing.role === 'operator') {
      updatePayload.max_amount_brl = input.role === 'operator' ? maxResult.maxAmountBrl : null;
    }

    const { data, error } = await ctx.admin
      .from(PANEL_ACCESS_TABLE)
      .update(updatePayload)
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
    const ctx = await requireUserManagerFromAccessToken(accessToken);

    const email = normalizeEmail(emailRaw);
    if (!email) {
      return { ok: false, message: 'E-mail inválido.' };
    }

    if (email === ctx.email) {
      return { ok: false, message: 'Você não pode excluir sua própria conta.' };
    }

    const { data: existing, error: readError } = await ctx.admin
      .from(PANEL_ACCESS_TABLE)
      .select('email, role, is_active, client_id')
      .eq('email', email)
      .maybeSingle();

    if (readError) {
      return { ok: false, message: readError.message };
    }
    if (!existing) {
      return { ok: false, message: 'Usuário não encontrado.' };
    }

    assertActorCanManageExistingUser(ctx, existing as { role: PanelUserRole; client_id?: string | null });

    if (existing.role === 'admin' && existing.is_active) {
      const { count, error: countError } = await ctx.admin
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

    const authUserId = await findAuthUserIdByEmail(ctx.admin, email);
    if (authUserId) {
      const { error: deleteAuthError } = await ctx.admin.auth.admin.deleteUser(authUserId);
      if (deleteAuthError) {
        return { ok: false, message: deleteAuthError.message };
      }
    }

    const { error } = await ctx.admin.from(PANEL_ACCESS_TABLE).delete().eq('email', email);
    if (error) {
      return { ok: false, message: error.message };
    }

    console.info('[users/delete] panel user removed', { email, by: ctx.email });
    return { ok: true, data: { email } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
