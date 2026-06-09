'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  approvePixWhitelistRequestAction,
  listPendingPixWhitelistAction,
  rejectPixWhitelistRequestAction,
} from '@/app/actions/pix-whitelist';
import {
  approveWithdrawWhitelistRequestAction,
  listPendingWithdrawWhitelistAction,
  rejectWithdrawWhitelistRequestAction,
} from '@/app/actions/withdraw-whitelist';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import type { PixWhitelistRow } from '@/lib/pix-whitelist/types';
import type { WithdrawWhitelistRow } from '@/lib/withdraw-whitelist/types';

type PendingWalletRow = WithdrawWhitelistRow & { user_email: string | null };
type PendingPixRow = PixWhitelistRow & { user_email: string | null };

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type WhitelistPendingPanelProps = {
  isActive: boolean;
};

export function WhitelistPendingPanel({ isActive }: WhitelistPendingPanelProps) {
  const { t } = useI18n();
  const [walletRows, setWalletRows] = useState<PendingWalletRow[]>([]);
  const [pixRows, setPixRows] = useState<PendingPixRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError(t('pages.userManagement.errors.session'));
        setWalletRows([]);
        setPixRows([]);
        return;
      }

      const [walletsResult, pixResult] = await Promise.all([
        listPendingWithdrawWhitelistAction(token),
        listPendingPixWhitelistAction(token),
      ]);

      if (!walletsResult.ok) {
        setLoadError(walletsResult.message);
        setWalletRows([]);
      } else {
        setWalletRows(walletsResult.data);
      }

      if (!pixResult.ok) {
        setLoadError(pixResult.message);
        setPixRows([]);
      } else {
        setPixRows(pixResult.data);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setWalletRows([]);
      setPixRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isActive) return;
    void loadRows();
  }, [isActive, loadRows]);

  const handleApproveWallet = async (id: string) => {
    setActionError(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setActionError(t('pages.userManagement.errors.session'));
        return;
      }
      const result = await approveWithdrawWhitelistRequestAction(token, id);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setSuccessMessage(t('pages.whitelistApproval.approveSuccess'));
      await loadRows();
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectWallet = async (id: string) => {
    const reason = window.prompt(t('pages.whitelistApproval.rejectReasonPrompt'));
    if (reason === null) return;

    setActionError(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setActionError(t('pages.userManagement.errors.session'));
        return;
      }
      const result = await rejectWithdrawWhitelistRequestAction(token, { id, reason });
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setSuccessMessage(t('pages.whitelistApproval.rejectSuccess'));
      await loadRows();
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprovePix = async (id: string) => {
    setActionError(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setActionError(t('pages.userManagement.errors.session'));
        return;
      }
      const result = await approvePixWhitelistRequestAction(token, id);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setSuccessMessage(t('pages.whitelistApproval.approveSuccess'));
      await loadRows();
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectPix = async (id: string) => {
    const reason = window.prompt(t('pages.whitelistApproval.rejectReasonPrompt'));
    if (reason === null) return;

    setActionError(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setActionError(t('pages.userManagement.errors.session'));
        return;
      }
      const result = await rejectPixWhitelistRequestAction(token, { id, reason });
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setSuccessMessage(t('pages.whitelistApproval.rejectSuccess'));
      await loadRows();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isActive) {
    return null;
  }

  const totalPending = walletRows.length + pixRows.length;

  return (
    <>
      {loadError ? (
        <p className="auth-inline-error" role="alert">
          {loadError}
        </p>
      ) : null}

      {actionError ? (
        <p className="auth-inline-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {successMessage ? (
        <p className="form-success-message" role="status">
          {successMessage}
        </p>
      ) : null}

      {totalPending === 0 && !isLoading ? (
        <p className="surface__lead">{t('pages.whitelistApproval.empty')}</p>
      ) : null}

      {walletRows.length > 0 ? (
        <>
          <h3 className="user-management-form__title">{t('pages.whitelistApproval.walletsSection')}</h3>
          <div className="user-management-table-wrap">
            <table className="user-management-table">
              <thead>
                <tr>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.user')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.address')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.network')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.label')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.memo')}</th>
                  <th scope="col">{t('pages.whitelistApproval.columns.requestedAt')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {walletRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.user_email ?? '—'}</td>
                    <td>{row.address}</td>
                    <td>{row.network}</td>
                    <td>{row.label ?? '—'}</td>
                    <td>{row.memo ?? '—'}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>
                      <div className="user-management-actions">
                        <Button type="button" disabled={isSaving} onClick={() => void handleApproveWallet(row.id)}>
                          {t('pages.whitelistApproval.approve')}
                        </Button>
                        <Button type="button" variant="ghost" disabled={isSaving} onClick={() => void handleRejectWallet(row.id)}>
                          {t('pages.whitelistApproval.reject')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {pixRows.length > 0 ? (
        <>
          <h3 className="user-management-form__title">{t('pages.whitelistApproval.pixSection')}</h3>
          <div className="user-management-table-wrap">
            <table className="user-management-table">
              <thead>
                <tr>
                  <th scope="col">{t('pages.pixWhitelist.columns.user')}</th>
                  <th scope="col">{t('pages.pixWhitelist.columns.pixKey')}</th>
                  <th scope="col">{t('pages.pixWhitelist.columns.beneficiary')}</th>
                  <th scope="col">{t('pages.pixWhitelist.columns.label')}</th>
                  <th scope="col">{t('pages.whitelistApproval.columns.requestedAt')}</th>
                  <th scope="col">{t('pages.pixWhitelist.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pixRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.user_email ?? '—'}</td>
                    <td>{row.pix_key}</td>
                    <td>{row.beneficiary_name ?? '—'}</td>
                    <td>{row.label ?? '—'}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>
                      <div className="user-management-actions">
                        <Button type="button" disabled={isSaving} onClick={() => void handleApprovePix(row.id)}>
                          {t('pages.whitelistApproval.approve')}
                        </Button>
                        <Button type="button" variant="ghost" disabled={isSaving} onClick={() => void handleRejectPix(row.id)}>
                          {t('pages.whitelistApproval.reject')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
