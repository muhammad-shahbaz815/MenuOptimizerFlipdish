'use client';
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, X, Share2, Mail, History, UploadCloud, Trash2, Clock, Lock, ListChecks, FileText, FileUp, Link as LinkIcon } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import type { NormalizedMenu, SalesChannel } from '@/types';
import { MenuExplorer, type DiffMeta } from './MenuExplorer';
import { SlotUpload } from './SlotUpload';
import { PriceBandSelector } from '../shared/PriceBandSelector';
import { ShareSessionModal } from './ShareSessionModal';
import { ChangeSummaryModal } from './ChangeSummaryModal';
import { SubmitCommentsModal } from '../comments/SubmitCommentsModal';
import { useAllComments, getSessionIdFromUrl, importCommentsFromJson, resetCommentsForFreshUpload } from '@/hooks/useComments';
import { supabase, isSupabaseConfigured } from '@/lib/supabase-client';
import { computeSessionExpiry } from '@/lib/session/sessionLifetime';
import { trackSessionCreated } from '@/lib/session/trackSessionCreated';

const CHANNELS: SalesChannel[] = ['Collection', 'Delivery', 'DineIn', 'Takeaway'];

function buildDiffMeta(other: NormalizedMenu, channel: SalesChannel): DiffMeta {
  const itemNames = new Set<string>();
  const itemPrices = new Map<string, number>();
  for (const cat of other.categories) {
    for (const item of cat.items) {
      const key = item.name.toLowerCase();
      itemNames.add(key);
      itemPrices.set(key, item.prices[channel] ?? 0);
    }
  }
  const categoryNames = new Set<string>(other.categories.map((c) => c.name.toLowerCase()));
  return {
    otherItemNames: itemNames,
    otherItemPrices: itemPrices,
    otherCategoryNames: categoryNames,
  };
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

function safeWrite(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore it for now
  }
}

