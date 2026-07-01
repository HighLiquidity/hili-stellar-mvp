'use server';

import {
  ensureClientComplianceProfile,
  loadClientComplianceProfileByClientId,
} from '@/lib/clients/compliance-profile';
import {
  KYC_STATUSES,
  KYB_STATUSES,
  type ClientComplianceRow,
  type ClientComplianceUpdateInput,
  type KycStatus,
  type KybStatus,
} from '@/lib/clients/compliance-types';
import { requireAdminFromAccessToken } from '@/lib/users/require-admin';
import { requireUserManagerFromAccessToken } from '@/lib/users/require-delegated-admin';
import type { PanelAccessContext } from '@/lib/users/require-panel-role';
import { isClientAdminRole, isPlatformAdminRole } from '@/lib/users/roles';

const COMPLIANCE_TABLE = 'client_compliance_profiles';
const COMPLIANCE_COLUMNS =
  'client_id, kyb_status, kyc_status, submitted_at, reviewed_at, reviewed_by_email, rejection_reason, notes, created_at, updated_at';

export type ClientComplianceActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function isKybStatus(value: string): value is KybStatus {
  return KYB_STATUSES.includes(value as KybStatus);
}

function isKycStatus(value: string): value is KycStatus {
  return KYC_STATUSES.includes(value as KycStatus);
}

function assertAdminCanAccessClient(ctx: PanelAccessContext, clientId: string): void {
  if (isPlatformAdminRole(ctx.role)) return;

  const actorClientId = ctx.clientId?.trim();
  if (!actorClientId || actorClientId !== clientId.trim()) {
    throw new Error('Cliente não encontrado.');
  }
}

export async function getClientComplianceAction(
  accessToken: string,
  clientId: string,
): Promise<ClientComplianceActionResult<ClientComplianceRow>> {
  try {
    const ctx = await requireUserManagerFromAccessToken(accessToken);
    const id = clientId.trim();
    if (!id) return { ok: false, message: 'ID inválido.' };

    assertAdminCanAccessClient(ctx, id);

    const row = await loadClientComplianceProfileByClientId(ctx.admin, id);
    if (!row) {
      const created = await ensureClientComplianceProfile(ctx.admin, id);
      return { ok: true, data: created };
    }

    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function getMyClientComplianceAction(
  accessToken: string,
): Promise<ClientComplianceActionResult<ClientComplianceRow>> {
  try {
    const ctx = await requireUserManagerFromAccessToken(accessToken);
    const clientId = ctx.clientId?.trim();
    if (!clientId) {
      return { ok: false, message: 'Usuário não está vinculado a um cliente.' };
    }

    const row = await loadClientComplianceProfileByClientId(ctx.admin, clientId);
    if (!row) {
      const created = await ensureClientComplianceProfile(ctx.admin, clientId);
      return { ok: true, data: created };
    }

    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateClientComplianceAction(
  accessToken: string,
  clientId: string,
  input: ClientComplianceUpdateInput,
): Promise<ClientComplianceActionResult<ClientComplianceRow>> {
  try {
    const { admin, email: actorEmail } = await requireAdminFromAccessToken(accessToken);
    const id = clientId.trim();
    if (!id) return { ok: false, message: 'ID inválido.' };

    if (input.kybStatus !== undefined && !isKybStatus(input.kybStatus)) {
      return { ok: false, message: 'Status KYB inválido.' };
    }
    if (input.kycStatus !== undefined && !isKycStatus(input.kycStatus)) {
      return { ok: false, message: 'Status KYC inválido.' };
    }

    await ensureClientComplianceProfile(admin, id);

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };

    if (input.kybStatus !== undefined) {
      patch.kyb_status = input.kybStatus;
      if (input.kybStatus === 'approved' || input.kybStatus === 'rejected') {
        patch.reviewed_at = now;
        patch.reviewed_by_email = actorEmail;
      }
      if (input.kybStatus === 'approved') {
        patch.rejection_reason = null;
      }
    }

    if (input.kycStatus !== undefined) {
      patch.kyc_status = input.kycStatus;
    }

    if (input.notes !== undefined) {
      patch.notes = input.notes?.trim() || null;
    }

    if (input.rejectionReason !== undefined) {
      patch.rejection_reason = input.rejectionReason?.trim() || null;
    }

    const { data, error } = await admin
      .from(COMPLIANCE_TABLE)
      .update(patch)
      .eq('client_id', id)
      .select(COMPLIANCE_COLUMNS)
      .single();

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: data as ClientComplianceRow };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function submitClientComplianceForReviewAction(
  accessToken: string,
): Promise<ClientComplianceActionResult<ClientComplianceRow>> {
  try {
    const ctx = await requireUserManagerFromAccessToken(accessToken);
    if (!isClientAdminRole(ctx.role)) {
      return { ok: false, message: 'Apenas administradores do cliente podem enviar para revisão.' };
    }

    const clientId = ctx.clientId?.trim();
    if (!clientId) {
      return { ok: false, message: 'Usuário não está vinculado a um cliente.' };
    }

    const existing = await ensureClientComplianceProfile(ctx.admin, clientId);
    if (existing.kyb_status === 'approved') {
      return { ok: false, message: 'KYB já está aprovado.' };
    }
    if (existing.kyb_status === 'pending') {
      return { ok: false, message: 'KYB já está em revisão.' };
    }

    const now = new Date().toISOString();
    const { data, error } = await ctx.admin
      .from(COMPLIANCE_TABLE)
      .update({
        kyb_status: 'pending',
        submitted_at: now,
        updated_at: now,
        rejection_reason: null,
      })
      .eq('client_id', clientId)
      .select(COMPLIANCE_COLUMNS)
      .single();

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: data as ClientComplianceRow };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
