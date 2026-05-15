import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { I18nProvider, useI18n } from './lib/i18n';
import { ThemeProvider } from './lib/theme';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DepositPage } from './pages/DepositPage';
import { WithdrawPage } from './pages/WithdrawPage';
import { StatementPage } from './pages/StatementPage';

function LoadingScreen() {
  const { t } = useI18n();

  return (
    <div className="loading-screen">
      <div className="loading-screen__card">
        <div className="loading-screen__spinner" aria-hidden="true" />
        <p>{t('app.loading')}</p>
      </div>
    </div>
  );
}

function AuthenticatedRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

function PublicLoginRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <LoginPage />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to={isAuthenticated ? '/app/dashboard' : '/login'} replace />} />
      <Route path="/login" element={<PublicLoginRoute />} />
      <Route element={<AuthenticatedRoutes />}>
        <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="/app/dashboard" element={<DashboardPage />} />
        <Route path="/app/deposit" element={<DepositPage />} />
        <Route path="/app/withdraw" element={<WithdrawPage />} />
        <Route path="/app/statement" element={<StatementPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}