export const ComparePreview: React.FC = () => {
  const { menu, menuB, setMenu, setMenuB, setActivePriceBandId, setReviewProductScopes, sessionSubmitted, setSessionSubmitted, uploadedPdf, pdfBlobUrl, pdfName, setUploadedPdf, sessionPortalUrl, setSessionPortalUrl } = useStore();

  const [channel, setChannel] = useState<SalesChannel>('Collection');
  const [diffOn, setDiffOn] = useState(true);

  // Modals & Share State
  const [savingSession, setSavingSession] = useState(false);
  const [shareSessionId, setShareSessionId] = useState<string | null>(getSessionIdFromUrl());
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [portalFlashing, setPortalFlashing] = useState(false);

  const flashPortalInput = () => {
    setPortalFlashing(true);
    window.setTimeout(() => setPortalFlashing(false), 5000);
  };

  const comments = useAllComments();
  const unresolvedComments = comments.filter((c) => !c.resolved);
  
  const localSessions = safeRead<any[]>('mjr_local_sessions_v1', []);

  // Client Review Mode Detection
  const isReviewSession = getSessionIdFromUrl() !== null;
  const isAdmin = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('admin') === 'true' || !isReviewSession);
  const isClientReview = isReviewSession && !isAdmin;

  // Only the NEW side (slot B) gets diff badges — the OLD side is the baseline
  // and stays clean. The diff is computed against the OLD menu (slot A).
  const diffForB = useMemo<DiffMeta | undefined>(
    () => (diffOn && menu ? buildDiffMeta(menu, channel) : undefined),
    [diffOn, menu, channel],
  );

  const swap = () => {
    if (!menu && !menuB) return;
    const a = menu;
    const b = menuB;
    setMenu(b);
    setMenuB(a);
  };

  const handleUnlockReview = async () => {
    const sessionId = getSessionIdFromUrl();
    if (!sessionId) return;
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('compare_sessions')
          .update({ submitted: false })
          .eq('id', sessionId);
        if (error) throw error;
        setSessionSubmitted(false);
      } catch (err) {
        console.error('Error unlocking session:', err);
        alert('Failed to unlock session. Please try again.');
      }
    } else {
      setSessionSubmitted(false);
    }
  };

  const handleSaveAndShare = async (openShareModal: boolean = true) => {
    if (!menu) return;
    if (openShareModal && !sessionPortalUrl) {
      flashPortalInput();
      return;
    }
    setSavingSession(true);

    const payload = {
      menu_a: menu,
      menu_b: menuB,
      scopes: { webApp: true, pos: false },
      expires_at: computeSessionExpiry(),
      portal_url: sessionPortalUrl || null,
    };

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('compare_sessions')
          .insert(payload)
          .select('id')
          .single();

        if (error || !data) throw error || new Error('No data returned');

        const newId = data.id;
        setShareSessionId(newId);
        void trackSessionCreated(newId, 'compare');

        // If a PDF was already uploaded locally before the session existed,
        // persist it to Storage now that we have a session ID.
        if (uploadedPdf) {
          try {
            const storagePath = `${newId}/${uploadedPdf.name}`;
            const { error: uploadError } = await supabase
              .storage
              .from('pdf-uploads')
              .upload(storagePath, uploadedPdf, { upsert: true });
            if (!uploadError) {
              await supabase
                .from('compare_sessions')
                .update({ pdf_url: storagePath, pdf_name: uploadedPdf.name })
                .eq('id', newId);
            }
          } catch {
            // Non-fatal — PDF still works locally for this session.
          }
        }

        // Save current comments associated with this new sessionId.
        // Defensive filter: only persist comments that belong to the menus
        // currently loaded in the slots. Anything left over in memory from
        // a previously-loaded session is dropped here so it can't ghost
        // forward into the new shared link.
        const currentMenuIds = [menu?.id, menuB?.id].filter((id): id is string => !!id);
        const commentsForCurrentMenu = comments.filter((c) =>
          currentMenuIds.some(
            (id) => c.menuId === id || c.menuId === `A:${id}` || c.menuId === `B:${id}`,
          ),
        );
        if (commentsForCurrentMenu.length > 0) {
          const insertPayload = commentsForCurrentMenu.map(c => ({
            id: c.id,
            session_id: newId,
            menu_id: c.menuId,
            item_id: c.itemId,
            item_name: c.itemName,
            category_name: c.categoryName || null,
            author: c.author,
            text: c.text,
            resolved: c.resolved,
            attachment_url: c.attachmentUrl || null,
          }));
          const { error: commentsError } = await supabase
            .from('comments')
            .insert(insertPayload);
          if (commentsError) {
            // Surface this loudly — otherwise the email goes out with a link
            // to a session that has no comments and the recipient sees nothing.
            console.error('Failed to save comments to Supabase:', commentsError);
            alert(
              `Comments could not be saved to the cloud: ${commentsError.message ?? 'unknown error'}. The session link will work but the recipient may not see all comments.`,
            );
          }
        }

        const newUrl = `${window.location.origin}${window.location.pathname}?sessionId=${newId}&admin=true`;
        window.history.pushState({ path: newUrl }, '', newUrl);
        if (openShareModal) setShareModalOpen(true);
      } catch (err) {
        console.error('Error saving session to Supabase:', err);
        alert('Failed to save session to the cloud. Falling back to local storage.');
        saveSessionLocally(openShareModal);
      } finally {
        setSavingSession(false);
      }
    } else {
      saveSessionLocally(openShareModal);
      setSavingSession(false);
    }
  };

  const handleOpenSubmitModal = async () => {
    if (!shareSessionId && menu) {
      await handleSaveAndShare(false);
    }
    setSubmitModalOpen(true);
  };

  const saveSessionLocally = (openShareModal: boolean = true) => {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newSession = {
      id: localId,
      menuA: menu,
      menuB: menuB,
      scopes: { webApp: true, pos: false },
      createdAt: Date.now(),
      portalUrl: sessionPortalUrl || null,
    };
    const sessions = safeRead<any[]>('mjr_local_sessions_v1', []);
    sessions.push(newSession);
    safeWrite('mjr_local_sessions_v1', sessions);

    setShareSessionId(localId);
    const newUrl = `${window.location.origin}${window.location.pathname}?sessionId=${localId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    if (openShareModal) setShareModalOpen(true);
  };

  const handleLoadLocalSession = (session: any) => {
    setMenu(session.menuA);
    setMenuB(session.menuB);
    setReviewProductScopes(session.scopes);
    setShareSessionId(session.id);
    const newUrl = `${window.location.origin}${window.location.pathname}?sessionId=${session.id}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handleDeleteLocalSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this saved session?')) {
      const sessions = safeRead<any[]>('mjr_local_sessions_v1', []);
      const filtered = sessions.filter((s) => s.id !== id);
      safeWrite('mjr_local_sessions_v1', filtered);
    }
  };

  const handleBundleUpload = (file: File) => {
    setBundleError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = JSON.parse(String(reader.result ?? ''));
        if (payload?.type !== 'mjr_compare_session_v1') {
          throw new Error('Invalid file format. Please upload a valid Compare Session Bundle.');
        }

        setMenu(payload.menuA);
        setMenuB(payload.menuB || null);
        setReviewProductScopes(payload.scopes);

        if (Array.isArray(payload.comments)) {
          importCommentsFromJson(JSON.stringify({ comments: payload.comments }));
        }

        // If connected to Supabase, let's instantly save it to the cloud to establish sync!
        if (isSupabaseConfigured && supabase) {
          const { data, error } = await supabase
            .from('compare_sessions')
            .insert({
              menu_a: payload.menuA,
              menu_b: payload.menuB,
              scopes: payload.scopes,
            })
            .select('id')
            .single();

          if (!error && data) {
            const newId = data.id;
            setShareSessionId(newId);
            const newUrl = `${window.location.origin}${window.location.pathname}?sessionId=${newId}`;
            window.history.pushState({ path: newUrl }, '', newUrl);

            if (payload.comments?.length > 0) {
              const insertPayload = payload.comments.map((c: any) => ({
                id: c.id,
                session_id: newId,
                menu_id: c.menuId,
                item_id: c.itemId,
                item_name: c.itemName,
                category_name: c.categoryName || null,
                author: c.author,
                text: c.text,
                resolved: c.resolved,
                attachment_url: c.attachmentUrl || null,
              }));
              await supabase.from('comments').insert(insertPayload);
            }
          }
        } else {
          setShareSessionId(payload.id || 'imported');
        }
      } catch (err: any) {
        setBundleError(err.message || 'Failed to parse session bundle.');
      }
    };
    reader.readAsText(file);
  };

  const handlePdfUpload = async (file: File) => {
    setPdfError(null);
    if (file.type !== 'application/pdf') {
      setPdfError('Please upload a PDF file');
      return;
    }
    // Set locally first for immediate preview.
    setUploadedPdf(file);

    // Persist to Supabase Storage if a session exists.
    const sessionId = shareSessionId || getSessionIdFromUrl();
    if (sessionId && isSupabaseConfigured && supabase) {
      setPdfUploading(true);
      try {
        const storagePath = `${sessionId}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('pdf-uploads')
          .upload(storagePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { error: updateError } = await supabase
          .from('compare_sessions')
          .update({ pdf_url: storagePath, pdf_name: file.name })
          .eq('id', sessionId);
        if (updateError) throw updateError;
      } catch (err: any) {
        setPdfError(`Uploaded locally but could not persist to session: ${err.message}`);
      } finally {
        setPdfUploading(false);
      }
    }
  };

  const handleViewPdf = () => {
    if (!pdfBlobUrl) return;
    setPdfViewerOpen(true);
  };

  const handleClosePdfViewer = () => {
    setPdfViewerOpen(false);
  };

  const formatSessionTime = (ts: number): string => {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // PDF viewer popup - same modal pattern as Show Summary of Changes.
  // Rendered via createPortal so it works regardless of which view path
  // the component is in (empty state or active split preview).
  // The dialog itself is resizable: native CSS `resize: both` lets the
  // user drag the bottom-right corner to size it as they like.
  const activePdfName = uploadedPdf?.name ?? pdfName ?? 'Report';
  const pdfViewerModal = pdfViewerOpen && pdfBlobUrl
    ? createPortal(
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClosePdfViewer();
          }}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-neutral-900/55 p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-viewer-title"
            className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            style={{
              width: '85vw',
              height: '85vh',
              maxWidth: '1400px',
              maxHeight: '1100px',
              minWidth: '320px',
              minHeight: '300px',
              resize: 'both',
              overflow: 'hidden',
            }}
          >
            <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={18} className="shrink-0 text-flipdish" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    PDF Report
                  </p>
                  <h2 id="pdf-viewer-title" className="mt-0.5 truncate text-base font-semibold text-neutral-900" title={activePdfName}>
                    {activePdfName}
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-[10px] text-neutral-400 sm:inline" title="Drag the bottom-right corner to resize">
                  Drag corner to resize ↘
                </span>
                <button
                  type="button"
                  onClick={handleClosePdfViewer}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  title="Close PDF viewer"
                  aria-label="Close PDF viewer"
                >
                  <X size={18} />
                </button>
              </div>
            </header>
            <iframe
              src={pdfBlobUrl}
              title={activePdfName}
              className="flex-1 w-full bg-neutral-100"
            />
          </div>
        </div>,
        document.body,
      )
    : null;

  // 1. Client empty session state or normal empty upload dashboard
  if (!menu && !menuB) {
    if (isClientReview) {
      return (
        <div className="flex h-full min-h-0 items-center justify-center bg-neutral-50 px-4 py-12 text-center">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-md">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <Lock size={24} className="stroke-[1.5]" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-neutral-900">Review Session Empty</h2>
            <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
              No comparison menus have been uploaded for this review session yet. Please contact your onboarding manager.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-neutral-50 bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:16px_16px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          
          {/* Main Upload Blocks */}
          <div className="md:col-span-2 space-y-4">
            <div className="rounded-2xl border border-neutral-200/80 bg-white/80 backdrop-blur-md p-5 shadow-sm">
              <h2 className="text-base font-semibold text-neutral-900">Compare Menus Side-by-Side</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Upload two menu files below to analyze layout changes, price differences, and modifier groups.
              </p>
              
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="h-44 overflow-hidden rounded-xl border border-neutral-200">
                  <SlotUpload
                    label="Upload OLD menu"
                    helper="The baseline menu, before changes"
                    onLoaded={(m) => {
                      resetCommentsForFreshUpload();
                      setActivePriceBandId(null);
                      setMenu(m);
                      setReviewProductScopes({ webApp: true, pos: false });
                    }}
                  />
                </div>
                <div className="h-44 overflow-hidden rounded-xl border border-neutral-200">
                  <SlotUpload
                    label="Upload NEW menu"
                    helper="The updated menu — changes will be flagged here"
                    onLoaded={(m) => {
                      resetCommentsForFreshUpload();
                      setMenuB(m);
                    }}
                  />
                </div>
              </div>

              {/* PDF Report Upload */}
              <div className="mt-4">
                <div className="relative flex items-center gap-3 rounded-xl border-2 border-dashed border-neutral-300 bg-white px-4 py-3 transition-colors hover:border-flipdish/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-flipdish-muted text-flipdish">
                    <FileUp size={16} />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-xs font-semibold text-neutral-900">
                      {(uploadedPdf || pdfName)
                        ? `PDF: ${uploadedPdf?.name ?? pdfName}`
                        : 'Upload PDF Report (Optional)'}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {pdfUploading
                        ? 'Saving to session…'
                        : (uploadedPdf || pdfName)
                          ? 'Click View Report to display'
                          : 'Click or drop to attach a PDF report for reference'}
                    </p>
                  </div>
                  {(uploadedPdf || pdfName) ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={handleViewPdf}
                        className="inline-flex items-center gap-1.5 rounded-full bg-flipdish px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-flipdish-dark"
                        title={`View ${uploadedPdf?.name ?? pdfName}`}
                      >
                        <FileText size={12} />
                        View Report
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setUploadedPdf(null);
                          // Also clear from session row if one exists.
                          const sessionId = shareSessionId || getSessionIdFromUrl();
                          if (sessionId && isSupabaseConfigured && supabase) {
                            await supabase
                              .from('compare_sessions')
                              .update({ pdf_url: null, pdf_name: null })
                              .eq('id', sessionId);
                          }
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600"
                        title="Remove PDF"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept="application/pdf"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePdfUpload(f);
                      }}
                    />
                  )}
                </div>
                {pdfError && (
                  <p className="mt-1 text-xs font-semibold text-red-600">{pdfError}</p>
                )}
              </div>
            </div>

            {/* Session Bundle Drop Zone */}
            <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-6 text-center hover:border-flipdish/40 transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-flipdish-muted text-flipdish">
                <UploadCloud size={20} />
              </div>
              <h3 className="mt-3 text-xs font-semibold text-neutral-900">Import Portable Session Bundle</h3>
              <p className="mt-1 text-[11px] text-neutral-400">
                Drop a previously exported `.json` CompareSession file here to resume your review.
              </p>
              <input
                type="file"
                accept="application/json"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBundleUpload(f);
                }}
              />
              {bundleError && (
                <p className="mt-2 text-xs font-semibold text-red-600">{bundleError}</p>
              )}
            </div>
          </div>

          {/* Saved Local Sessions Panel */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white/80 backdrop-blur-md p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
              <History size={16} className="text-neutral-500" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Recent Sessions</h3>
            </div>
            
            {localSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-neutral-400">
                <Clock size={20} className="mb-2 stroke-[1.5]" />
                <p>No recent local sessions.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-neutral-100">
                {localSessions.map((session) => (
                  <li
                    key={session.id}
                    onClick={() => handleLoadLocalSession(session)}
                    className="group flex cursor-pointer items-start justify-between py-2.5 transition-colors hover:bg-neutral-50 rounded-lg px-2 -mx-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-neutral-800">
                        {session.menuA?.name || 'Dual Preview'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-400">
                        {formatSessionTime(session.createdAt || Date.now())}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteLocalSession(session.id, e)}
                      className="ml-2 hidden text-neutral-400 hover:text-red-600 group-hover:block"
                      title="Delete Session"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {pdfViewerModal}
      </div>
    );
  }

  // 2. Active Split Preview View
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Full-width premium lock status bar */}
      {sessionSubmitted && (
        <div className={`flex w-full items-center justify-between px-6 py-3 text-sm font-semibold transition-all border-b ${
          isAdmin 
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-800' 
            : 'bg-neutral-900 border-neutral-800 text-white shadow-md'
        }`}>
          <div className="flex items-center gap-3">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
              isAdmin ? 'bg-amber-500/20 text-amber-600' : 'bg-white/10 text-white'
            }`}>
              <Lock size={13} className="stroke-[2.5]" />
            </span>
            <span className="text-xs sm:text-sm">
              {isAdmin 
                ? "This review session is SUBMITTED and currently locked for the client." 
                : "Review Submitted! Your onboarding team has been notified. This session is locked."}
            </span>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={handleUnlockReview}
              className="rounded-full bg-amber-600 px-3.5 py-1 text-xs font-bold text-white hover:bg-amber-700 transition-colors shadow-sm"
            >
              Unlock Review
            </button>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2">
        <p className="mr-auto text-sm font-semibold text-neutral-900">
          {isReviewSession && ((!!menu) !== (!!menuB)) ? 'Menu preview' : 'Old vs New menu'}
          {!(isReviewSession && ((!!menu) !== (!!menuB))) && (
            <span className="ml-2 hidden sm:inline text-xs font-normal text-neutral-500">
              Changes flagged on the NEW side.
            </span>
          )}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {menu && menuB && (
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
              title="Show summary of changes between OLD and NEW"
            >
              <ListChecks size={12} />
              Show summary of changes
            </button>
          )}

          {menu && menuB && (uploadedPdf || pdfName) && (
            <button
              type="button"
              onClick={handleViewPdf}
              className="inline-flex items-center gap-1.5 rounded-full bg-flipdish px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-flipdish-hover"
              title={`View uploaded PDF: ${activePdfName}`}
            >
              <FileText size={12} />
              View Report
            </button>
          )}

          {menu && menuB && !uploadedPdf && !pdfName && (
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
              title="Upload a PDF report"
            >
              <FileUp size={12} />
              Upload PDF
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePdfUpload(f);
                }}
              />
            </label>
          )}

          {sessionPortalUrl ? (
            <a
              href={sessionPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-portal-link
              className="inline-flex items-center gap-1.5 rounded-full bg-flipdish px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-flipdish-hover"
              title={sessionPortalUrl}
            >
              <LinkIcon size={12} />
              Open in Portal
            </a>
          ) : null}

          {unresolvedComments.length > 0 && !sessionSubmitted && (
            <button
              type="button"
              onClick={handleOpenSubmitModal}
              className="relative inline-flex items-center gap-1.5 rounded-full bg-flipdish px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-flipdish-dark animate-pulse-subtle"
            >
              <Mail size={12} />
              Submit Reviews ({unresolvedComments.length})
              <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              </span>
            </button>
          )}

          <input
            type="url"
            value={sessionPortalUrl ?? ''}
            onChange={(e) => setSessionPortalUrl(e.target.value || null)}
            placeholder="Portal URL (required)"
            className={`h-7 rounded-full border bg-white px-3 text-xs text-neutral-700 outline-none focus:border-flipdish w-52 ${
              portalFlashing
                ? 'border-red-500 animate-[ringFlashFast_0.35s_ease-in-out_infinite]'
                : 'border-neutral-200'
            }`}
          />
          {!isClientReview && (
            <button
              type="button"
              onClick={() => handleSaveAndShare()}
              disabled={savingSession}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
            >
              <Share2 size={12} />
              {savingSession ? 'Saving Session...' : 'Save & Share Link'}
            </button>
          )}
        </div>

        <div className="h-6 w-px bg-neutral-200 mx-1" />

        <PriceBandSelector />

        <div className="flex rounded-full border border-neutral-200 bg-white p-0.5 text-[11px] font-semibold">
          {CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                channel === c ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {c === 'DineIn' ? 'Dine-in' : c}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-neutral-700 select-none">
          <input
            type="checkbox"
            checked={diffOn}
            onChange={(e) => setDiffOn(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-neutral-300 accent-flipdish"
          />
          Show differences
        </label>

        {!isClientReview && false && (
          <button
            type="button"
            onClick={swap}
            disabled={!menu && !menuB}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeftRight size={12} />
            Swap
          </button>
        )}
      </div>

      {/* Split body */}
      {(() => {
        const singleMenuSession = isReviewSession && ((!!menu) !== (!!menuB));
        const gridCols = singleMenuSession ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2';
        return (
      <div className={`grid min-h-0 flex-1 ${gridCols}`}>
        {/* Slot A — OLD menu (baseline, no diff badges) */}
        {!(singleMenuSession && !menu) && (
        <div className={`relative flex min-h-0 flex-col ${singleMenuSession ? '' : 'border-b border-neutral-200 md:border-b-0 md:border-r'}`}>
          {menu ? (
            <>
              <SlotHeader
                label="OLD"
                menuName={menu.name}
                hideClear={isClientReview}
                onClear={() => {
                  if (
                    window.confirm(
                      'Remove the OLD menu? Your comments stay saved (keyed by menu id).',
                    )
                  ) {
                    setMenu(null);
                    setReviewProductScopes(null);
                  }
                }}
              />
              <div className="relative min-h-0 flex-1">
                <MenuExplorer menu={menu} channel={channel} slot="A" />
              </div>
            </>
          ) : isReviewSession ? (
            <div className="flex flex-1 items-center justify-center bg-neutral-50 text-neutral-400 text-xs py-10">
              No OLD menu uploaded for this review session
            </div>
          ) : (
            <SlotUpload
              label="Drop OLD menu here"
              helper="The baseline menu, before changes."
              onLoaded={(m) => {
                resetCommentsForFreshUpload();
                setActivePriceBandId(null);
                setMenu(m);
                setReviewProductScopes({ webApp: true, pos: false });
              }}
            />
          )}
        </div>
        )}

        {/* Slot B — NEW menu (changes flagged here) */}
        {!(singleMenuSession && !menuB) && (
        <div className="relative flex min-h-0 flex-col">
          {menuB ? (
            <>
              <SlotHeader
                label="NEW"
                menuName={menuB.name}
                hideClear={isClientReview}
                onClear={() => {
                  if (
                    window.confirm(
                      'Remove the NEW menu? Your comments stay saved (keyed by menu id).',
                    )
                  ) {
                    setMenuB(null);
                  }
                }}
              />
              <div className="relative min-h-0 flex-1">
                <MenuExplorer menu={menuB} channel={channel} diff={diffForB} slot="B" />
              </div>
            </>
          ) : isReviewSession ? (
            <div className="flex flex-1 items-center justify-center bg-neutral-50 text-neutral-400 text-xs py-10">
              No NEW menu uploaded for this review session
            </div>
          ) : (
            <SlotUpload
              label="Drop NEW menu here"
              helper="The updated menu — changes will be flagged here."
              onLoaded={(m) => {
                resetCommentsForFreshUpload();
                setMenuB(m);
              }}
            />
          )}
        </div>
        )}
      </div>
        );
      })()}


      {/* Share Modals */}
      {shareModalOpen && shareSessionId && (
        <ShareSessionModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          sessionId={shareSessionId}
          menuA={menu}
          menuB={menuB}
          scopes={{ webApp: true, pos: false }}
        />
      )}

      {submitModalOpen && (
        <SubmitCommentsModal
          open={submitModalOpen}
          onClose={() => setSubmitModalOpen(false)}
          menuName={menu?.name || 'Comparison Preview'}
          menuId={[menu?.id, menuB?.id].filter((id): id is string => !!id)}
        />
      )}

      {summaryOpen && menu && menuB && (
        <ChangeSummaryModal
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          oldMenu={menu}
          newMenu={menuB}
          channel={channel}
        />
      )}

      {pdfViewerModal}
    </div>
  );
};

const SlotHeader: React.FC<{ label: string; menuName: string; hideClear?: boolean; onClear: () => void }> = ({
  label,
  menuName,
  hideClear,
  onClear,
}) => (
  <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-900 px-3 py-2 text-white">
    <span className="inline-flex h-5 items-center rounded-full bg-white/15 px-2 text-[10px] font-bold uppercase tracking-wider">
      {label}
    </span>
    <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={menuName}>
      {menuName}
    </p>
    {!hideClear && (
      <button
        type="button"
        onClick={onClear}
        className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        aria-label={`Clear menu ${label}`}
        title="Remove this menu"
      >
        <X size={14} />
      </button>
    )}
  </div>
);


