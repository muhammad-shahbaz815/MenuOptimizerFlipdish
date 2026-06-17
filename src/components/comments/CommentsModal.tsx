'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, RotateCcw, Trash2, X, Lock, Paperclip, Loader2 } from 'lucide-react';
import {
  addComment,
  deleteComment,
  resolveComment,
  unresolveComment,
  useItemComments,
  useReviewerName,
  uploadCommentAttachment,
  getSessionIdFromUrl,
} from '@/hooks/useComments';
import { useStore } from '@/hooks/useStore';

interface Props {
  open: boolean;
  onClose: () => void;
  menuId: string;
  itemId: string;
  itemName: string;
  categoryName?: string;
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

export const CommentsModal: React.FC<Props> = ({
  open,
  onClose,
  menuId,
  itemId,
  itemName,
  categoryName,
}) => {
  const comments = useItemComments(menuId, itemId);
  const [reviewerName, setReviewerName] = useReviewerName();
  const [draft, setDraft] = useState('');
  const [showAllResolved, setShowAllResolved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Attachment states
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    } else {
      setDraft('');
      setAttachmentUrl(null);
      setUploading(false);
    }
  }, [open]);

  if (!open) return null;

  const open_ = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);
  const visibleResolved = showAllResolved ? resolved : [];

  const canSubmit = draft.trim().length > 0 && reviewerName.trim().length > 0 && !uploading;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadCommentAttachment(file);
      setAttachmentUrl(url);
    } catch (err: any) {
      console.error('Failed to upload attachment:', err);
      alert(`Failed to upload image attachment: ${err?.message ?? err}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    addComment({
      menuId,
      itemId,
      itemName,
      categoryName,
      author: reviewerName,
      text: draft,
      attachmentUrl: attachmentUrl || undefined,
    });
    setDraft('');
    setAttachmentUrl(null);
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
        aria-labelledby="comments-modal-title"
        className="flex w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: 'min(92vh, 92svh)' }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Review comments
            </p>
            <h2
              id="comments-modal-title"
              className="mt-0.5 truncate text-base font-semibold text-neutral-900"
              title={itemName}
            >
              {itemName}
            </h2>
            {categoryName ? (
              <p className="truncate text-xs text-neutral-500" title={categoryName}>
                in {categoryName}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Close comments"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {comments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
              No comments yet. Add the first one below.
            </div>
          ) : (
            <ul className="space-y-3">
              {open_.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-neutral-900">{c.author}</p>
                    <p className="text-[11px] text-neutral-500">{formatTime(c.createdAt)}</p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
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
                          className="h-20 max-w-[12rem] rounded-md object-cover group-hover:brightness-95 transition-all"
                        />
                      </a>
                    </div>
                  )}

                  {!isLocked && (
                    <div className="mt-2 flex items-center gap-2">
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
                </li>
              ))}

              {resolved.length > 0 ? (
                <li>
                  <button
                    type="button"
                    onClick={() => setShowAllResolved((v) => !v)}
                    className="text-xs font-semibold text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
                  >
                    {showAllResolved
                      ? `Hide resolved (${resolved.length})`
                      : `Show resolved (${resolved.length})`}
                  </button>
                </li>
              ) : null}

              {visibleResolved.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 opacity-90"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-neutral-700 line-through decoration-neutral-300">
                      {c.author}
                    </p>
                    <p className="text-[11px] text-neutral-500">{formatTime(c.createdAt)}</p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">
                    {c.text}
                  </p>

                  {/* Render Attachment Image */}
                  {c.attachmentUrl && (
                    <div className="mt-2.5">
                      <a
                        href={c.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative inline-block overflow-hidden rounded-lg border border-neutral-100 bg-white p-1 hover:border-flipdish transition-all opacity-80 hover:opacity-100"
                      >
                        <img
                          src={c.attachmentUrl}
                          alt="Comment attachment"
                          className="h-20 max-w-[12rem] rounded-md object-cover group-hover:brightness-95 transition-all"
                        />
                      </a>
                    </div>
                  )}

                  <p className="mt-1 text-[11px] text-emerald-700">
                    Resolved {c.resolvedBy ? `by ${c.resolvedBy}` : ''}
                    {c.resolvedAt ? ` · ${formatTime(c.resolvedAt)}` : ''}
                  </p>
                  {!isLocked && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => unresolveComment(c.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                      >
                        <RotateCcw size={12} strokeWidth={2} />
                        Reopen
                      </button>
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
                </li>
              ))}
            </ul>
          )}
        </div>

        {isLocked ? (
          <footer className="shrink-0 border-t border-neutral-200 bg-neutral-900 px-5 py-6 text-center text-white">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white mb-2 animate-pulse-subtle">
              <Lock size={18} className="stroke-[2.5]" />
            </div>
            <h4 className="text-xs font-semibold">Review Session Locked</h4>
            <p className="mt-1 text-[11px] text-neutral-400 max-w-sm mx-auto leading-relaxed">
              This review session has been submitted to the menu team and is currently locked.
            </p>
          </footer>
        ) : (
          <footer className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-5 py-4">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Your name
            </label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="e.g. Aisha (QA)"
              className="mb-3 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-flipdish focus:ring-2 focus:ring-flipdish/20"
            />

            {/* Attachment preview / upload loader */}
            {uploading && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2.5 text-xs text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin text-flipdish" />
                <span>Uploading image attachment...</span>
              </div>
            )}
            
            {attachmentUrl && !uploading && (
              <div className="mb-3 relative inline-block rounded-lg border border-neutral-200 bg-white p-1 shadow-sm">
                <img
                  src={attachmentUrl}
                  alt="Attachment preview"
                  className="h-16 w-24 rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() => setAttachmentUrl(null)}
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600 transition-colors"
                  title="Remove image"
                >
                  <X size={10} className="stroke-[3]" />
                </button>
              </div>
            )}

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment about this item…"
                rows={3}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                className="w-full resize-none rounded-lg border border-neutral-200 bg-white pl-3 pr-10 py-2 text-sm outline-none focus:border-flipdish focus:ring-2 focus:ring-flipdish/20"
              />
              
              {/* Attachment selector */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute right-2.5 bottom-3.5 flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-all"
                title="Attach png/jpg image"
              >
                <Paperclip size={15} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-neutral-500">
                {reviewerName.trim()
                  ? 'Stored in this browser only.'
                  : 'Enter your name to post.'}
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Post comment
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
};
