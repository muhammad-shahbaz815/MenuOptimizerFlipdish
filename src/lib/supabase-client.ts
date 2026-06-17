import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isValidHttpUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

// A simple helper to check if Supabase is properly configured with real keys
export const isSupabaseConfigured =
  isValidHttpUrl(supabaseUrl) &&
  supabaseUrl !== 'https://your-project-id.supabase.co' &&
  supabaseAnonKey.trim() !== '' &&
  supabaseAnonKey !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Real Supabase Client or null
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase environment variables are missing or use placeholders. The application is running in client-only local mock fallback mode.',
  );
}
