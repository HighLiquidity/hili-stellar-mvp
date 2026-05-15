import { AuthApiError } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';

export interface AccessProfile {
  email: string;
  full_name: string | null;
  role: 'admin' | 'operator' | 'viewer';
  is_active: boolean;
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
