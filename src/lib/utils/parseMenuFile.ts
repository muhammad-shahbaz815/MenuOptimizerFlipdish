import {
  isAdminMenuExport,
  isFlipdishPortalMenu,
  normalizeAdminMenuExport,
  normalizeFlipdishPortalMenu,
  normalizeLegacyMenu,
  normalizeV3Menu,
} from '@/lib/normalizer';
import type { NormalizedMenu, RawMenuV3 } from '@/types';

export type ParseResult =
  | { kind: 'ok'; menu: NormalizedMenu; rawV3?: RawMenuV3 }
  | { kind: 'error'; message: string };

/**
 * Parse a JSON or TXT menu file using the same detection used by MenuUpload.
 * Returns a normalized menu or an error message — does not touch global state.
 */
export async function parseMenuFile(file: File): Promise<ParseResult> {
  try {
    const text = (await file.text()).replace(/^﻿/, '');

    if (file.name.endsWith('.json')) {
      const raw: unknown = JSON.parse(text);
      if (isAdminMenuExport(raw)) {
        return { kind: 'ok', menu: normalizeAdminMenuExport(raw) };
      }
      if (isFlipdishPortalMenu(raw)) {
        return { kind: 'ok', menu: normalizeFlipdishPortalMenu(raw) };
      }
      return { kind: 'ok', menu: normalizeV3Menu(raw as RawMenuV3), rawV3: raw as RawMenuV3 };
    }

    if (file.name.endsWith('.txt')) {
      const trimmed = text.trim();
      const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
      if (looksJson) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (isAdminMenuExport(parsed)) {
            return { kind: 'ok', menu: normalizeAdminMenuExport(parsed) };
          }
          if (isFlipdishPortalMenu(parsed)) {
            return { kind: 'ok', menu: normalizeFlipdishPortalMenu(parsed) };
          }
          return { kind: 'ok', menu: normalizeV3Menu(parsed as RawMenuV3), rawV3: parsed as RawMenuV3 };
        } catch {
          // fall through to legacy text parser
        }
      }
      return { kind: 'ok', menu: normalizeLegacyMenu(text) };
    }

    return { kind: 'error', message: 'Unsupported file format. Please upload a .json or .txt file.' };
  } catch {
    return { kind: 'error', message: 'Failed to parse menu file. Please ensure it is valid.' };
  }
}
