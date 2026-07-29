'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { isOperatorOrAdminRole, canApproveWhitelist, canManageApiKeys, canManagePanelUsers } from '@/lib/users/panel-access';
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
  TreasuryIcon,
  LogoutIcon,
  MenuIcon,
  OnrampIcon,
  OfframpIcon,
  SettingsIcon,
  StatementIcon,
  WithdrawIcon,
} from '../components/Icons';
import { SidebarAppearanceControls } from '../components/SidebarAppearanceControls';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
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

function groupContainsPath(group: NavGroup, pathname: string) {
  return group.items.some((item) => navLinkIsActive(pathname, item.to));
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
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
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

  const primaryNavItems = useMemo<NavItem[]>(
    () => [
      {
        to: '/app/dashboard',
        label: t('nav.dashboard'),
        icon: <DashboardIcon width={16} height={16} />,
      },
    ],
    [t],
  );

  const navGroups = useMemo<NavGroup[]>(() => {
    const role = profile?.role;
    const groups: NavGroup[] = [];

    if (isOperatorOrAdminRole(role)) {
      groups.push({
        id: 'usdc-ramp',
        label: t('nav.groups.usdcRamp'),
        items: [
          {
            to: '/app/onramp',
            label: t('nav.onramp'),
            icon: <OnrampIcon width={16} height={16} />,
          },
          {
            to: '/app/offramp',
            label: t('nav.offramp'),
            icon: <OfframpIcon width={16} height={16} />,
          },
          {
            to: '/app/ramp-orders',
            label: t('nav.rampOrders'),
            icon: <StatementIcon width={16} height={16} />,
          },
        ],
      });
    }

    groups.push({
      id: 'brh-ramp',
      label: t('nav.groups.brhRamp'),
      items: [
        {
          to: '/app/deposit',
          label: t('nav.deposit'),
          icon: <DepositIcon width={16} height={16} />,
        },
        {
          to: '/app/withdraw',
          label: t('nav.withdraw'),
          icon: <WithdrawIcon width={16} height={16} />,
        },
        {
          to: '/app/statement',
          label: t('nav.statement'),
          icon: <StatementIcon width={16} height={16} />,
        },
      ],
    });

    const customerItems: NavItem[] = [];
    if (role === 'admin') {
      customerItems.push(
        {
          to: '/app/clients',
          label: t('nav.clients'),
          icon: <ClientsIcon width={16} height={16} />,
        },
        {
          to: '/app/users',
          label: t('nav.users'),
          icon: <UsersIcon width={16} height={16} />,
        },
      );
    } else if (canManagePanelUsers(role) && role === 'client_admin') {
      customerItems.push({
        to: '/app/users',
        label: t('nav.users'),
        icon: <UsersIcon width={16} height={16} />,
      });
    }

    if (customerItems.length > 0) {
      groups.push({
        id: 'customers',
        label: t('nav.groups.customers'),
        items: customerItems,
      });
    }

    const operationsItems: NavItem[] = [];
    if (role === 'admin') {
      operationsItems.push({
        to: '/app/withdraw-whitelist',
        label: t('nav.withdrawWhitelist'),
        icon: <KeyIcon width={16} height={16} />,
      });
    } else if (
      (canApproveWhitelist(role) && role === 'client_admin') ||
      role === 'operator'
    ) {
      operationsItems.push({
        to: '/app/withdraw-whitelist',
        label: t('nav.myWhitelist'),
        icon: <KeyIcon width={16} height={16} />,
      });
    }

    if (canManageApiKeys(role)) {
      operationsItems.push({
        to: '/app/api-integration',
        label: t('nav.apiIntegration'),
        icon: <ApiIntegrationIcon width={16} height={16} />,
      });
    }

    if (operationsItems.length > 0) {
      groups.push({
        id: 'operations',
        label: t('nav.groups.operations'),
        items: operationsItems,
      });
    }

    if (role === 'admin') {
      groups.push({
        id: 'platform',
        label: t('nav.groups.platform'),
        items: [
          {
            to: '/app/treasury',
            label: t('nav.treasury'),
            icon: <TreasuryIcon width={16} height={16} />,
          },
          {
            to: '/app/event-logs',
            label: t('nav.eventLogs'),
            icon: <EventLogIcon width={16} height={16} />,
          },
          {
            to: '/app/settings',
            label: t('nav.settings'),
            icon: <SettingsIcon width={16} height={16} />,
          },
        ],
      });
    }

    return groups;
  }, [profile?.role, t]);

  const allNavItems = useMemo(
    () => [...primaryNavItems, ...navGroups.flatMap((group) => group.items)],
    [navGroups, primaryNavItems],
  );

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = { ...current };
      let changed = false;

      for (const group of navGroups) {
        if (next[group.id] === undefined) {
          next[group.id] = true;
          changed = true;
        }

        if (groupContainsPath(group, pathname) && !next[group.id]) {
          next[group.id] = true;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [navGroups, pathname]);

  const pageTitle = useMemo(() => {
    if (pathname.startsWith('/app/change-password')) {
      return t('pages.changePassword.title');
    }

    const currentItem = allNavItems.find((item) => navLinkIsActive(pathname, item.to));
    return currentItem?.label ?? t('app.name');
  }, [allNavItems, pathname, t]);

  const breadcrumbItems = useMemo(() => {
    type BreadcrumbItem = { href: string; label: string; current?: boolean };
    const home: BreadcrumbItem = { href: '/app/dashboard', label: t('shell.home') };
    const isHome = pathname === '/app/dashboard' || pathname === '/app';

    if (isHome) {
      return [{ ...home, current: true }];
    }

    return [home, { href: pathname, label: pageTitle, current: true }];
  }, [pageTitle, pathname, t]);

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

  const handleToggleGroup = (groupId: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
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

  const renderNavLink = (item: NavItem) => (
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
  );

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
                  <ChevronRightIcon width={18} height={18} aria-hidden="true" />
                ) : (
                  <ChevronLeftIcon width={18} height={18} aria-hidden="true" />
                )
              ) : (
                <ChevronLeftIcon width={18} height={18} aria-hidden="true" />
              )}
            </button>
            <div className="brand-copy">
              <strong>
                <span className="brand-copy__mark">Hi-Li ::</span> Stellar Anchor
              </strong>
            </div>
          </div>

          <nav className="sidebar__nav" aria-label={t('shell.menu')}>
            <div className="nav-section">{primaryNavItems.map(renderNavLink)}</div>

            {navGroups.map((group) => {
              const isExpanded = Boolean(expandedGroups[group.id]);
              const hasActive = groupContainsPath(group, pathname);

              if (isSidebarCollapsed) {
                return (
                  <div key={group.id} className="nav-section nav-section--collapsed">
                    {group.items.map(renderNavLink)}
                  </div>
                );
              }

              return (
                <div
                  key={group.id}
                  className={`nav-group${isExpanded ? ' is-expanded' : ''}${hasActive ? ' has-active' : ''}`}
                >
                  <button
                    type="button"
                    className="nav-group__toggle"
                    aria-expanded={isExpanded}
                    onClick={() => handleToggleGroup(group.id)}
                  >
                    <span className="nav-group__label">{group.label}</span>
                    <ChevronDownIcon
                      className="nav-group__chevron"
                      width={14}
                      height={14}
                      aria-hidden="true"
                    />
                  </button>

                  {isExpanded ? (
                    <div className="nav-group__items">{group.items.map(renderNavLink)}</div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="sidebar__footer">
          <SidebarAppearanceControls collapsed={isDesktop && isSidebarCollapsed} />
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
                <MenuIcon width={18} height={18} aria-hidden="true" />
              </button>
            ) : null}

            <nav className="breadcrumbs" aria-label={t('shell.breadcrumb')}>
              <ol className="breadcrumbs__list">
                {breadcrumbItems.map((item, index) => (
                  <li key={`${item.href}-${item.label}`} className="breadcrumbs__item">
                    {index > 0 ? (
                      <ChevronRightIcon
                        className="breadcrumbs__separator"
                        width={14}
                        height={14}
                        aria-hidden="true"
                      />
                    ) : null}
                    {item.current ? (
                      <span className="breadcrumbs__current" aria-current="page">
                        {item.label}
                      </span>
                    ) : (
                      <Link href={item.href} className="breadcrumbs__link">
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          <div className="topbar__actions">
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
                <ChevronDownIcon width={14} height={14} aria-hidden="true" />
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
