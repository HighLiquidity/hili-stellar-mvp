import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../lib/i18n';
import { Button } from '../components/ui/Button';
import { DepositIcon, LogoutIcon, MenuIcon, StatementIcon, WithdrawIcon } from '../components/Icons';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageToggle } from '../components/LanguageToggle';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { t } = useI18n();

  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

  const navItems = useMemo<NavItem[]>(
    () => [
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
    [t],
  );

  const pageTitle = useMemo(() => {
    const currentItem = navItems.find((item) => pathname.startsWith(item.to));
    return currentItem?.label ?? t('app.name');
  }, [navItems, pathname, t]);

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

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
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
        <div className="sidebar__brand">
          <div className="brand-mark">F</div>
          <div className="brand-copy">
            <strong>{t('app.name')}</strong>
            <span>{t('app.demoBadge')}</span>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label={t('shell.menu')}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleNavigation}
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
              title={isSidebarCollapsed ? item.label : undefined}
            >
              <span className="nav-link__icon">{item.icon}</span>
              <span className="nav-link__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <p className="sidebar__note">{t('app.mockNotice')}</p>
          <Button variant="secondary" className="sidebar__logout" onClick={handleLogout}>
            <LogoutIcon width={18} height={18} />
            <span>{t('nav.logout')}</span>
          </Button>
        </div>
      </aside>

      <div className="shell__content">
        <header className="topbar">
          <div className="topbar__main">
            <button
              type="button"
              className="icon-button"
              onClick={handleMenuToggle}
              aria-label={sidebarStateLabel}
              aria-controls="app-sidebar"
              aria-expanded={isDesktop ? !isSidebarCollapsed : isSidebarOpen}
            >
              <MenuIcon width={20} height={20} />
            </button>
            <div>
              <p className="eyebrow">{t('app.demoBadge')}</p>
              <h1>{pageTitle}</h1>
            </div>
          </div>

          <div className="topbar__actions">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
