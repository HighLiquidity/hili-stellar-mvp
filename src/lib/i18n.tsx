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

      forgotPassword: 'Esqueci minha senha',
      forgotPasswordTitle: 'Recuperar senha',
      forgotPasswordLead:
        'Informe o e-mail cadastrado. Se existir uma conta, você receberá um link para definir uma nova senha.',
      forgotPasswordSubmit: 'Enviar link',
      forgotPasswordSending: 'Enviando...',
      forgotPasswordSuccess:
        'Se houver uma conta para este e-mail, enviamos instruções. Verifique também a pasta de spam.',
      forgotPasswordBackToLogin: 'Voltar ao login',

      resetPasswordTitle: 'Definir nova senha',
      resetPasswordLead: 'Escolha uma senha forte e confirme abaixo.',
      resetPasswordNew: 'Nova senha',
      resetPasswordConfirm: 'Confirmar nova senha',
      resetPasswordNewPlaceholder: 'Digite a nova senha',
      resetPasswordConfirmPlaceholder: 'Digite novamente',
      resetPasswordSubmit: 'Salvar senha',
      resetPasswordSubmitting: 'Salvando...',
      resetPasswordSuccess: 'Senha atualizada. Faça login com a nova senha.',
      resetPasswordInvalidLink:
        'Este link expirou ou é inválido. Solicite novamente a recuperação de senha.',
      resetPasswordBackToLogin: 'Ir para o login',
      resetPasswordMismatch: 'As senhas não coincidem.',
      loginAfterResetMessage: 'Senha redefinida. Entre com sua nova senha.',

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
      adminSettings: 'Configurações',
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
        badge: 'PIX dinâmico',
        title: 'Depósito fiat via PIX',
        description: 'Preencha os dados abaixo para gerar o QR Code PIX do depósito.',
        taxId: 'Tax ID',
        taxIdPlaceholder: 'Informe o tax id do pagador',
        depositAmount: 'Valor do depósito (R$)',
        depositAmountPlaceholder: '0,00',
        generateQrCode: 'Gerar QR Code (PIX)',
        generateQrCodeLoading: 'Gerando cobrança...',
        qrCodeTitle: 'QR Code para pagamento',
        qrCodePlaceholder: 'O QR Code aparecerá aqui após a geração.',
        copyPasteTitle: 'Código PIX copia e cola',
        copyPastePlaceholder: 'O código copia e cola aparecerá aqui.',
        copyPasteButton: 'Copiar código PIX',
        copyPasteCopied: 'Código copiado',
        brhBalance: 'Saldo BRH',
        brhBalancePlaceholder: '—',
        errors: {
          taxIdRequired: 'Informe o tax ID do pagador.',
          invalidAmount: 'Valor inválido. Use até 2 casas decimais (ex.: 100 ou 99,90).',
          amountNotPositive: 'O valor do depósito deve ser maior que zero.',
          exceedsMaxDeposit:
            'Depósito acima do limite permitido. O valor máximo é {{limit}}.',
          fallback: 'Não foi possível gerar a cobrança. Tente novamente.',
          copyFailed: 'Não foi possível copiar. Selecione o código manualmente.',
        },
      },
      withdraw: {
        eyebrow: 'PIX',
        badge: 'Integração parcial',
        title: 'Saque fiat via PIX',
        description:
          'Cole o código PIX copia e cola do pagamento. O valor será extraído do QR quando possível; confirme com Sacar.',
        paymentQrCode: 'QR code para pagamento',
        paymentQrCodePlaceholder: 'Cole o código PIX copia e cola',
        cameraPlaceholderLabel: 'Leitura por câmera',
        cameraButton: 'Escanear QR Code',
        withdrawAmount: 'Valor do saque (R$)',
        withdrawAmountPlaceholder: '0,00',
        amountFromQrHint: 'Valor preenchido automaticamente a partir do QR.',
        amountManualHint: 'Informe o valor se o QR for estático (sem valor embutido).',
        beneficiary: 'Beneficiário',
        brhBalance: 'Saldo BRH',
        brhBalanceHint: '1 BRH ≈ 1 BRL no MVP. O saque exige saldo suficiente antes do burn e do PIX.',
        submit: 'Sacar',
        submitLoading: 'Processando saque...',
        errors: {
          qrRequired: 'Informe o código PIX do pagamento.',
          invalidQr: 'Código PIX inválido.',
          amountRequired: 'Informe o valor do saque (o QR não contém valor fixo).',
          invalidAmount: 'Valor inválido. Use até 2 casas decimais.',
          amountNotPositive: 'O valor do saque deve ser maior que zero.',
          exceedsMaxWithdraw: 'Saque acima do limite permitido. O valor máximo é {{limit}}.',
          insufficientBrh: 'Saldo BRH insuficiente para este saque.',
          burnFailed: 'Falha ao solicitar burn de BRH.',
          fallback: 'Não foi possível processar o saque. Tente novamente.',
        },
        success: {
          completed: 'Saque de {{amount}} enviado via PIX.',
          e2e: 'E2E: {{e2e}}',
          burnSkipped: 'Burn BRH ainda não executado (configure BRH_BURN_API_URL).',
          validated:
            'Validação concluída (saldo e limites OK). Burn e cash out CorpX aguardam integração.',
        },
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
      settings: {
        eyebrow: 'Admin',
        title: 'Configurações para testes',
        description:
          'Limites e chaves usados em cenários de teste (depósito, saque, mint/burn BRH). Apenas administradores.',
        loading: 'Carregando…',
        loadError: 'Não foi possível carregar as configurações. Verifique se a tabela existe no Supabase.',
        back: 'Voltar ao dashboard',
        maxDeposit: 'Valor máximo — depósito fiat (R$)',
        maxDepositPlaceholder: 'ex.: 100000.00',
        maxWithdraw: 'Valor máximo — saque / pagamento fiat (R$)',
        maxWithdrawPlaceholder: 'ex.: 50000.00',
        brhWallet: 'Carteira BRH (mint / burn)',
        brhWalletPlaceholder: 'Endereço ou identificador da wallet',
        pixWithdraw: 'Chave PIX de destino (saques fiat)',
        pixWithdrawPlaceholder: 'CPF, CNPJ, e-mail, telefone ou EVP',
        save: 'Salvar configurações',
        saving: 'Salvando…',
        saveSuccess: 'Configurações salvas.',
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

      forgotPassword: 'Forgot password',
      forgotPasswordTitle: 'Reset password',
      forgotPasswordLead:
        'Enter the email on your account. If it exists, we will send a link to set a new password.',
      forgotPasswordSubmit: 'Send link',
      forgotPasswordSending: 'Sending...',
      forgotPasswordSuccess:
        'If an account exists for this email, we sent instructions. Check your spam folder too.',
      forgotPasswordBackToLogin: 'Back to sign in',

      resetPasswordTitle: 'Set a new password',
      resetPasswordLead: 'Choose a strong password and confirm it below.',
      resetPasswordNew: 'New password',
      resetPasswordConfirm: 'Confirm new password',
      resetPasswordNewPlaceholder: 'Enter new password',
      resetPasswordConfirmPlaceholder: 'Enter again',
      resetPasswordSubmit: 'Save password',
      resetPasswordSubmitting: 'Saving...',
      resetPasswordSuccess: 'Password updated. Sign in with your new password.',
      resetPasswordInvalidLink: 'This link expired or is invalid. Request password reset again.',
      resetPasswordBackToLogin: 'Go to sign in',
      resetPasswordMismatch: 'Passwords do not match.',
      loginAfterResetMessage: 'Password reset. Sign in with your new password.',

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
      adminSettings: 'Settings',
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
        badge: 'Dynamic PIX',
        title: 'Fiat deposit via PIX',
        description: 'Fill in the details below to generate the PIX QR code for the deposit.',
        taxId: 'Tax ID',
        taxIdPlaceholder: 'Enter the payer tax id',
        depositAmount: 'Deposit amount (R$)',
        depositAmountPlaceholder: '0.00',
        generateQrCode: 'Generate QR Code (PIX)',
        generateQrCodeLoading: 'Creating charge...',
        qrCodeTitle: 'Payment QR code',
        qrCodePlaceholder: 'The QR code will appear here after generation.',
        copyPasteTitle: 'PIX copy and paste code',
        copyPastePlaceholder: 'The copy-and-paste code will appear here.',
        copyPasteButton: 'Copy PIX code',
        copyPasteCopied: 'Code copied',
        brhBalance: 'BRH Balance',
        brhBalancePlaceholder: '—',
        errors: {
          taxIdRequired: 'Please enter the payer tax ID.',
          invalidAmount: 'Invalid amount. Use up to 2 decimal places (e.g. 100 or 99.90).',
          amountNotPositive: 'Deposit amount must be greater than zero.',
          exceedsMaxDeposit:
            'Deposit exceeds the permitted limit. The maximum amount is {{limit}}.',
          fallback: 'Could not create the charge. Please try again.',
          copyFailed: 'Could not copy. Select the code manually.',
        },
      },
      withdraw: {
        eyebrow: 'PIX',
        badge: 'Partial integration',
        title: 'Fiat withdrawal via PIX',
        description:
          'Paste the PIX copy-and-paste code. The amount is read from the QR when possible; confirm with Withdraw.',
        paymentQrCode: 'Payment QR code',
        paymentQrCodePlaceholder: 'Paste the PIX copy-and-paste code',
        cameraPlaceholderLabel: 'Camera scan',
        cameraButton: 'Scan QR Code',
        withdrawAmount: 'Withdraw amount (R$)',
        withdrawAmountPlaceholder: '0.00',
        amountFromQrHint: 'Amount filled automatically from the QR code.',
        amountManualHint: 'Enter the amount if the QR is static (no embedded value).',
        beneficiary: 'Beneficiary',
        brhBalance: 'BRH Balance',
        brhBalanceHint: '1 BRH ≈ 1 BRL in the MVP. Withdrawal requires sufficient balance before burn and PIX.',
        submit: 'Withdraw',
        submitLoading: 'Processing withdrawal...',
        errors: {
          qrRequired: 'Please enter the payment PIX code.',
          invalidQr: 'Invalid PIX code.',
          amountRequired: 'Enter the withdrawal amount (QR has no fixed amount).',
          invalidAmount: 'Invalid amount. Use up to 2 decimal places.',
          amountNotPositive: 'Withdrawal amount must be greater than zero.',
          exceedsMaxWithdraw: 'Withdrawal exceeds the permitted limit. Maximum is {{limit}}.',
          insufficientBrh: 'Insufficient BRH balance for this withdrawal.',
          burnFailed: 'Failed to request BRH burn.',
          fallback: 'Could not process the withdrawal. Please try again.',
        },
        success: {
          completed: 'Withdrawal of {{amount}} submitted via PIX.',
          e2e: 'E2E: {{e2e}}',
          burnSkipped: 'BRH burn not executed yet (set BRH_BURN_API_URL).',
          validated: 'Validation OK (balance and limits). Burn and CorpX cash out await integration.',
        },
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
      settings: {
        eyebrow: 'Admin',
        title: 'Test settings',
        description:
          'Limits and keys used in test scenarios (deposit, withdrawal, BRH mint/burn). Admins only.',
        loading: 'Loading…',
        loadError: 'Could not load settings. Ensure the table exists in Supabase.',
        back: 'Back to dashboard',
        maxDeposit: 'Maximum — fiat deposit (BRL)',
        maxDepositPlaceholder: 'e.g. 100000.00',
        maxWithdraw: 'Maximum — fiat withdrawal / payout (BRL)',
        maxWithdrawPlaceholder: 'e.g. 50000.00',
        brhWallet: 'BRH wallet (mint / burn)',
        brhWalletPlaceholder: 'Wallet address or identifier',
        pixWithdraw: 'Destination PIX key (fiat withdrawals)',
        pixWithdrawPlaceholder: 'CPF, CNPJ, email, phone, or EVP',
        save: 'Save settings',
        saving: 'Saving…',
        saveSuccess: 'Settings saved.',
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