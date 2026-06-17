'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Link as LinkIcon } from 'lucide-react';

interface Props {
  open: boolean;
  initialValue: string;
  onSave: (url: string) => void;
  onClose: () => void;
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function isLikelyValid(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export const PortalLinkModal: React.FC<Props> = ({ open, initialValue, onSave, onClose }) => {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setTouched(false);
    }
  }, [open, initialValue]);

  if (!open) return null;

  const normalized = normalizeUrl(value);
  const valid = isLikelyValid(normalized);

  const handleSave = () => {
    setTouched(true);
    if (!valid) return;
    onSave(normalized);
    onClose();
  };

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[400] flex items-end justify-center bg-neutral-900/55 p-0 sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <LinkIcon size={16} className="text-flipdish" />
            Portal Link
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-5">
          <p className="text-sm leading-relaxed text-neutral-600">
            Paste the Flipdish Portal URL for this menu. This is required before you can save and share the
            review session.
          </p>

          <label className="mt-4 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Portal URL
          </label>
          <input
            type="url"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="https://portal.flipdish.com/..."
            className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-flipdish focus:bg-white"
          />
          {touched && !valid ? (
            <p className="mt-2 text-xs text-red-600">Enter a valid URL (must include a domain).</p>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!valid}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save Portal Link
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
