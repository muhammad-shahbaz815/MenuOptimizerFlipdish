'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Download, RotateCcw, Trash2, Upload, X, Lock } from 'lucide-react';
import {
  deleteComment,
  exportCommentsAsJson,
  importCommentsFromJson,
  resolveComment,
  unresolveComment,
  useMenuComments,
  useReviewerName,
  type MenuComment,
  getSessionIdFromUrl,
} from '@/hooks/useComments';
import { useStore } from '@/hooks/useStore';

interface Props {
  open: boolean;
  onClose: () => void;
  /** In compare mode both menu ids are passed so the overview aggregates feedback from both sides. */
  menuId: string | string[];
  menuName: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const sameDay = new Date().toDateString() === d.toDateString();
  if (sameDay) {
    return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Filter = 'open' | 'resolved' | 'all';

export const CommentsOverview: React.FC<Props> = ({ open, onClose, menuId, menuName }) => {
  const all = useMenuComments(menuId);
  const [reviewerName, setReviewerName] = useReviewerName();
  const [filter, setFilter] = useState<Filter>('open');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Locked session state
  const { sessionSubmitted } = useStore();
  const isReviewSession = getSessionIdFromUrl() !== null;
  const isAdmin = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('admin') === 'true' || !isReviewSession);
  const isLocked = sessionSubmitted && !isAdmin;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const grouped = useMemo(() => {
    const filtered = all.filter((c) => {
      if (filter === 'open') return !c.resolved;
      if (filter === 'resolved') return c.resolved;
      return true;
    });
    // Group by (menuId, itemId) so the same item.id appearing in both compare
    // slots (or in different menus) does not collapse comments from separate
    // sources into one group.
    const map = new Map<
      string,
      { menuId: string; itemId: string; itemName: string; categoryName?: string; comments: MenuComment[] }
    >();
    for (const c of filtered) {
      const key = `${c.menuId}::${c.itemId}`;
      const entry = map.get(key);
      if (entry) {
        entry.comments.push(c);
      } else {
        map.set(key, {
          menuId: c.menuId,
          itemId: c.itemId,
          itemName: c.itemName,
          categoryName: c.categoryName,
          comments: [c],
        });
      }
    }
    for (const v of map.values()) {
      v.comments.sort((a, b) => b.createdAt - a.createdAt);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].itemName.localeCompare(b[1].itemName),
    );
  }, [all, filter]);

