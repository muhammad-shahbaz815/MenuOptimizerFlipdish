import type { NormalizedMenu, RawMenuV3, ReviewProductScopes } from '@/types';
import { isAdminMenuExport, normalizeAdminMenuExport } from './adminExport';
import { isFlipdishPortalMenu, normalizeFlipdishPortalMenu } from './flipdishPortal';
import { normalizeV3Menu } from './index';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function isV3Shape(raw: unknown): boolean {
  const o = asRecord(raw);
  if (!o) return false;
  const cats = o.categories ?? o.Categories;
  return Array.isArray(cats) && cats.length > 0;
}

export type DetectedMenu = {
  menu: NormalizedMenu;
  /** Default scopes when opening from Menu Preview embed (not from upload form). */
  reviewProductScopes: ReviewProductScopes;
};

/**
 * Pick normalizer for JSON payloads from Menu Preview / exports / POS API.
 */
export function detectAndNormalizeJson(raw: unknown): DetectedMenu {
  if (isAdminMenuExport(raw)) {
    return {
      menu: normalizeAdminMenuExport(raw),
      reviewProductScopes: { webApp: true, pos: false },
    };
  }
  if (isFlipdishPortalMenu(raw)) {
    return {
      menu: normalizeFlipdishPortalMenu(raw),
      reviewProductScopes: { webApp: true, pos: false },
    };
  }
  if (isV3Shape(raw)) {
    return {
      menu: normalizeV3Menu(raw as RawMenuV3),
      reviewProductScopes: { webApp: true, pos: true },
    };
  }
  return {
    menu: normalizeV3Menu(raw as RawMenuV3),
    reviewProductScopes: { webApp: true, pos: true },
  };
}
