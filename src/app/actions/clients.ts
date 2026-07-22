'use server';

import { parseMaxAmountBrl, parseSpreadBpsOverride } from '@/lib/commercial/parse';
import { ensureClientComplianceProfile, loadComplianceByClientIds } from '@/lib/clients/compliance-profile';
import { normalizeClientTaxId } from '@/lib/clients/normalize';
import type { ClientInput, ClientRow, ClientStatus, ClientUpdateInput } from '@/lib/clients/types';
import { CLIENT_STATUSES } from '@/lib/clients/types';
import { requireAdminFromAccessToken } from '@/lib/users/require-admin';

const CLIENTS_TABLE = 'clients';
const CLIENT_COLUMNS =
  'id, legal_name, trade_name, tax_id, contact_email, status, spread_bps_override, max_amount_brl, created_at, updated_at, created_by_email, client_type';

export type ClientsActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function isClientStatus(value: string): value is ClientStatus {
  return CLIENT_STATUSES.includes(value as ClientStatus);
}

function resolveCommercialFields(input: Pick<ClientInput, 'spreadBpsOverride' | 'maxAmountBrl'>) {
  return {
    spread_bps_override: parseSpreadBpsOverride(input.spreadBpsOverride),
    max_amount_brl: parseMaxAmountBrl(input.maxAmountBrl),
  };
}

export async function listClientsAction(accessToken: string): Promise<ClientsActionResult<ClientRow[]>> {
  try {
    const { admin } = await requireAdminFromAccessToken(accessToken);
    const { data, error } = await admin
      .from(CLIENTS_TABLE)
      .select(CLIENT_COLUMNS)
      .order('legal_name', { ascending: true });

    if (error) return { ok: false, message: error.message };

    const clients = (data ?? []) as ClientRow[];
    const complianceByClientId = await loadComplianceByClientIds(
      admin,
      clients.map((row) => row.id),
    );

    const rows = clients.map((row) => {
      const compliance = complianceByClientId.get(row.id);
      return {
        ...row,
        kyb_status: compliance?.kyb_status ?? 'not_started',
        kyc_status: compliance?.kyc_status ?? 'not_started',
      };
    });

    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function getClientAction(
  accessToken: string,
  clientId: string,
): Promise<ClientsActionResult<ClientRow>> {
  try {
    const { admin } = await requireAdminFromAccessToken(accessToken);
    const id = clientId.trim();
    if (!id) return { ok: false, message: 'ID inválido.' };

    const { data, error } = await admin.from(CLIENTS_TABLE).select(CLIENT_COLUMNS).eq('id', id).maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data) return { ok: false, message: 'Cliente não encontrado.' };
    return { ok: true, data: data as ClientRow };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function createClientAction(
  accessToken: string,
  input: ClientInput,
): Promise<ClientsActionResult<ClientRow>> {
  try {
    const { admin, email: actorEmail } = await requireAdminFromAccessToken(accessToken);

    const legalName = input.legalName.trim();
    if (!legalName) return { ok: false, message: 'Razão social / nome é obrigatório.' };

    const clientType = input.clientType ?? 'company';

    let taxId: string;
    try {
      taxId = normalizeClientTaxId(input.taxId, clientType);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : clientType === 'individual' ? 'CPF inválido.' : 'CNPJ inválido.',
      };
    }

    const status = input.status ?? 'draft';
    if (!isClientStatus(status)) return { ok: false, message: 'Status inválido.' };

    let commercial;
    try {
      commercial = resolveCommercialFields(input);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from(CLIENTS_TABLE)
      .insert({
        legal_name: legalName,
        trade_name: input.tradeName?.trim() || null,
        tax_id: taxId,
        contact_email: input.contactEmail?.trim().toLowerCase() || null,
        status,
        ...commercial,
        created_by_email: actorEmail,
        updated_at: now,
        client_type: clientType,
      })
      .select(CLIENT_COLUMNS)
      .single();

    if (error) {
      if (error.code === '23505') return { ok: false, message: 'Documento (CPF/CNPJ) já cadastrado.' };
      return { ok: false, message: error.message };
    }

    const client = data as ClientRow;
    await ensureClientComplianceProfile(admin, client.id);

    return { ok: true, data: client };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateClientAction(
  accessToken: string,
  clientId: string,
  input: ClientUpdateInput,
): Promise<ClientsActionResult<ClientRow>> {
  try {
    const { admin } = await requireAdminFromAccessToken(accessToken);
    const id = clientId.trim();
    if (!id) return { ok: false, message: 'ID inválido.' };

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.legalName !== undefined) {
      const legalName = input.legalName.trim();
      if (!legalName) return { ok: false, message: 'Razão social / nome é obrigatório.' };
      patch.legal_name = legalName;
    }

    if (input.tradeName !== undefined) {
      patch.trade_name = input.tradeName?.trim() || null;
    }

    if (input.taxId !== undefined) {
      try {
        patch.tax_id = normalizeClientTaxId(input.taxId);
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'Documento inválido.' };
      }
    }

    if (input.clientType !== undefined) {
      patch.client_type = input.clientType;
    }

    if (input.contactEmail !== undefined) {
      patch.contact_email = input.contactEmail?.trim().toLowerCase() || null;
    }

    if (input.status !== undefined) {
      if (!isClientStatus(input.status)) return { ok: false, message: 'Status inválido.' };
      patch.status = input.status;
    }

    if (input.spreadBpsOverride !== undefined || input.maxAmountBrl !== undefined) {
      try {
        const commercial = resolveCommercialFields({
          spreadBpsOverride: input.spreadBpsOverride,
          maxAmountBrl: input.maxAmountBrl,
        });
        if (input.spreadBpsOverride !== undefined) {
          patch.spread_bps_override = commercial.spread_bps_override;
        }
        if (input.maxAmountBrl !== undefined) {
          patch.max_amount_brl = commercial.max_amount_brl;
        }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    }

    const { data, error } = await admin
      .from(CLIENTS_TABLE)
      .update(patch)
      .eq('id', id)
      .select(CLIENT_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === '23505') return { ok: false, message: 'Documento (CPF/CNPJ) já cadastrado.' };
      return { ok: false, message: error.message };
    }
    if (!data) return { ok: false, message: 'Cliente não encontrado.' };
    return { ok: true, data: data as ClientRow };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
