'use client';

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type Locale = 'pt' | 'en';

type TranslationTree = {
  [key: string]: string | TranslationTree;
};

const STORAGE_KEY = 'fiat-ops.locale';

const dictionaries: Record<Locale, TranslationTree> = {
  pt: {
    app: {
      name: 'Fiat Ops MVP',
      subtitle: 'Operações fiat com experiência pronta para evoluir com backend real.',
      demoBadge: 'Ambiente de demonstração',
      welcome: 'Olá',
      loading: 'Carregando ambiente...',
    },
    auth: {
      title: 'Acesse o painel operacional',
      subtitle: 'Entre com um usuário previamente cadastrado para continuar.',
      email: 'E-mail',
      password: 'Senha',
      emailPlaceholder: 'seu.nome@empresa.com',
      passwordPlaceholder: 'Digite sua senha',
      submit: 'Login',
      loading: 'Entrando...',

      accessNotice: 'Este é um sistema privado. Somente usuários pré-cadastrados têm acesso.',
      accessDenied: 'Sua conta não está autorizada para acessar este painel.',

      hintTitle: 'Como este mock funciona',

      hintBody: 'Não há validação real de credenciais nesta fase. Ao enviar o formulário, a sessão é simulada no navegador.',
      sideTitle: 'Base pronta para depósito e saque PIX',
      sideBody: 'Estrutura inicial com navegação, temas, idiomas e pontos claros para conectar autenticação e backend depois.',
      featureOne: 'Login mock com redirecionamento',
      featureTwo: 'Shell autenticado responsivo',
      featureThree: 'Tema claro/escuro e PT/EN persistentes',
      complianceTitle: 'Observação importante',
      complianceBody: 'Use esta interface apenas para demonstração de produto e validação de UX.',
    },
    nav: {
      dashboard: 'Dashboard',
      deposit: 'Depósito fiat',
      withdraw: 'Saque fiat',
      statement: 'Extrato',
      logout: 'Logout',
    },
    shell: {
      menu: 'Alternar menu lateral',
      theme: 'Alternar tema',
      language: 'Alternar idioma',
      openSidebar: 'Abrir barra lateral',
      closeSidebar: 'Fechar barra lateral',
      userMenu: 'Menu do usuário',
      userFallback: 'Usuário',
      changePassword: 'Alterar senha',
    },
    pages: {
      dashboard: {
        eyebrow: 'Visão geral',
        title: 'Dashboard',
        description: 'Resumo operacional da conta com visão rápida de saldo e movimentações recentes.',
        brhBalance: 'Saldo BRH',
        brhBalanceHint: 'Stablecoin mintada após confirmação de depósito bancário.',
        incomingVolume: 'Entradas recentes',
        outgoingVolume: 'Saídas recentes',
        recentActivity: 'Transações recentes',
        historyEyebrow: 'Atividade',
        historyTitle: 'Últimas transações',
        historyBadge: 'Atualizado agora',
        status: {
          completed: 'Concluída',
          processing: 'Em processamento',
          scheduled: 'Agendada',
        },
        transactions: {
          treasuryTopUp: 'PIX recebido • Reforço de tesouraria',
          corporateSettlement: 'PIX enviado • Liquidação corporativa',
          customerFunding: 'PIX recebido • Aporte de cliente',
          treasuryRebalance: 'PIX enviado • Rebalanceamento de tesouraria',
        },
      },
      deposit: {
        eyebrow: 'PIX',
        badge: 'API pendente',
        title: 'Depósito fiat via PIX',
        description: 'Preencha os dados abaixo para gerar o QR Code PIX do depósito.',
        taxId: 'Tax ID',
        taxIdPlaceholder: 'Informe o tax id do pagador',
        depositAmount: 'Deposit amount (R$)',
        depositAmountPlaceholder: '0,00',
        generateQrCode: 'Generate QR Code (PIX)',
        qrCodeTitle: 'QR Code para pagamento',
        qrCodePlaceholder: 'Placeholder do QR Code PIX',
        copyPasteTitle: 'Código PIX copia e cola',
        copyPastePlaceholder: 'Placeholder do código PIX copia e cola',
        copyPasteButton: 'Copiar código PIX',
        copyPasteCopied: 'Código copiado',
        brhBalance: 'BRH Balance',
        brhBalancePlaceholder: 'BRH Balance',
      },
      withdraw: {
        eyebrow: 'PIX',
        badge: 'Regras pendentes',
        title: 'Saque fiat via PIX',
        description: 'Informe o QR Code de pagamento e o valor do saque para preparar a operação.',
        paymentQrCode: 'QR code para pagamento',
        paymentQrCodePlaceholder: 'Cole aqui o payload ou referência do QR Code',
        cameraPlaceholderLabel: 'Leitura por câmera',
        cameraButton: 'Escanear QR Code',
        withdrawAmount: 'Withdraw amount (R$)',
        withdrawAmountPlaceholder: '0,00',
      },
      statement: {
        eyebrow: 'Ledger',
        title: 'Extrato',
        description: 'Placeholder para histórico operacional, filtros e exportação.',
        cardTitle: 'Em breve',
        cardBody: 'Aqui entrarão listagem de eventos, estados das ordens, filtros por período e detalhes de conciliação.',
      },
      changePassword: {
        eyebrow: 'Segurança',
        title: 'Alterar senha',
        description: 'Defina uma nova senha forte para manter sua conta protegida.',
        accountLabel: 'Conta conectada',
        currentPassword: 'Senha atual',
        currentPasswordPlaceholder: 'Digite a senha atual',
        newPassword: 'Nova senha',
        newPasswordPlaceholder: 'Digite a nova senha',
        confirmPassword: 'Confirmar nova senha',
        confirmPasswordPlaceholder: 'Digite a nova senha novamente',
        submit: 'Atualizar senha',
        submitting: 'Salvando...',
        success: 'Senha atualizada com sucesso.',
        errors: {
          missingUser: 'Não foi possível identificar sua sessão. Faça login novamente.',
          passwordMismatch: 'A nova senha e a confirmação não coincidem.',
        },
      },
    },
    controls: {
      light: 'Claro',
      dark: 'Escuro',
      portuguese: 'PT',
      english: 'EN',
    },
  },
  en: {
    app: {
      name: 'Fiat Ops MVP',
      subtitle: 'Fiat operations experience ready to evolve with a real backend.',
      demoBadge: 'Demo environment',
      welcome: 'Hello',
      loading: 'Loading workspace...',
    },
    auth: {
      title: 'Access the operations panel',
      subtitle: 'Sign in with a pre-authorized account to continue.',
      email: 'Email',
      password: 'Password',
      emailPlaceholder: 'your.name@company.com',
      passwordPlaceholder: 'Enter your password',
      submit: 'Login',
      loading: 'Signing in...',
      accessNotice: 'This is a private system. Only pre-registered users can access it.',
      accessDenied: 'Your account is not authorized to access this panel.',

      hintTitle: 'How this mock works',
      hintBody: 'There is no real credential validation at this stage. When you submit the form, a browser session is simulated.',
      sideTitle: 'Foundation ready for PIX deposits and withdrawals',
      sideBody: 'Initial structure with navigation, themes, languages and clear points to connect authentication and backend later.',
      featureOne: 'Mock login with redirect',
      featureTwo: 'Responsive authenticated shell',
      featureThree: 'Persistent light/dark mode and PT/EN',
      complianceTitle: 'Important note',
      complianceBody: 'Use this interface only for product demos and UX validation.',
    },
    nav: {
      dashboard: 'Dashboard',
      deposit: 'Fiat deposit',
      withdraw: 'Fiat withdrawal',
      statement: 'Statement',
      logout: 'Logout',
    },
    shell: {
      menu: 'Toggle sidebar',
      theme: 'Toggle theme',
      language: 'Toggle language',
      openSidebar: 'Open sidebar',
      closeSidebar: 'Close sidebar',
      userMenu: 'User menu',
      userFallback: 'User',
      changePassword: 'Change password',
    },
    pages: {
      dashboard: {
        eyebrow: 'Overview',
        title: 'Dashboard',
        description: 'Operational account summary with a quick view of available balance and recent activity.',
        brhBalance: 'BRH Balance',
        brhBalanceHint: 'Stablecoin minted after bank deposit confirmation.',
        incomingVolume: 'Recent inflows',
        outgoingVolume: 'Recent outflows',
        recentActivity: 'Recent transactions',
        historyEyebrow: 'Activity',
        historyTitle: 'Latest transactions',
        historyBadge: 'Updated just now',
        status: {
          completed: 'Completed',
          processing: 'Processing',
          scheduled: 'Scheduled',
        },
        transactions: {
          treasuryTopUp: 'PIX inbound • Treasury top-up',
          corporateSettlement: 'PIX payout • Corporate settlement',
          customerFunding: 'PIX inbound • Customer funding',
          treasuryRebalance: 'PIX payout • Treasury rebalance',
        },
      },
      deposit: {
        eyebrow: 'PIX',
        badge: 'API pending',
        title: 'Fiat deposit via PIX',
        description: 'Fill in the details below to generate the PIX QR code for the deposit.',
        taxId: 'Tax ID',
        taxIdPlaceholder: 'Enter the payer tax id',
        depositAmount: 'Deposit amount (R$)',
        depositAmountPlaceholder: '0.00',
        generateQrCode: 'Generate QR Code (PIX)',
        qrCodeTitle: 'Payment QR code',
        qrCodePlaceholder: 'PIX QR code placeholder',
        copyPasteTitle: 'PIX copy and paste code',
        copyPastePlaceholder: 'PIX copy and paste placeholder',
        copyPasteButton: 'Copy PIX code',
        copyPasteCopied: 'Code copied',
        brhBalance: 'BRH Balance',
        brhBalancePlaceholder: 'BRH Balance',
      },
      withdraw: {
        eyebrow: 'PIX',
        badge: 'Rules pending',
        title: 'Fiat withdrawal via PIX',
        description: 'Provide the payment QR code and withdrawal amount to prepare the operation.',
        paymentQrCode: 'Payment QR code',
        paymentQrCodePlaceholder: 'Paste the QR code payload or reference here',
        cameraPlaceholderLabel: 'Camera scan',
        cameraButton: 'Scan QR Code',
        withdrawAmount: 'Withdraw amount (R$)',
        withdrawAmountPlaceholder: '0.00',
      },
      statement: {
        eyebrow: 'Ledger',
        title: 'Statement',
        description: 'Placeholder for operational history, filters, and export.',
        cardTitle: 'Coming soon',
        cardBody: 'This area will host event lists, order states, period filters, and reconciliation details.',
      },
      changePassword: {
        eyebrow: 'Security',
        title: 'Change password',
        description: 'Choose a strong new password to keep your account protected.',
        accountLabel: 'Signed-in account',
        currentPassword: 'Current password',
        currentPasswordPlaceholder: 'Enter your current password',
        newPassword: 'New password',
        newPasswordPlaceholder: 'Enter a new password',
        confirmPassword: 'Confirm new password',
        confirmPasswordPlaceholder: 'Enter the new password again',
        submit: 'Update password',
        submitting: 'Saving...',
        success: 'Your password was updated successfully.',
        errors: {
          missingUser: 'We could not identify your session. Please sign in again.',
          passwordMismatch: 'The new password and confirmation do not match.',
        },
      },
    },
    controls: {
      light: 'Light',
      dark: 'Dark',
      portuguese: 'PT',
      english: 'EN',
    },
  },
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'pt';
  }

  const storedLocale = window.localStorage.getItem(STORAGE_KEY);

  if (storedLocale === 'pt' || storedLocale === 'en') {
    return storedLocale;
  }

  const browserLanguage = navigator.language.toLowerCase();
  return browserLanguage.startsWith('pt') ? 'pt' : 'en';
}

function resolveTranslation(tree: TranslationTree, key: string): string {
  const value = key.split('.').reduce<string | TranslationTree | undefined>((current, segment) => {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    return current[segment];
  }, tree);

  return typeof value === 'string' ? value : key;
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>('pt');

  useEffect(() => {
    setLocale(getInitialLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en';
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => {
        window.localStorage.setItem(STORAGE_KEY, nextLocale);
        setLocale(nextLocale);
      },
      t: (key) => resolveTranslation(dictionaries[locale], key),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }

  return context;
}