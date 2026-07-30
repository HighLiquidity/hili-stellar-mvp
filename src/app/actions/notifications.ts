'use server';

import { OFFRAMP_ORDERS_TABLE } from '@/lib/offramp/order-store';
import { ONRAMP_ORDERS_TABLE } from '@/lib/onramp/order-store';
import type { NotificationItem, NotificationsSummary } from '@/lib/notifications/types';
import { listPendingTreasuryRefills } from '@/lib/treasury/pending-refills';
import { requirePanelMemberFromAccessToken } from '@/lib/users/require-panel-role';
import {
  canAccessRampUi,
  canApproveWhitelist,
  isClientAdminRole,
  isPlatformAdminRole,
} from '@/lib/users/roles';

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

const WALLET_WHITELIST_TABLE = 'user_withdraw_whitelist';
const PIX_WHITELIST_TABLE = 'user_pix_whitelist';
const COMPLIANCE_TABLE = 'client_compliance_profiles';

async function countExact(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) {
    console.error('[notifications] count failed', error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getNotificationsSummaryAction(
  accessToken: string,
): Promise<ActionResult<NotificationsSummary>> {
  try {
    const ctx = await requirePanelMemberFromAccessToken(accessToken);
    const items: NotificationItem[] = [];
    const role = ctx.role;
    const clientId = ctx.clientId?.trim() || null;

    if (canApproveWhitelist(role)) {
      let walletQuery = ctx.admin
        .from(WALLET_WHITELIST_TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'pending');

      let pixQuery = ctx.admin
        .from(PIX_WHITELIST_TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'pending');

      if (!isPlatformAdminRole(role) && clientId) {
        walletQuery = walletQuery.eq('client_id', clientId);
        pixQuery = pixQuery.eq('client_id', clientId);
      }

      const [walletPending, pixPending] = await Promise.all([
        countExact(walletQuery),
        countExact(pixQuery),
      ]);

      if (walletPending > 0) {
        items.push({
          id: 'whitelist_wallet_pending',
          kind: 'whitelist_wallet_pending',
          severity: 'action',
          href: '/app/withdraw-whitelist?tab=pending',
          fingerprint: `whitelist_wallet_pending:${walletPending}`,
          count: walletPending,
        });
      }

      if (pixPending > 0) {
        items.push({
          id: 'whitelist_pix_pending',
          kind: 'whitelist_pix_pending',
          severity: 'action',
          href: '/app/withdraw-whitelist?tab=pending',
          fingerprint: `whitelist_pix_pending:${pixPending}`,
          count: pixPending,
        });
      }
    }

    if (role === 'operator' && ctx.userId) {
      const [ownWalletPending, ownPixPending] = await Promise.all([
        countExact(
          ctx.admin
            .from(WALLET_WHITELIST_TABLE)
            .select('*', { count: 'exact', head: true })
            .eq('user_id', ctx.userId)
            .eq('approval_status', 'pending'),
        ),
        countExact(
          ctx.admin
            .from(PIX_WHITELIST_TABLE)
            .select('*', { count: 'exact', head: true })
            .eq('user_id', ctx.userId)
            .eq('approval_status', 'pending'),
        ),
      ]);

      const ownPending = ownWalletPending + ownPixPending;
      if (ownPending > 0) {
        items.push({
          id: 'whitelist_own_pending',
          kind: 'whitelist_own_pending',
          severity: 'info',
          href: '/app/withdraw-whitelist',
          fingerprint: `whitelist_own_pending:${ownPending}`,
          count: ownPending,
        });
      }
    }

    if (isPlatformAdminRole(role)) {
      const kybPending = await countExact(
        ctx.admin
          .from(COMPLIANCE_TABLE)
          .select('*', { count: 'exact', head: true })
          .eq('kyb_status', 'pending'),
      );

      if (kybPending > 0) {
        items.push({
          id: 'kyb_pending_review',
          kind: 'kyb_pending_review',
          severity: 'action',
          href: '/app/clients',
          fingerprint: `kyb_pending_review:${kybPending}`,
          count: kybPending,
        });
      }

      const treasury = await listPendingTreasuryRefills();
      if (treasury.count > 0) {
        items.push({
          id: 'treasury_pending_refills',
          kind: 'treasury_pending_refills',
          severity: 'warning',
          href: '/app/treasury',
          fingerprint: `treasury_pending_refills:${treasury.count}`,
          count: treasury.count,
        });
      }
    }

    if (isClientAdminRole(role) && clientId) {
      const { data: compliance } = await ctx.admin
        .from(COMPLIANCE_TABLE)
        .select('kyb_status')
        .eq('client_id', clientId)
        .maybeSingle();

      const rawStatus = typeof compliance?.kyb_status === 'string' ? compliance.kyb_status : 'not_started';
      const kybStatus =
        rawStatus === 'pending' || rawStatus === 'rejected' || rawStatus === 'approved'
          ? rawStatus
          : 'not_started';

      if (kybStatus === 'not_started' || kybStatus === 'pending' || kybStatus === 'rejected') {
        items.push({
          id: 'kyb_status',
          kind: 'kyb_status',
          severity: kybStatus === 'rejected' ? 'warning' : kybStatus === 'pending' ? 'info' : 'action',
          href: '/app/dashboard',
          fingerprint: `kyb_status:${kybStatus}`,
          meta: { kybStatus },
        });
      }
    }

    if (canAccessRampUi(role)) {
      let onrampQuery = ctx.admin
        .from(ONRAMP_ORDERS_TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'needs_review');

      let offrampQuery = ctx.admin
        .from(OFFRAMP_ORDERS_TABLE)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'needs_review');

      if (!isPlatformAdminRole(role) && clientId) {
        onrampQuery = onrampQuery.eq('client_id', clientId);
        offrampQuery = offrampQuery.eq('client_id', clientId);
      }

      const [onrampNeedsReview, offrampNeedsReview] = await Promise.all([
        countExact(onrampQuery),
        countExact(offrampQuery),
      ]);

      const needsReview = onrampNeedsReview + offrampNeedsReview;
      if (needsReview > 0) {
        items.push({
          id: 'ramp_needs_review',
          kind: 'ramp_needs_review',
          severity: 'warning',
          href: '/app/ramp-orders',
          fingerprint: `ramp_needs_review:${needsReview}`,
          count: needsReview,
        });
      }
    }

    return {
      ok: true,
      data: {
        items,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
