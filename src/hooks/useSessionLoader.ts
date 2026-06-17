import { useEffect, useState } from 'react';
import { useStore } from './useStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase-client';
import { getSessionIdFromUrl } from './useComments';
import { isExpired } from '@/lib/session/sessionLifetime';

export type SessionLoadState =
  | { kind: 'inactive' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

export function useSessionLoader(): SessionLoadState {
  const setMenu = useStore((s) => s.setMenu);
  const setMenuB = useStore((s) => s.setMenuB);
  const setReviewProductScopes = useStore((s) => s.setReviewProductScopes);
  const setSessionSubmitted = useStore((s) => s.setSessionSubmitted);
  const setPdfFromRemote = useStore((s) => s.setPdfFromRemote);
  const setSessionPortalUrl = useStore((s) => s.setSessionPortalUrl);
  const [state, setState] = useState<SessionLoadState>({ kind: 'inactive' });

  useEffect(() => {
    const sessionId = getSessionIdFromUrl();
    if (!sessionId) {
      setState({ kind: 'inactive' });
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      // If sessionId is present but Supabase is not configured, show an error or try loading from localStorage
      const localSessions = safeRead<any[]>('mjr_local_sessions_v1', []);
      const matched = localSessions.find((s) => s.id === sessionId);
      if (matched) {
        setMenu(matched.menuA);
        setMenuB(matched.menuB);
        setReviewProductScopes(matched.scopes);
        setState({ kind: 'ready' });
      } else {
        setState({
          kind: 'error',
          message: 'Supabase is not configured, and no local session matches this ID.',
        });
      }
      return;
    }

    setState({ kind: 'loading' });
    setSessionSubmitted(false);

    let channel: any = null;
    let active = true;

    const fetchSession = async () => {
      const client = supabase;
      if (!client) return;
      try {
        const { data, error } = await client
          .from('compare_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (!active) return;

        if (error || !data) {
          console.error('Error fetching session from Supabase:', error);
          setState({
            kind: 'error',
            message: 'Comparison session not found or could not be loaded.',
          });
          return;
        }

        // Sessions have a 30-day TTL — if this one is past its expiry, treat
        // it as gone and (best-effort) delete it inline so the row isn't
        // taking up space until the scheduled cleanup catches it.
        if (isExpired(data.expires_at)) {
          if (client) {
            void client.from('compare_sessions').delete().eq('id', sessionId);
          }
          setState({
            kind: 'error',
            message: 'This review session has expired and is no longer available.',
          });
          return;
        }

        setMenu(data.menu_a);
        setMenuB(data.menu_b || null);
        setReviewProductScopes(data.scopes);
        setSessionSubmitted(data.submitted || false);
        setSessionPortalUrl(data.portal_url ?? null);

        if (data.pdf_url && data.pdf_name && client) {
          const { data: signed } = await client.storage
            .from('pdf-uploads')
            .createSignedUrl(data.pdf_url, 3600);
          if (signed?.signedUrl) {
            setPdfFromRemote(signed.signedUrl, data.pdf_name);
          }
        }

        setState({ kind: 'ready' });
      } catch (err) {
        if (!active) return;
        console.error('Unexpected error loading session:', err);
        setState({
          kind: 'error',
          message: 'An unexpected error occurred while loading the session.',
        });
      }
    };

    fetchSession();

    // 2. Real-time Subscription to compare_sessions
    if (isSupabaseConfigured && supabase) {
      channel = supabase
        .channel(`compare_sessions:${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'compare_sessions',
            filter: `id=eq.${sessionId}`,
          },
          async (payload) => {
            if (!active) return;
            const newRow = payload.new;
            if (newRow) {
              setMenu(newRow.menu_a);
              setMenuB(newRow.menu_b || null);
              setReviewProductScopes(newRow.scopes);
              setSessionSubmitted(newRow.submitted || false);
              setSessionPortalUrl(newRow.portal_url || null);
              if (newRow.pdf_url && newRow.pdf_name && supabase) {
                const { data: signed } = await supabase.storage
                  .from('pdf-uploads')
                  .createSignedUrl(newRow.pdf_url, 3600);
                if (signed?.signedUrl) {
                  setPdfFromRemote(signed.signedUrl, newRow.pdf_name);
                }
              }
            }
          }
        )
        .subscribe();
    }

    return () => {
      active = false;
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [setMenu, setMenuB, setReviewProductScopes, setSessionSubmitted, setPdfFromRemote, setSessionPortalUrl]);

  return state;
}

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
