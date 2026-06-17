import { supabase, isSupabaseConfigured } from '@/lib/supabase-client';

// Appends a row to session_events whenever a preview link is generated.
// This table is never cleaned up so the all-time count survives session deletion.
// Non-fatal: failure is logged but never surfaces to the user.
export async function trackSessionCreated(sessionId: string, type: 'compare' | 'customer') {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('session_events').insert({ session_id: sessionId, type });
  } catch (err) {
    console.warn('[trackSessionCreated] failed (non-fatal):', err);
  }
}
