import { AuthApiError } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';

export interface AccessProfile {
  email: string;
  full_name: string | null;
  role: 'admin' | 'operator' | 'viewer';
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
}

export function getAuthErrorMessage(error: unknown) {
  if (error instanceof AuthApiError) {
    const msg = error.message.trim();
    if (error.status === 400 && /invalid login credentials/i.test(msg)) {
      return 'E-mail ou senha incorretos.';
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

export async function changeUserPassword({ email, currentPassword, newPassword }: ChangePasswordInput) {
  const normalizedEmail = email.trim().toLowerCase();

  const signInResult = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: currentPassword,
  });

  if (signInResult.error) {
    throw signInResult.error;
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
