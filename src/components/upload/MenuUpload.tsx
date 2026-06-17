'use client';
import React, { useState } from 'react';
import { Upload, AlertCircle, Monitor, Tablet, Laptop } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { resetCommentsForFreshUpload } from '@/hooks/useComments';
import {
  normalizeV3Menu,
  normalizeLegacyMenu,
  isAdminMenuExport,
  normalizeAdminMenuExport,
  isFlipdishPortalMenu,
  normalizeFlipdishPortalMenu,
} from '@/lib/normalizer';
import type { NormalizedMenu, RawMenuV3, ReviewProductScopes } from '@/types';

const emptyScopes: ReviewProductScopes = { webApp: false, pos: false };

function applyAdminExportScopesAndWarnings(
  normalized: NormalizedMenu,
  scopes: ReviewProductScopes,
): ReviewProductScopes {
  const next = { webApp: true, pos: false };
  if (scopes.pos) {
    normalized.metadata.warnings.push(
      'Admin-style exports only support Web & App preview (not POS).',
    );
  }
  if (!scopes.webApp && scopes.pos) {
    normalized.metadata.warnings.push(
      'Web & App preview was turned on automatically so you can review this menu.',
    );
  }
  return next;
}

export const MenuUpload: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scopes, setScopes] = useState<ReviewProductScopes>(emptyScopes);
  const { setMenu, setReviewProductScopes, setActivePriceBandId } = useStore();

  const toggleScope = (key: keyof ReviewProductScopes) => {
    setScopes((s) => ({ ...s, [key]: !s[key] }));
    setError(null);
  };

  const handleFileUpload = async (file: File) => {
    setError(null);
    if (!scopes.webApp && !scopes.pos) {
      setError('Select at least one platform (Web & App and/or POS) before uploading.');
      return;
    }
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      resetCommentsForFreshUpload();
      if (file.name.endsWith('.json')) {
        const raw: unknown = JSON.parse(text);
        if (isAdminMenuExport(raw)) {
          const normalized = normalizeAdminMenuExport(raw);
          const effectiveScopes = applyAdminExportScopesAndWarnings(normalized, scopes);
          setReviewProductScopes(effectiveScopes);
          setMenu(normalized);
        } else if (isFlipdishPortalMenu(raw)) {
          const normalized = normalizeFlipdishPortalMenu(raw);
          setReviewProductScopes({ webApp: true, pos: false });
          if (scopes.pos) {
            normalized.metadata.warnings.push(
              'Classic Flipdish JSON only supports Web & App preview (not POS). POS was turned off for this session.',
            );
          }
          if (!scopes.webApp && scopes.pos) {
            normalized.metadata.warnings.push(
              'Web & App preview was turned on automatically so you can review this menu.',
            );
          }
          setMenu(normalized);
        } else {
          const normalized = normalizeV3Menu(raw as RawMenuV3);
          setReviewProductScopes({ ...scopes });
          setActivePriceBandId(null);
          setMenu(normalized);
        }
      } else if (file.name.endsWith('.txt')) {
        const tryTxtAsJson = (): unknown | null => {
          const t = text.trim();
          if (!t.startsWith('{') && !t.startsWith('[')) return null;
          try {
            return JSON.parse(t) as unknown;
          } catch {
            return null;
          }
        };

        const parsed = tryTxtAsJson();
        let normalized: NormalizedMenu;
        let effectiveScopes = { ...scopes };
        if (parsed !== null) {
          if (isAdminMenuExport(parsed)) {
            normalized = normalizeAdminMenuExport(parsed);
            effectiveScopes = applyAdminExportScopesAndWarnings(normalized, scopes);
          } else if (isFlipdishPortalMenu(parsed)) {
            normalized = normalizeFlipdishPortalMenu(parsed);
            effectiveScopes = { webApp: true, pos: false };
            if (scopes.pos) {
              normalized.metadata.warnings.push(
                'Classic Flipdish JSON only supports Web & App preview (not POS). POS was turned off for this session.',
              );
            }
            if (!scopes.webApp && scopes.pos) {
              normalized.metadata.warnings.push(
                'Web & App preview was turned on automatically so you can review this menu.',
              );
            }
          } else {
            normalized = normalizeV3Menu(parsed as RawMenuV3);
          }
        } else {
          normalized = normalizeLegacyMenu(text);
          effectiveScopes = { webApp: true, pos: false };
          if (scopes.pos) {
            normalized.metadata.warnings.push(
              'Plain-text legacy menus only support Web & App preview (not POS). POS was turned off for this session.',
            );
          }
          if (!scopes.webApp && scopes.pos) {
            normalized.metadata.warnings.push(
              'Web & App preview was turned on automatically so you can review this menu.',
            );
          }
        }

        setReviewProductScopes(effectiveScopes);
        setActivePriceBandId(null);
        setMenu(normalized);
      } else {
        setError('Unsupported file format. Please upload a .json or .txt file.');
      }
    } catch (err) {
      setError('Failed to parse menu file. Please ensure it is valid.');
      console.error(err);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  return (
    <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm sm:p-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          Menu Journey Reviewer
        </h1>
        <p className="mt-2 text-sm text-neutral-500 sm:text-base">
          Upload your menu export to start a guided review.
        </p>
        <div className="mx-auto mt-5 max-w-md rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-left text-xs leading-relaxed text-neutral-700 sm:text-sm">
          <div className="flex gap-2.5">
            <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-flipdish sm:h-5 sm:w-5" aria-hidden />
            <p>
              <span className="font-semibold text-neutral-900">Best on a laptop or desktop.</span> You can compare web
              layout, mobile app layout, and POS in one session. On a phone, the customer preview starts in{' '}
              <span className="font-medium text-neutral-900">mobile layout</span> automatically (you can still open
              every preview).
            </p>
          </div>
        </div>
      </div>

      <fieldset className="mb-6">
        <legend className="mb-3 text-center text-sm font-semibold text-neutral-900">
          This menu applies to
        </legend>
        <p className="mb-4 text-center text-xs text-neutral-500">
          Select all that apply. We only show previews for the platforms you choose (website, mobile apps, POS, or all).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 transition-colors ${
              scopes.webApp
                ? 'border-flipdish bg-flipdish-muted'
                : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 accent-flipdish"
                checked={scopes.webApp}
                onChange={() => toggleScope('webApp')}
              />
              <Monitor size={22} strokeWidth={1.75} className="text-neutral-700" aria-hidden />
              <span className="font-semibold text-neutral-900">Web &amp; App</span>
            </div>
            <span className="pl-7 text-xs text-neutral-600">
              Online ordering on your website and Flipdish mobile apps (one journey).
            </span>
          </label>
          <label
            className={`flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 transition-colors ${
              scopes.pos
                ? 'border-flipdish bg-flipdish-muted'
                : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 accent-flipdish"
                checked={scopes.pos}
                onChange={() => toggleScope('pos')}
              />
              <Tablet size={22} strokeWidth={1.75} className="text-neutral-700" aria-hidden />
              <span className="font-semibold text-neutral-900">POS</span>
            </div>
            <span className="pl-7 text-xs text-neutral-600">In-store ordering on Flipdish Point of Sale.</span>
          </label>
        </div>
      </fieldset>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`
          relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 transition-colors
          ${
            isDragging
              ? 'border-flipdish bg-flipdish-muted'
              : 'border-neutral-300 bg-neutral-50 hover:border-flipdish/40'
          }
        `}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-flipdish-muted text-flipdish">
          <Upload size={28} strokeWidth={1.75} />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-neutral-900">Drop your file here</p>
          <p className="mt-1 text-sm text-neutral-500">or click to browse — JSON or TXT</p>
        </div>
        <input
          type="file"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const input = e.target;
            const file = input.files?.[0];
            if (file) handleFileUpload(file);
            // Reset so re-selecting the same file re-fires onChange
            // (e.g. after a 'select a platform first' error).
            input.value = '';
          }}
          accept=".json,.txt"
        />
      </div>

      {error && (
        <div className="mt-6 flex gap-3 rounded-lg border border-red-100 bg-red-50 p-4 text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );
};
