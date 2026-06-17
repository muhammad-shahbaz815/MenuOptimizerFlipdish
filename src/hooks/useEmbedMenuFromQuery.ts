import { useEffect, useState } from 'react';
import { useStore } from './useStore';
import { detectAndNormalizeJson } from '@/lib/normalizer/detectAndNormalize';

export type EmbedLoadState =
  | { kind: 'inactive' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

/**
 * When opened from Menu Preview (`?embed=1&metadata_file=MenuDataJson/....json`),
 * load menu JSON via `menu_journey_json.php` and hydrate the store.
 */
function initialEmbedState(): EmbedLoadState {
  if (typeof window === 'undefined') return { kind: 'inactive' };
  const sp = new URLSearchParams(window.location.search);
  if (sp.get('embed') !== '1') return { kind: 'inactive' };
  const metadataId = sp.get('metadata_id');
  if (!metadataId || !/^[a-zA-Z0-9_.-]+$/.test(metadataId)) {
    return { kind: 'error', message: 'Missing or invalid metadata_id parameter.' };
  }
  return { kind: 'loading' };
}

export function useEmbedMenuFromQuery(): EmbedLoadState {
  const setMenu = useStore((s) => s.setMenu);
  const setReviewProductScopes = useStore((s) => s.setReviewProductScopes);
  const [state, setState] = useState<EmbedLoadState>(initialEmbedState);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('embed') !== '1') {
      setState({ kind: 'inactive' });
      return;
    }

    const metadataId = sp.get('metadata_id');
    if (!metadataId || !/^[a-zA-Z0-9_.-]+$/.test(metadataId)) {
      setState({ kind: 'error', message: 'Missing or invalid metadata_id parameter.' });
      return;
    }

    const url = new URL('../menu_journey_json.php', window.location.href);
    url.searchParams.set('metadata_id', metadataId);

    fetch(url.toString())
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json() as Promise<unknown>;
      })
      .then((raw) => {
        const { menu, reviewProductScopes } = detectAndNormalizeJson(raw);

        const hasScopeOverride = sp.has('scope_web') || sp.has('scope_pos');
        const scopeWeb = sp.get('scope_web');
        const scopePos = sp.get('scope_pos');
        let nextScopes = hasScopeOverride
          ? {
              webApp: scopeWeb == null ? true : scopeWeb === '1' || scopeWeb.toLowerCase() === 'true',
              pos: scopePos == null ? true : scopePos === '1' || scopePos.toLowerCase() === 'true',
            }
          : reviewProductScopes;

        // Guard against empty selection (fallback to both)
        if (!nextScopes.webApp && !nextScopes.pos) {
          nextScopes = { webApp: true, pos: true };
        }

        setReviewProductScopes(nextScopes);
        setMenu(menu);
        setState({ kind: 'ready' });
      })
      .catch(() => {
        setState({ kind: 'error', message: 'Could not load menu data. Please refresh or open from Menu Preview.' });
      });
  }, [setMenu, setReviewProductScopes]);

  return state;
}
