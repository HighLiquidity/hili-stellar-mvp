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
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected authentication error.';
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
