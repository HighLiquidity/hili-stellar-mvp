'use client';

import type { PropsWithChildren } from 'react';
import { AuthProvider } from '@/hooks/useAuth';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';

export function ClientProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