  const counts = useMemo(
    () => ({
      open: all.filter((c) => !c.resolved).length,
      resolved: all.filter((c) => c.resolved).length,
      all: all.length,
    }),
    [all],
  );

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const n = importCommentsFromJson(text);
      setImportMessage(n > 0 ? `Imported ${n} comment${n === 1 ? '' : 's'}.` : 'No comments found in that file.');
      setTimeout(() => setImportMessage(null), 4000);
    };
    reader.readAsText(file);
  };

  const setHighlightedItem = useStore((s) => s.setHighlightedItem);

  if (!open) return null;

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
        aria-labelledby="comments-overview-title"
        className="flex w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: 'min(92vh, 92svh)' }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Review summary
            </p>
            <h2 id="comments-overview-title" className="mt-0.5 text-base font-semibold text-neutral-900">
              All comments
            </h2>
            <p className="truncate text-xs text-neutral-500" title={menuName}>
              {menuName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-5 py-3">
          <div className="flex rounded-full border border-neutral-200 bg-white p-0.5 text-[11px] font-semibold">
            <FilterBtn active={filter === 'open'} onClick={() => setFilter('open')}>
              Open ({counts.open})
            </FilterBtn>
            <FilterBtn active={filter === 'resolved'} onClick={() => setFilter('resolved')}>
              Resolved ({counts.resolved})
            </FilterBtn>
            <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>
              All ({counts.all})
            </FilterBtn>
          </div>
          
          {!isLocked && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportCommentsAsJson(menuId, menuName)}
                disabled={counts.all === 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download size={12} strokeWidth={2} />
                Export
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                <Upload size={12} strokeWidth={2} />
                Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>

        {importMessage ? (
          <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800">
            {importMessage}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {grouped.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-500">
              {filter === 'open'
                ? 'No open comments. Nice.'
                : filter === 'resolved'
                  ? 'No resolved comments yet.'
                  : 'No comments yet. Open an item and add the first one.'}
            </div>
          ) : (
            <ul className="space-y-5">
              {grouped.map(([key, entry]) => (
                <li key={key}>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setHighlightedItem({
                          menuId: entry.menuId,
                          itemId: entry.itemId,
                          itemName: entry.itemName.split(' > ')[0],
                        });
                        onClose();
                      }}
                      className="group inline-flex items-center gap-1.5 text-left hover:text-flipdish transition-colors min-w-0 flex-1"
                      title="Click to locate item in menu preview"
                    >
                      <span className="truncate text-sm font-semibold text-neutral-900 group-hover:text-flipdish group-hover:underline">
                        {entry.itemName.split(' > ')[0]}
                      </span>
                      <span className="opacity-0 group-hover:opacity-100 text-[10px] text-flipdish font-semibold shrink-0 transition-opacity">
                        Inspect →
                      </span>
                    </button>
                    {entry.categoryName ? (
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-neutral-400">
                        {entry.categoryName}
                      </span>
                    ) : null}
                  </div>
                  <ul className="space-y-2">
                    {entry.comments.map((c) => (
                      <li
                        key={c.id}
                        className={`rounded-xl border px-4 py-3 ${
                          c.resolved
                            ? 'border-emerald-100 bg-emerald-50/40'
                            : 'border-amber-200 bg-amber-50/60'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div>
                            <p
                              className={`text-sm font-semibold ${
                                c.resolved
                                  ? 'text-neutral-700 line-through decoration-neutral-300'
                                  : 'text-neutral-900'
                              }`}
                            >
                              {c.author}
                            </p>
                            {c.itemName.includes(' > ') && (
                              <div className="mt-1">
                                <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-semibold text-neutral-600 ring-1 ring-neutral-200">
                                  {c.itemName.split(' > ')[1]}
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-500">{formatTime(c.createdAt)}</p>
                        </div>
                        <p
                          className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed ${
                            c.resolved ? 'text-neutral-600' : 'text-neutral-800'
                          }`}
                        >
                          {c.text}
                        </p>
                        
                        {/* Render Attachment Image */}
                        {c.attachmentUrl && (
                          <div className="mt-2.5">
                            <a
                              href={c.attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group relative inline-block overflow-hidden rounded-lg border border-neutral-200 bg-white p-1 hover:border-flipdish transition-all"
                            >
                              <img
                                src={c.attachmentUrl}
                                alt="Comment attachment"
                                className="h-16 max-w-[12rem] rounded-md object-cover group-hover:brightness-95 transition-all"
                              />
                            </a>
                          </div>
                        )}

                        {c.resolved ? (
                          <p className="mt-1 text-[11px] text-emerald-700">
                            Resolved {c.resolvedBy ? `by ${c.resolvedBy}` : ''}
                            {c.resolvedAt ? ` · ${formatTime(c.resolvedAt)}` : ''}
                          </p>
                        ) : null}
                        
                        <div className="mt-2.5 flex items-center justify-between border-t border-neutral-100/50 pt-2 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setHighlightedItem({
                                menuId: c.menuId,
                                itemId: c.itemId,
                                itemName: c.itemName,
                              });
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-flipdish hover:underline"
                          >
                            Locate target →
                          </button>

                          {!isLocked && (
                            <div className="flex items-center gap-2">
                              {c.resolved ? (
                                <button
                                  type="button"
                                  onClick={() => unresolveComment(c.id)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                                >
                                  <RotateCcw size={12} strokeWidth={2} />
                                  Reopen
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => resolveComment(c.id, reviewerName)}
                                  disabled={!reviewerName.trim()}
                                  title={!reviewerName.trim() ? 'Enter your name below first' : 'Mark resolved'}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Check size={12} strokeWidth={2.5} />
                                  Resolve
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm('Delete this comment?')) deleteComment(c.id);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-red-700"
                              >
                                <Trash2 size={12} strokeWidth={2} />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isLocked ? (
          <footer className="shrink-0 border-t border-neutral-200 bg-neutral-900 px-5 py-4 text-center text-white flex items-center justify-center gap-2 text-xs font-semibold">
            <Lock size={14} className="text-amber-500 animate-pulse-subtle" />
            <span>This review session is locked. Feedback has been submitted.</span>
          </footer>
        ) : (
          <footer className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Your name (used when resolving)
            </label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="e.g. Maya (Menu team)"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-flipdish focus:ring-2 focus:ring-flipdish/20"
            />
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
};

const FilterBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-3 py-1 transition-colors ${
      active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
    }`}
  >
    {children}
  </button>
);
