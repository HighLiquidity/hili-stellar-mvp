import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://yzzvnomfjxzlsolzwkfd.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6enZub21manh6bHNvbHp3a2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MTYwMjAsImV4cCI6MjA5NDM5MjAyMH0.bzdkWTHRN-mAn4-pj59U1qmtnSzKKXvGEvP5tLYfbSE';

/** Empty strings in .env.local are treated as unset (common misconfiguration). */
function publicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY', fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

/** Defaults match the previous Vite client; override via NEXT_PUBLIC_* in .env.local */
export const supabaseUrl = publicEnv('NEXT_PUBLIC_SUPABASE_URL', DEFAULT_SUPABASE_URL);
export const supabaseAnonKey = publicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', DEFAULT_SUPABASE_ANON_KEY);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
