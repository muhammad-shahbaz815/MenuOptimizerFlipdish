'use client';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Mail, Check, X, Loader2 } from 'lucide-react';
import { useAllComments, getSessionIdFromUrl } from '@/hooks/useComments';
import { useStore } from '@/hooks/useStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase-client';
import emailjs from '@emailjs/browser';

interface Props {
  open: boolean;
  onClose: () => void;
  menuName: string;
  /**
   * Restrict the comments shown in the summary to those belonging to the
   * current menu(s). Without this, stale comments left in the in-memory
   * store from a previous session would appear in the submit popup even
   * though they no longer match any item on the current menu.
   */
  menuId?: string | string[] | null;
}

export const SubmitCommentsModal: React.FC<Props> = ({ open, onClose, menuName, menuId }) => {
  const allComments = useAllComments();
  const ids = menuId == null ? null : Array.isArray(menuId) ? menuId : [menuId];
  const scoped = ids
    ? allComments.filter((c) =>
        ids.some((id) => c.menuId === id || c.menuId === `A:${id}` || c.menuId === `B:${id}`),
      )
    : allComments;
  const unresolved = scoped.filter((c) => !c.resolved);
  
  const [clientName, setClientName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSessionSubmitted = useStore((s) => s.setSessionSubmitted);

  if (!open) return null;

  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || '';
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '';
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '';
  const onboardingEmail = import.meta.env.VITE_ONBOARDING_EMAIL || 'onboarding@flipdish.com';

  const isEmailJSConfigured =
    serviceId !== '' &&
    serviceId !== 'service_xxxxxx' &&
    templateId !== '' &&
    templateId !== 'template_xxxxxx' &&
    publicKey !== '' &&
    publicKey !== 'user_xxxxxx';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unresolved.length === 0 || !clientName.trim()) return;

    setSubmitting(true);
    setError(null);

    const sessionId = getSessionIdFromUrl();
    const sessionUrl = sessionId
      ? `${window.location.origin}${window.location.pathname}?sessionId=${sessionId}`
      : window.location.href;

    // Compile a beautiful text-based itemized list of comments
    const formattedComments = unresolved
      .map((c, i) => `${i + 1}. [${c.categoryName || 'General'}] ${c.itemName} :\n   "${c.text}" (by ${c.author})`)
      .join('\n\n');

    // Filter unresolved comments that contain an attachmentUrl and compile into list of links
    const commentsWithImages = unresolved.filter((c) => c.attachmentUrl);
    const imagesLinks = commentsWithImages.length > 0
      ? commentsWithImages.map((c, i) => `${i + 1}. ${c.itemName} (${c.categoryName || 'General'}): ${c.attachmentUrl}`).join('\n')
      : 'No image attachments uploaded.';

    const templateParams = {
      to_email: onboardingEmail,
      client_name: clientName.trim(),
      menu_name: menuName,
      comments_count: unresolved.length,
      session_link: sessionUrl,
      comments_list: formattedComments,
      images_links: imagesLinks,
    };

    // Flip the session's `submitted` flag in Supabase so the lock persists
    // across reloads / other browsers. Supabase-js returns errors as a
    // result object rather than throwing, so we have to inspect `error`
    // explicitly — otherwise a missing column or RLS denial silently no-ops
    // and the lock never engages.
    const markSubmittedInSupabase = async (): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase || !sessionId) return true;
      const { error: updateError } = await supabase
        .from('compare_sessions')
        .update({ submitted: true })
        .eq('id', sessionId);
      if (updateError) {
        console.error('Failed to lock session in Supabase:', updateError);
        setError(
          `Could not lock the session in the cloud: ${updateError.message ?? 'unknown error'}. The email was sent, but reopening this link will not show it as locked.`,
        );
        return false;
      }
      return true;
    };

    if (isEmailJSConfigured) {
      try {
        await emailjs.send(serviceId, templateId, templateParams, publicKey);

        const locked = await markSubmittedInSupabase();
        // Always reflect in the local store so the current tab feels locked
        // even if the cloud update failed (the error banner is visible).
        setSessionSubmitted(true);
        if (locked) setSuccess(true);
      } catch (err: any) {
        console.error('EmailJS dispatch failed:', err);
        setError('Failed to send automated email. Our servers might be busy. Please try exporting your comments.');
      } finally {
        setSubmitting(false);
      }
    } else {
      // Graceful fallback/simulation in dev environment
      console.log('--- EmailJS Simulation ---');
      console.log('Sending email to:', onboardingEmail);
      console.log('Template Params:', templateParams);
      console.log('--------------------------');

      // Simulate network request
      setTimeout(async () => {
        const locked = await markSubmittedInSupabase();
        setSessionSubmitted(true);
        setSubmitting(false);
        if (locked) setSuccess(true);
      }, 1500);
    }
  };

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting && !success) onClose();
      }}
      className="fixed inset-0 z-[300] flex items-end justify-center bg-neutral-900/55 p-0 sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="text-base font-semibold text-neutral-900">Submit Menu Feedback</h2>
          {!submitting && !success && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          )}
        </header>

        {success ? (
          <div className="p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check size={28} strokeWidth={2.5} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-neutral-900">Feedback Submitted!</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Thank you! Your comments have been saved, and an automated HTML feedback report has been sent
              directly to our onboarding team. We will review your requests and adjust your menus shortly.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                setSuccess(false);
                setClientName('');
              }}
              className="mt-6 w-full rounded-xl bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5">
            <p className="text-sm text-neutral-600">
              You have left <span className="font-semibold text-neutral-900">{unresolved.length}</span> comments
              on the menu cards. Submitting will send an automated report directly to our onboarding team.
            </p>

            {unresolved.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-xs text-neutral-500">
                Please leave at least one comment on the menu items before submitting feedback.
              </div>
            ) : (
              <>
                <div className="mt-4 max-h-36 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <ul className="space-y-2">
                    {unresolved.map((c) => (
                      <li key={c.id} className="text-xs text-neutral-700">
                        <span className="font-semibold text-neutral-900">
                          {c.itemName} ({c.categoryName || 'General'})
                        </span>
                        : <span className="italic">"{c.text}"</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    Your Name / Restaurant Name
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Aisha - Bella Italia"
                    className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-flipdish focus:ring-2 focus:ring-flipdish/20"
                  />
                </div>

                {!isEmailJSConfigured && (
                  <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                    <span className="font-semibold">Developer Notice:</span> EmailJS keys are missing from `.env`. Clicking submit will simulate successful delivery and print payload parameters to console.
                  </div>
                )}

                {error && (
                  <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {error}
                  </div>
                )}

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="flex-1 rounded-xl border border-neutral-200 bg-white py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !clientName.trim()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Mail size={14} />
                        Submit & Notify Team
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};
