'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { BellIcon } from '@/components/Icons';
import { useNotifications } from '@/hooks/useNotifications';
import { useI18n } from '@/lib/i18n';
import type { NotificationItem } from '@/lib/notifications/types';

function formatNotificationCopy(
  item: NotificationItem,
  t: (key: string) => string,
): { title: string; body: string } {
  const count = item.count ?? 0;

  switch (item.kind) {
    case 'whitelist_wallet_pending':
      return {
        title: t('shell.notifications.kinds.whitelistWalletPending.title'),
        body: t('shell.notifications.kinds.whitelistWalletPending.body').replace(
          '{count}',
          String(count),
        ),
      };
    case 'whitelist_pix_pending':
      return {
        title: t('shell.notifications.kinds.whitelistPixPending.title'),
        body: t('shell.notifications.kinds.whitelistPixPending.body').replace(
          '{count}',
          String(count),
        ),
      };
    case 'whitelist_own_pending':
      return {
        title: t('shell.notifications.kinds.whitelistOwnPending.title'),
        body: t('shell.notifications.kinds.whitelistOwnPending.body').replace(
          '{count}',
          String(count),
        ),
      };
    case 'kyb_pending_review':
      return {
        title: t('shell.notifications.kinds.kybPendingReview.title'),
        body: t('shell.notifications.kinds.kybPendingReview.body').replace(
          '{count}',
          String(count),
        ),
      };
    case 'kyb_status': {
      const status = item.meta?.kybStatus ?? 'not_started';
      return {
        title: t(`shell.notifications.kinds.kybStatus.${status}.title`),
        body: t(`shell.notifications.kinds.kybStatus.${status}.body`),
      };
    }
    case 'treasury_pending_refills':
      return {
        title: t('shell.notifications.kinds.treasuryPendingRefills.title'),
        body: t('shell.notifications.kinds.treasuryPendingRefills.body').replace(
          '{count}',
          String(count),
        ),
      };
    case 'ramp_needs_review':
      return {
        title: t('shell.notifications.kinds.rampNeedsReview.title'),
        body: t('shell.notifications.kinds.rampNeedsReview.body').replace(
          '{count}',
          String(count),
        ),
      };
    default:
      return {
        title: t('shell.notifications.title'),
        body: '',
      };
  }
}

export function NotificationCenter() {
  const { t } = useI18n();
  const router = useRouter();
  const {
    items,
    isLoading,
    error,
    unreadCount,
    isUnread,
    markRead,
    markAllRead,
    refresh,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleToggle = () => {
    setIsOpen((current) => {
      const next = !current;
      if (next) {
        void refresh();
      }
      return next;
    });
  };

  const handleItemClick = (item: NotificationItem) => {
    markRead(item.fingerprint);
    setIsOpen(false);
    router.push(item.href);
  };

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        className={`icon-button notification-center__trigger${isOpen ? ' is-open' : ''}`}
        aria-label={t('shell.notifications.title')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        <BellIcon width={18} height={18} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="notification-center__badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          className="notification-center__dropdown"
          role="dialog"
          aria-label={t('shell.notifications.title')}
        >
          <div className="notification-center__header">
            <div className="notification-center__header-copy">
              <strong>{t('shell.notifications.title')}</strong>
              <span>
                {unreadCount > 0
                  ? t('shell.notifications.unread').replace('{count}', String(unreadCount))
                  : t('shell.notifications.allCaughtUp')}
              </span>
            </div>
            {items.length > 0 ? (
              <button
                type="button"
                className="notification-center__mark-all"
                onClick={markAllRead}
              >
                {t('shell.notifications.markAllRead')}
              </button>
            ) : null}
          </div>

          <div className="notification-center__list">
            {isLoading && items.length === 0 ? (
              <p className="notification-center__empty">{t('shell.notifications.loading')}</p>
            ) : null}

            {!isLoading && error ? (
              <p className="notification-center__empty notification-center__empty--error">
                {t('shell.notifications.error')}
              </p>
            ) : null}

            {!isLoading && !error && items.length === 0 ? (
              <p className="notification-center__empty">{t('shell.notifications.empty')}</p>
            ) : null}

            {items.map((item) => {
              const copy = formatNotificationCopy(item, t);
              const unread = isUnread(item);

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`notification-center__item severity-${item.severity}${
                    unread ? ' is-unread' : ''
                  }`}
                  onClick={() => handleItemClick(item)}
                >
                  <span className="notification-center__item-dot" aria-hidden="true" />
                  <span className="notification-center__item-copy">
                    <strong>{copy.title}</strong>
                    <span>{copy.body}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
