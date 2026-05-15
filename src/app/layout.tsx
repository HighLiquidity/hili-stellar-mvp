import type { Metadata } from 'next';
import { ClientProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fiat Ops MVP',
  description:
    'MVP frontend para operações fiat com depósito PIX, saque PIX, extrato, autenticação, tema e idioma persistentes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
