import { AuthApiError } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';
import { sessionNeedsMfaChallenge } from './auth/aal';
import { unverifiedTotpFactors, verifiedTotpFactors } from './auth/factors';

export interface AccessProfile {
  email: string;
  full_name: string | null;
  role: 'admin' | 'client_admin' | 'operator' | 'viewer';
  is_active: boolean;
}

export interface SignInInput {
  email: string;
  password: string;
}

interface ChangePasswordInput {
  email: string;
  currentPassword: string;
  newPassword: string;
  totpCode?: string;
}

export type TotpEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export type MfaAssurance = {
  currentLevel: string | null;
  nextLevel: string | null;
};

function authErrorCode(error: AuthApiError): string {
  const code = (error as AuthApiError & { code?: string }).code;
  return typeof code === 'string' ? code : '';
}

function normalizeTotpCode(code: string): string {
  return code.replace(/\s+/g, '').trim();
}

export function getAuthErrorMessage(error: unknown) {
  if (error instanceof AuthApiError) {
    const msg = error.message.trim();
    const code = authErrorCode(error);
    if (error.status === 400 && /invalid login credentials/i.test(msg)) {
      return 'E-mail ou senha incorretos.';
    }
    if (
      code === 'mfa_verification_failed' ||
      code === 'mfa_challenge_expired' ||
      /invalid (totp )?code|mfa verification failed/i.test(msg)
    ) {
      return 'Código de autenticação inválido.';
    }
    if (/email not confirmed/i.test(msg)) {
      return 'Confirme seu e-mail antes de entrar (verifique a caixa de entrada ou desative a confirmação no Supabase Auth).';
    }
    if (/invalid api key/i.test(msg)) {
      return 'Chave anon do Supabase inválida. Confira NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local (Project Settings → API).';
    }
    return msg;
  }

  if (error instanceof Error) {
    const msg = error.message.trim();
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return 'Não foi possível conectar ao Supabase. Verifique NEXT_PUBLIC_SUPABASE_URL, se o projeto não está pausado e sua conexão com a internet.';
    }
    return msg || error.name;
  }

  return 'Erro inesperado ao autenticar.';
}

export async function signInUser({ email, password }: SignInInput) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function getMfaAssurance(): Promise<MfaAssurance> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    throw error;
  }

  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
  };
}

export async function listTotpFactorState() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    throw error;
  }

  return data;
}

export async function getVerifiedTotpFactor() {
  const data = await listTotpFactorState();
  return verifiedTotpFactors(data)[0] ?? null;
}

export async function completeTotpChallenge(code: string) {
  const normalized = normalizeTotpCode(code);
  if (!normalized) {
    throw new Error('Informe o código de autenticação.');
  }

  const data = await listTotpFactorState();
  const factor = verifiedTotpFactors(data)[0] ?? data.totp[0];
  if (!factor?.id) {
    throw new Error('Nenhum autenticador encontrado nesta conta.');
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError) {
    throw challengeError;
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: normalized,
  });
  if (verifyError) {
    throw verifyError;
  }
}

export async function enrollTotpFactor(): Promise<TotpEnrollment> {
  await discardUnverifiedTotpFactors();

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Authenticator',
  });
  if (error) {
    throw error;
  }

  const totp = data.totp;
  if (!data.id || !totp?.qr_code || !totp.secret) {
    throw new Error('Não foi possível iniciar o cadastro do autenticador.');
  }

  return {
    factorId: data.id,
    qrCode: totp.qr_code,
    secret: totp.secret,
  };
}

export async function verifyTotpEnrollment(factorId: string, code: string) {
  const normalized = normalizeTotpCode(code);
  if (!normalized) {
    throw new Error('Informe o código de autenticação.');
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) {
    throw challengeError;
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: normalized,
  });
  if (verifyError) {
    throw verifyError;
  }
}

export async function unenrollTotpFactor(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    throw error;
  }
}

export async function discardUnverifiedTotpFactors() {
  const data = await listTotpFactorState();
  const pending = unverifiedTotpFactors(data);
  for (const factor of pending) {
    if (factor.id) {
      await unenrollTotpFactor(factor.id);
    }
  }
}

export async function disableVerifiedTotp(code: string) {
  const factor = await getVerifiedTotpFactor();
  if (!factor?.id) {
    throw new Error('A autenticação em duas etapas não está ativa.');
  }

  await completeTotpChallenge(code);
  await unenrollTotpFactor(factor.id);
}

export async function changeUserPassword({
  email,
  currentPassword,
  newPassword,
  totpCode,
}: ChangePasswordInput) {
  const normalizedEmail = email.trim().toLowerCase();

  const signInResult = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: currentPassword,
  });

  if (signInResult.error) {
    throw signInResult.error;
  }

  let assurance: MfaAssurance = { currentLevel: 'aal1', nextLevel: 'aal1' };
  try {
    assurance = await getMfaAssurance();
  } catch {
    assurance = { currentLevel: 'aal1', nextLevel: 'aal1' };
  }

  if (sessionNeedsMfaChallenge(assurance.currentLevel, assurance.nextLevel)) {
    if (!totpCode?.trim()) {
      throw new Error('Código de autenticação obrigatório.');
    }
    await completeTotpChallenge(totpCode);
  }

  const updateResult = await supabase.auth.updateUser({ password: newPassword });

  if (updateResult.error) {
    throw updateResult.error;
  }

  return updateResult.data.user;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export function getPasswordResetRedirectUrl() {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '');

  return origin ? `${origin}/reset-password` : '';
}

export async function requestPasswordReset(email: string) {
  const redirectTo = getPasswordResetRedirectUrl();

  if (!redirectTo) {
    throw new Error(
      'Missing app URL for password reset. Set NEXT_PUBLIC_SITE_URL when not running in the browser.',
    );
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  });

  if (error) {
    throw error;
  }
}

export async function setPasswordAfterRecovery(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    throw error;
  }
}

export async function getAuthorizedAccessProfile(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from('panel_access_list')
    .select('email, full_name, role, is_active')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as AccessProfile | null;
}
