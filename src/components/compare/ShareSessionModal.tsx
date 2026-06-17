'use client';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Download, X, ExternalLink, Clock } from 'lucide-react';
import type { NormalizedMenu, ReviewProductScopes } from '@/types';
import { useAllComments } from '@/hooks/useComments';
import { SESSION_TTL_DAYS } from '@/lib/session/sessionLifetime';

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  menuA: NormalizedMenu | null;
  menuB: NormalizedMenu | null;
  scopes: ReviewProductScopes | null;
}

export const ShareSessionModal: React.FC<Props> = ({
  open,
  onClose,
  sessionId,
  menuA,
  menuB,
  scopes,
}) => {
  const allComments = useAllComments();
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const shareUrl = `${window.location.origin}${window.location.pathname}?sessionId=${sessionId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportBundle = () => {
    const payload = {
      type: 'mjr_compare_session_v1',
      id: sessionId,
      menuA,
      menuB,
      scopes,
      comments: allComments,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nameA = menuA?.name.replace(/[^a-z0-9-_ ]/gi, '_') || 'menu_a';
    const nameB = menuB?.name.replace(/[^a-z0-9-_ ]/gi, '_') || 'menu_b';
    a.download = `CompareSession-${nameA}-vs-${nameB}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[300] flex items-end justify-center bg-neutral-900/55 p-0 sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="text-base font-semibold text-neutral-900">Share Review Session</h2>
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
            This comparison is saved in the cloud. Send the link below to your client or team members.
            They can review both menus side-by-side and leave comments in real-time.
          </p>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            <Clock size={12} className="shrink-0" />
            <span>
              This link expires in <span className="font-semibold">{SESSION_TTL_DAYS} days</span> — after that the session and its comments are automatically deleted.
            </span>
          </div>

          <label className="mt-4 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Shareable link
          </label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="min-w-0 flex-1 bg-transparent px-2 py-1 text-xs text-neutral-800 outline-none"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                copied ? 'bg-emerald-500 text-white' : 'bg-neutral-900 text-white hover:bg-neutral-800'
              }`}
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <ExternalLink size={14} />
              Open Preview in New Tab
            </a>
            <button
              type="button"
              onClick={handleExportBundle}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              <Download size={14} />
              Export Session Bundle (.json)
            </button>
          </div>
        </div>

        <footer className="border-t border-neutral-100 bg-neutral-50 px-5 py-3 text-center">
          <p className="text-[10px] leading-relaxed text-neutral-400">
            Powered by Flipdish Menu Journey Reviewer cloud-syncing.
          </p>
        </footer>
      </div>
    </div>,
    document.body,
  );
};
