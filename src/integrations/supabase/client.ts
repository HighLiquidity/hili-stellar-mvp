import { createClient } from '@supabase/supabase-js';

/** Defaults match the previous Vite client; override via NEXT_PUBLIC_* in .env.local */
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://yzzvnomfjxzlsolzwkfd.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6enZub21manh6bHNvbHp3a2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MTYwMjAsImV4cCI6MjA5NDM5MjAyMH0.bzdkWTHRN-mAn4-pj59U1qmtnSzKKXvGEvP5tLYfbSE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
