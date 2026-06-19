'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { isOperatorOrAdminRole } from '@/lib/users/panel-access';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  DepositIcon,
  EventLogIcon,
  ClientsIcon,
  UsersIcon,
  ApiIntegrationIcon,
  KeyIcon,
  LogoutIcon,
  MenuIcon,
  OnrampIcon,
  OfframpIcon,
  SettingsIcon,
  StatementIcon,
  WithdrawIcon,
} from '../components/Icons';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageToggle } from '../components/LanguageToggle';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

function getInitials(name: string, fallbackEmail?: string | null) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }

  if (parts.length === 1 && parts[0]) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (fallbackEmail ?? '').slice(0, 2).toUpperCase() || 'US';
}

function navLinkIsActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, profile, user } = useAuth();
  const { t } = useI18n();
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
      if (event.matches) {
        setIsSidebarOpen(false);
      }
    };

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const navItems = useMemo<NavItem[]>(
    () => [
      {
        to: '/app/dashboard',
        label: t('nav.dashboard'),
        icon: <DashboardIcon width={18} height={18} />,
      },
      ...(isOperatorOrAdminRole(profile?.role)
        ? [
            {
              to: '/app/onramp',
              label: t('nav.onramp'),
              icon: <OnrampIcon width={18} height={18} />,
            } satisfies NavItem,
            {
              to: '/app/offramp',
              label: t('nav.offramp'),
              icon: <OfframpIcon width={18} height={18} />,
            } satisfies NavItem,
            {
              to: '/app/ramp-orders',
              label: t('nav.rampOrders'),
              icon: <StatementIcon width={18} height={18} />,
            } satisfies NavItem,
          ]
        : []),
      {
        to: '/app/deposit',
        label: t('nav.deposit'),
        icon: <DepositIcon width={18} height={18} />,
      },
      {
        to: '/app/withdraw',
        label: t('nav.withdraw'),
        icon: <WithdrawIcon width={18} height={18} />,
      },
      {
        to: '/app/statement',
        label: t('nav.statement'),
        icon: <StatementIcon width={18} height={18} />,
      },
    ],
    [profile?.role, t],
  );

  const managementNavItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [];

    if (profile?.role === 'admin') {
      items.push(
        {
          to: '/app/clients',
          label: t('nav.clients'),
          icon: <ClientsIcon width={18} height={18} />,
        },
        {
          to: '/app/users',
          label: t('nav.users'),
          icon: <UsersIcon width={18} height={18} />,
        },
        {
          to: '/app/withdraw-whitelist',
          label: t('nav.withdrawWhitelist'),
          icon: <KeyIcon width={18} height={18} />,
        },
      );
    }

    if (profile?.role === 'operator') {
      items.push({
        to: '/app/withdraw-whitelist',
        label: t('nav.myWhitelist'),
        icon: <KeyIcon width={18} height={18} />,
      });
    }

    if (isOperatorOrAdminRole(profile?.role)) {
      items.push({
        to: '/app/api-integration',
        label: t('nav.apiIntegration'),
        icon: <ApiIntegrationIcon width={18} height={18} />,
      });
    }

    if (profile?.role === 'admin') {
      items.push(
        {
          to: '/app/event-logs',
          label: t('nav.eventLogs'),
          icon: <EventLogIcon width={18} height={18} />,
        },
        {
          to: '/app/settings',
          label: t('nav.settings'),
          icon: <SettingsIcon width={18} height={18} />,
        },
      );
    }

    return items;
  }, [profile?.role, t]);

  const pageTitle = useMemo(() => {
    if (pathname.startsWith('/app/change-password')) {
      return t('pages.changePassword.title');
    }
    if (pathname.startsWith('/app/settings')) {
      return t('pages.settings.title');
    }
    if (pathname.startsWith('/app/users')) {
      return t('pages.userManagement.title');
    }
    if (pathname.startsWith('/app/api-integration')) {
      return t('pages.apiIntegration.title');
    }
    if (pathname.startsWith('/app/event-logs')) {
      return t('pages.eventLogs.title');
    }

    const currentItem = [...navItems, ...managementNavItems].find((item) => pathname.startsWith(item.to));
    return currentItem?.label ?? t('app.name');
  }, [managementNavItems, navItems, pathname, t]);

  const userDisplayName = profile?.full_name?.trim() || user?.email || t('shell.userFallback');
  const userInitials = getInitials(profile?.full_name ?? '', user?.email);

  const handleMenuToggle = () => {
    if (isDesktop) {
      setIsSidebarCollapsed((current) => !current);
      return;
    }

    setIsSidebarOpen((current) => !current);
  };

  const handleNavigation = () => {
    if (!isDesktop) {
      setIsSidebarOpen(false);
    }
  };

  const handleOpenChangePassword = () => {
    setIsUserMenuOpen(false);
    router.push('/app/change-password');
  };

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
    router.replace('/login');
  };

  const sidebarStateLabel = isDesktop
    ? t('shell.menu')
    : isSidebarOpen
      ? t('shell.closeSidebar')
      : t('shell.openSidebar');

  return (
    <div className="shell">
      {!isDesktop && isSidebarOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label={t('shell.closeSidebar')}
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={`sidebar${isDesktop ? ' is-desktop' : ''}${isSidebarOpen ? ' is-open' : ''}${
          isSidebarCollapsed ? ' is-collapsed' : ''
        }`}
      >
        <div className="sidebar__main">
          <div className="sidebar__brand">
            <button
              type="button"
              className="brand-mark brand-mark--toggle"
              onClick={handleMenuToggle}
              aria-label={sidebarStateLabel}
              aria-controls="app-sidebar"
              aria-expanded={isDesktop ? !isSidebarCollapsed : isSidebarOpen}
            >
              {isDesktop ? (
                isSidebarCollapsed ? (
                  <ChevronRightIcon width={22} height={22} aria-hidden="true" />
                ) : (
                  <ChevronLeftIcon width={22} height={22} aria-hidden="true" />
                )
              ) : (
                <ChevronLeftIcon width={22} height={22} aria-hidden="true" />
              )}
            </button>
            <div className="brand-copy">
              <strong>
                <span className="brand-copy__mark">Hi-Li ::</span> Stellar MVP
              </strong>
              <span>{t('app.demoBadge')}</span>
            </div>
          </div>

          <nav className="sidebar__nav" aria-label={t('shell.menu')}>
            {navItems.map((item) => (
              <Link
                key={item.to}
                href={item.to}
                onClick={handleNavigation}
                className={`nav-link${navLinkIsActive(pathname, item.to) ? ' is-active' : ''}`}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <span className="nav-link__icon">{item.icon}</span>
                <span className="nav-link__label">{item.label}</span>
              </Link>
            ))}

            {managementNavItems.length > 0 ? (
              <>
                <div className="sidebar__nav-divider" aria-hidden="true" />
                {managementNavItems.map((item) => (
                  <Link
                    key={item.to}
                    href={item.to}
                    onClick={handleNavigation}
                    className={`nav-link nav-link--admin${navLinkIsActive(pathname, item.to) ? ' is-active' : ''}`}
                    title={isSidebarCollapsed ? item.label : undefined}
                  >
                    <span className="nav-link__icon">{item.icon}</span>
                    <span className="nav-link__label">{item.label}</span>
                  </Link>
                ))}
              </>
            ) : null}
          </nav>
        </div>
      </aside>

      <div className="shell__content">
        <header className="topbar">
          <div className="topbar__main">
            {!isDesktop ? (
              <button
                type="button"
                className="icon-button"
                onClick={handleMenuToggle}
                aria-label={sidebarStateLabel}
                aria-controls="app-sidebar"
                aria-expanded={isSidebarOpen}
              >
                <MenuIcon width={20} height={20} aria-hidden="true" />
              </button>
            ) : null}
            <div>
              <p className="eyebrow">{t('app.demoBadge')}</p>
              <h1>{pageTitle}</h1>
            </div>
          </div>

          <div className="topbar__actions">
            <LanguageToggle />
            <ThemeToggle />

            <div className="user-menu" ref={userMenuRef}>
              <button
                type="button"
                className={`user-menu__trigger${isUserMenuOpen ? ' is-open' : ''}`}
                aria-label={t('shell.userMenu')}
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
                onClick={() => setIsUserMenuOpen((current) => !current)}
              >
                <span className="user-menu__avatar" aria-hidden="true">
                  {userInitials}
                </span>
                <ChevronDownIcon width={16} height={16} aria-hidden="true" />
              </button>

              {isUserMenuOpen ? (
                <div className="user-menu__dropdown" role="menu" aria-label={t('shell.userMenu')}>
                  <div className="user-menu__header">
                    <strong>{userDisplayName}</strong>
                    <span>{profile?.role ?? 'user'}</span>
                  </div>

                  <button
                    type="button"
                    className="user-menu__item"
                    role="menuitem"
                    onClick={handleOpenChangePassword}
                  >
                    <KeyIcon width={16} height={16} />
                    <span>{t('shell.changePassword')}</span>
                  </button>

                  <button
                    type="button"
                    className="user-menu__item"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <LogoutIcon width={16} height={16} />
                    <span>{t('nav.logout')}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
