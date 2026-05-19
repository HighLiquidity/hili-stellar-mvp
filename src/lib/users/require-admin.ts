import { createClient } from '@supabase/supabase-js';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type AdminContext = {
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>;
  email: string;
};

export async function requireAdminFromAccessToken(accessToken: string): Promise<AdminContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = createSupabaseAdmin();

  if (!url || !anonKey || !admin) {
    throw new Error('Supabase não configurado no servidor.');
  }

  const trimmedToken = accessToken.trim();
  if (!trimmedToken) {
    throw new Error('Sessão inválida.');
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(trimmedToken);
  if (userError || !userData.user?.email) {
    throw new Error('Sessão expirada ou inválida.');
  }

  const email = userData.user.email.trim().toLowerCase();

  const { data: profile, error: profileError } = await admin
    .from('panel_access_list')
    .select('email, role, is_active')
    .eq('email', email)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile?.is_active || profile.role !== 'admin') {
    throw new Error('Acesso restrito a administradores.');
  }

  return { admin, email };
}
