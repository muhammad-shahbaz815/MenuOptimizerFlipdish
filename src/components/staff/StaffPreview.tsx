'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import {
  Bike,
  ChevronLeft,
  Link as LinkIcon,
  Minus,
  Play,
  Plus,
  Printer,
  RotateCcw,
  Share2,
  ShoppingBag,
  UtensilsCrossed,
  User,
  X,
} from 'lucide-react';
import { ShareSessionModal } from '../compare/ShareSessionModal';
import { useAllComments, getSessionIdFromUrl } from '@/hooks/useComments';
import { computeSessionExpiry } from '@/lib/session/sessionLifetime';
import { trackSessionCreated } from '@/lib/session/trackSessionCreated';
import { supabase, isSupabaseConfigured } from '@/lib/supabase-client';
import type {
  NormalizedCategory,
  NormalizedItem,
  NormalizedModifierGroup,
  NormalizedModifierOption,
  SalesChannel,
} from '@/types';
import { DemoOverlay } from '../demos/DemoOverlay';
import { buildStaffDemoScenario } from '@/lib/demo/buildStaffDemoScenario';
import {
  pickDemoModifierSelections,
  pickDemoModifierSelectionsForGroup,
} from '@/lib/demo/pickDemoModifierSelections';
import { findCategoryContainingItem, findItemById } from '@/lib/utils/menuLookup';
import { CommentButton } from '../comments/CommentButton';
import { PriceBandSelector } from '../shared/PriceBandSelector';
import { CommentsModal } from '../comments/CommentsModal';
import { itemHasResolvableModifiers, pickDemoChannel } from '@/lib/demo/pickDemoJourneyItems';
import {
  lineTotal,
  modifierGroupStepValid,
  modifierGroupsForItem,
  modifiersValidForItem,
} from '@/lib/utils/modifierSelection';

interface StaffPreviewProps {
  onBack: () => void;
  autoStartDemo?: boolean;
  onAutoStartDemoConsumed?: () => void;
  /** Menu Preview iframe (`?embed=1`) — fill parent instead of using outer viewport height. */
  embedded?: boolean;
  /** Embed-only: hide the top-left “Back” chrome (navigation owned by parent). */
  hideBack?: boolean;
}

const CHANNEL_LABEL: Record<SalesChannel, string> = {
  DineIn: 'Dine In',
  Takeaway: 'Take Away',
  Collection: 'Collection',
  Delivery: 'Delivery',
};

type PosPhase = 'dispatch' | 'menu';

function dispatchIcon(ch: SalesChannel) {
  switch (ch) {
    case 'DineIn':
      return UtensilsCrossed;
    case 'Takeaway':
      return User;
    case 'Collection':
      return ShoppingBag;
    case 'Delivery':
      return Bike;
    default:
      return ShoppingBag;
  }
}

function categoryTileColors(cat: NormalizedCategory): { bg: string; fg: string } {
  return {
    bg: cat.backgroundColor || '#D1D5DB',
    fg: cat.foregroundColor || '#111827',
  };
}

function modifierOptionTileColors(opt: NormalizedModifierOption): { bg: string; fg: string } {
  return {
    bg: opt.backgroundColor || '#f9a825',
    fg: opt.foregroundColor || '#111827',
  };
}

/** Avoid "Select Select …" when export caption already starts with "Select". */
function modifierModalTitle(group: NormalizedModifierGroup): string {
  const n = group.name.trim();
  if (/^select\b/i.test(n)) {
    return n;
  }
  return `Select ${n}`;
}

/**
 * Optional (min 0): show selected / max — e.g. 0/1 means skippable, nothing chosen yet.
 * Required (min > 0): never show 0 on the left; use max(selected, min) / max so e.g. 1/1 or 1/4 until user picks more.
 */
function modifierModalCounterLabel(
  group: NormalizedModifierGroup,
  selections: Record<string, string[]>,
): string {
  const selected = (selections[group.id] ?? []).length;
  const max = group.maxSelection;
  if (group.minSelection > 0) {
    const left = Math.max(selected, group.minSelection);
    return `${left} / ${max}`;
  }
  return `${selected} / ${max}`;
}

type OrderLine = {
  item: NormalizedItem;
  price: number;
  timestamp: number;
  selections?: Record<string, string[]>;
};

type ModifierModalState = {
  item: NormalizedItem;
  stepIndex: number;
  selections: Record<string, string[]>;
};

function toggleModifierOption(
  groupId: string,
  optionId: string,
  maxSelection: number,
  prev: Record<string, string[]>,
): Record<string, string[]> {
  const cur = prev[groupId] ?? [];
  const i = cur.indexOf(optionId);
  if (maxSelection <= 1) {
    return { ...prev, [groupId]: i >= 0 ? [] : [optionId] };
  }
  if (i >= 0) {
    return { ...prev, [groupId]: cur.filter((id) => id !== optionId) };
  }
  if (cur.length >= maxSelection) {
    return prev;
  }
  return { ...prev, [groupId]: [...cur, optionId] };
}

export const StaffPreview: React.FC<StaffPreviewProps> = ({
  onBack,
  autoStartDemo,
  onAutoStartDemoConsumed,
  embedded = false,
  hideBack = false,
}) => {
  const {
    menu,
    activeChannel,
    setActiveChannel,
    setActiveScenario,
    activeScenario,
    activeStepIndex,
    sessionPortalUrl,
    setSessionPortalUrl,
  } = useStore();

  // Session sharing (mirrors customer/compare flow). Staff/POS-only scope.
  const allCommentsForSessionRaw = useAllComments();
  const allCommentsForSession = allCommentsForSessionRaw.filter((c) => c.menuId === menu?.id);
  const [shareSessionId, setShareSessionId] = useState<string | null>(getSessionIdFromUrl());
  const [savingSession, setSavingSession] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [portalFlashing, setPortalFlashing] = useState(false);

  const flashPortalInput = () => {
    setPortalFlashing(true);
    window.setTimeout(() => setPortalFlashing(false), 5000);
  };

  const isReviewSession = getSessionIdFromUrl() !== null;
  const isAdminViewer =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('admin') === 'true' || !isReviewSession);
  const isClientReview = isReviewSession && !isAdminViewer;

  const persistStaffSession = useCallback(
    async (openShareModal: boolean): Promise<string | null> => {
      if (!menu) return null;
      setSavingSession(true);

      const payload = {
        menu_a: menu,
        menu_b: null,
        scopes: { webApp: false, pos: true },
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
          void trackSessionCreated(newId, 'customer');

          if (allCommentsForSession.length > 0) {
            const insertPayload = allCommentsForSession.map((c) => ({
              id: c.id,
              session_id: newId,
              menu_id: c.menuId,
              item_id: c.itemId,
              item_name: c.itemName,
              category_name: c.categoryName || null,
              author: c.author,
              text: c.text,
              resolved: c.resolved,
              attachment_url: (c as any).attachmentUrl || null,
            }));
            const { error: commentsError } = await supabase
              .from('comments')
              .insert(insertPayload);
            if (commentsError) {
              console.error('Failed to save comments to Supabase:', commentsError);
              alert(
                `Comments could not be saved to the cloud: ${commentsError.message ?? 'unknown error'}. The session link will work but the recipient may not see all comments.`,
              );
            }
          }

          const url = `${window.location.origin}${window.location.pathname}?sessionId=${newId}&admin=true`;
          window.history.pushState({ path: url }, '', url);
          if (openShareModal) setShareModalOpen(true);
          return newId;
        } catch (err) {
          console.error('Error saving session to Supabase:', err);
          alert('Failed to save session to the cloud.');
          return null;
        } finally {
          setSavingSession(false);
        }
      }
      setSavingSession(false);
      return null;
    },
    [menu, allCommentsForSession, sessionPortalUrl],
  );

  const handleSaveAndShare = useCallback(() => {
    if (!sessionPortalUrl) {
      flashPortalInput();
      return;
    }
    void persistStaffSession(true);
  }, [persistStaffSession, sessionPortalUrl]);

  const [phase, setPhase] = useState<PosPhase>('dispatch');
  const [activeCategory, setActiveCategory] = useState<NormalizedCategory | null>(
    menu?.categories.find((c) => c.enabled) ?? null,
  );

  // When the menu reference changes (e.g. price-band switch re-normalizes it),
  // re-resolve the active category by id so we don't keep rendering the stale
  // object with the previous band's prices.
  useEffect(() => {
    if (!menu) return;
    setActiveCategory((prev) => {
      if (!prev) return menu.categories.find((c) => c.enabled) ?? null;
      const next = menu.categories.find((c) => c.id === prev.id);
      return next ?? menu.categories.find((c) => c.enabled) ?? null;
    });
  }, [menu]);
  const [order, setOrder] = useState<OrderLine[]>([]);
  const [modifierModal, setModifierModal] = useState<ModifierModalState | null>(null);
  const [commentItem, setCommentItem] = useState<NormalizedItem | null>(null);

  const ticketFooterRef = useRef<HTMLDivElement>(null);
  const categoryStripRef = useRef<HTMLDivElement>(null);
  const itemsGridRef = useRef<HTMLDivElement>(null);

  const scrollTo = useCallback((selector: string, root?: HTMLElement | null) => {
    const el = (root ?? document).querySelector(selector) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, []);

  const currentDemoStep =
    activeScenario?.type === 'staff' ? activeScenario.steps[activeStepIndex] : undefined;

  const demoHighlightDispatch = (ch: SalesChannel) =>
    currentDemoStep?.action === 'chooseOrderType' && currentDemoStep.targetId === ch;

  const demoHighlightCategory = (id: string) =>
    currentDemoStep?.action === 'spotlightCategories' ||
    (currentDemoStep?.action === 'openCategory' && currentDemoStep.targetId === id);

  const demoHighlightItem = (id: string) => {
    if (currentDemoStep?.action === 'spotlightItems') return true;
    if (currentDemoStep?.action === 'spotlightModifiers') {
      if (modifierModal) return false;
      return currentDemoStep.targetId === id;
    }
    return currentDemoStep?.action === 'selectItem' && currentDemoStep.targetId === id;
  };

  const demoStaffCategoryStripRing = currentDemoStep?.action === 'spotlightCategories';

  const demoStaffItemsRegionRing =
    currentDemoStep?.action === 'spotlightItems' ||
    (currentDemoStep?.action === 'spotlightModifiers' && !modifierModal);

  const demoStaffModifiersRegionRing =
    currentDemoStep?.action === 'spotlightModifiers' && Boolean(modifierModal);

  const demoStaffTicketRing = currentDemoStep?.action === 'spotlightBasket';

  useEffect(() => {
    if (!menu || activeScenario?.type !== 'staff' || !currentDemoStep || activeStepIndex < 0) {
      return;
    }

    const t = window.setTimeout(() => {
      switch (currentDemoStep.action) {
        case 'spotlightCategories': {
          setOrder([]);
          setModifierModal(null);
          setPhase('menu');
          const fc = menu.categories.find((c) => c.enabled);
          if (fc) setActiveCategory(fc);
          categoryStripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          break;
        }
        case 'spotlightItems': {
          setModifierModal(null);
          setPhase('menu');
          const fc = menu.categories.find((c) => c.enabled && c.items.some((i) => i.enabled));
          if (fc) setActiveCategory(fc);
          scrollTo('[data-demo-items-region]');
          break;
        }
        case 'spotlightModifiers': {
          if (!currentDemoStep.targetId) break;
          const item = findItemById(menu, currentDemoStep.targetId);
          if (!item?.enabled) break;
          const parent = menu.categories.find((c) => c.items.some((i) => i.id === item.id));
          if (parent) setActiveCategory(parent);
          setPhase('menu');
          const groups = modifierGroupsForItem(menu, item);
          if (groups.length > 0 && itemHasResolvableModifiers(menu, item)) {
            setModifierModal({
              item,
              stepIndex: 0,
              selections: pickDemoModifierSelections(menu, item),
            });
            window.setTimeout(() => {
              scrollTo('[data-demo-modifiers-region]');
            }, 200);
          } else {
            setModifierModal(null);
          }
          scrollTo(`[data-staff-item="${item.id}"]`, itemsGridRef.current ?? undefined);
          break;
        }
        case 'spotlightBasket': {
          if (!currentDemoStep.targetId) break;
          const item = findItemById(menu, currentDemoStep.targetId);
          if (!item?.enabled) break;
          setModifierModal(null);
          const groups = modifierGroupsForItem(menu, item);
          if (groups.length > 0 && itemHasResolvableModifiers(menu, item)) {
            const picks = pickDemoModifierSelections(menu, item);
            if (!modifiersValidForItem(menu, item, picks)) break;
            setOrder((prev) => [
              ...prev,
              {
                item,
                price: lineTotal(menu, item, picks, activeChannel),
                timestamp: Date.now(),
                selections: picks,
              },
            ]);
          } else {
            setOrder((prev) => [
              ...prev,
              {
                item,
                price: item.prices[activeChannel] ?? 0,
                timestamp: Date.now(),
              },
            ]);
          }
          window.setTimeout(() => {
            scrollTo('[data-demo-staff-ticket]');
          }, 120);
          break;
        }
        case 'goToScreen':
          setOrder([]);
          setPhase('dispatch');
          setModifierModal(null);
          break;
        case 'chooseOrderType': {
          const id = currentDemoStep.targetId as SalesChannel | undefined;
          if (id && ['DineIn', 'Takeaway', 'Collection', 'Delivery'].includes(id)) {
            setActiveChannel(id);
            setPhase('menu');
            setModifierModal(null);
          }
          break;
        }
        case 'openCategory': {
          if (!currentDemoStep.targetId) break;
          const cat = menu.categories.find((c) => c.id === currentDemoStep.targetId);
          if (cat) {
            setActiveCategory(cat);
            setPhase('menu');
            scrollTo(`[data-staff-category="${cat.id}"]`, categoryStripRef.current);
          }
          break;
        }
        case 'selectItem': {
          if (!currentDemoStep.targetId) break;
          const item = findItemById(menu, currentDemoStep.targetId);
          if (!item?.enabled) break;
          const parent = menu.categories.find((c) => c.items.some((i) => i.id === item.id));
          if (parent) setActiveCategory(parent);
          setPhase('menu');
          scrollTo(`[data-staff-item="${item.id}"]`, itemsGridRef.current ?? undefined);
          const groups = modifierGroupsForItem(menu, item);
          if (groups.length > 0) {
            setModifierModal({ item, stepIndex: 0, selections: {} });
          } else {
            setOrder((prev) => [
              ...prev,
              {
                item,
                price: item.prices[activeChannel] ?? 0,
                timestamp: Date.now(),
              },
            ]);
          }
          break;
        }
        case 'chooseModifier': {
          if (!currentDemoStep.targetId || !currentDemoStep.modifierGroupId) break;
          const item = findItemById(menu, currentDemoStep.targetId);
          if (!item?.enabled) break;
          const parent = menu.categories.find((c) => c.items.some((i) => i.id === item.id));
          if (parent) setActiveCategory(parent);
          setPhase('menu');
          const groups = modifierGroupsForItem(menu, item);
          const gi = groups.findIndex((g) => g.id === currentDemoStep.modifierGroupId);
          if (gi < 0) break;
          const extra = pickDemoModifierSelectionsForGroup(menu, item, currentDemoStep.modifierGroupId);
          setModifierModal((m) => {
            if (!m || m.item.id !== item.id) {
              return { item, stepIndex: gi, selections: { ...extra } };
            }
            return {
              ...m,
              stepIndex: gi,
              selections: { ...m.selections, ...extra },
            };
          });
          break;
        }
        case 'addToCart': {
          const itemId = currentDemoStep.targetId;
          const item = itemId ? findItemById(menu, itemId) : null;
          if (!item?.enabled) break;
          const groups = modifierGroupsForItem(menu, item);
          if (groups.length === 0) break;
          const picks = pickDemoModifierSelections(menu, item);
          if (!modifiersValidForItem(menu, item, picks)) break;
          setOrder((prev) => [
            ...prev,
            {
              item,
              price: lineTotal(menu, item, picks, activeChannel),
              timestamp: Date.now(),
              selections: picks,
            },
          ]);
          setModifierModal(null);
          break;
        }
        case 'goToCheckout':
          setPhase('menu');
          ticketFooterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          break;
        default:
          break;
      }
    }, 80);

    return () => window.clearTimeout(t);
  }, [
    activeScenario?.id,
    activeScenario?.type,
    activeStepIndex,
    currentDemoStep?.action,
    currentDemoStep?.targetId,
    currentDemoStep?.modifierGroupId,
    menu,
    activeChannel,
    scrollTo,
    setActiveChannel,
  ]);

  const startDemo = useCallback(() => {
    if (!menu) return;
    setOrder([]);
    setModifierModal(null);
    setPhase('menu');
    setActiveChannel(pickDemoChannel(menu));
    const first = menu.categories.find((c) => c.enabled) ?? null;
    setActiveCategory(first);
    setActiveScenario(buildStaffDemoScenario(menu));
  }, [menu, setActiveChannel, setActiveScenario]);

  useEffect(() => {
    if (!autoStartDemo) return;
    startDemo();
    onAutoStartDemoConsumed?.();
  }, [autoStartDemo, startDemo, onAutoStartDemoConsumed]);

  if (!menu) return null;

  const total = order.reduce((s, l) => s + l.price, 0);

  const dispatchChannels = (['DineIn', 'Takeaway', 'Collection', 'Delivery'] as SalesChannel[]).filter(
    (c) => menu.channels.includes(c),
  );

  const selectDispatch = (ch: SalesChannel) => {
    setActiveChannel(ch);
    setPhase('menu');
  };

  const modifierFlowGroups = modifierModal
    ? modifierGroupsForItem(menu, modifierModal.item, modifierModal.selections)
    : [];
  const currentModGroup =
    modifierModal && modifierFlowGroups.length > 0
      ? modifierFlowGroups[modifierModal.stepIndex]
      : undefined;

  const addItemToOrder = (item: NormalizedItem, selections?: Record<string, string[]>) => {
    const price = selections
      ? lineTotal(menu, item, selections, activeChannel)
      : item.prices[activeChannel] ?? 0;
    setOrder((o) => [
      ...o,
      {
        item,
        price,
        timestamp: Date.now(),
        ...(selections && Object.keys(selections).length > 0 ? { selections } : {}),
      },
    ]);
  };

  const handlePosItemClick = (item: NormalizedItem) => {
    const groups = modifierGroupsForItem(menu, item);
    if (groups.length === 0) {
      addItemToOrder(item);
      return;
    }
    setModifierModal({ item, stepIndex: 0, selections: {} });
  };

  return (
    <div
      className={`@container relative flex min-w-0 flex-1 flex-col bg-white font-sans text-neutral-900 ${
        embedded ? 'overflow-visible' : 'min-h-0 overflow-hidden'
      }`}
    >
      {/* Top bar — Flipdish POS chrome */}
      <header className="flex h-[3.75rem] shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 md:h-[4.25rem] md:px-6">
        <div className="z-10 flex min-w-0 items-center gap-2 sm:gap-4">
          {hideBack ? (
            <div className="rounded-lg px-2 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 md:px-2.5">
              POS preview
            </div>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 md:p-2.5"
              aria-label="Back"
            >
              <ChevronLeft size={22} className="md:h-6 md:w-6" />
            </button>
          )}
          {phase === 'menu' ? (
            <button
              type="button"
              onClick={() => setPhase('dispatch')}
              className="hidden text-sm font-medium text-flipdish hover:underline sm:inline"
            >
              Change dispatch
            </button>
          ) : null}
        </div>

        <div className="z-10 flex items-center gap-2">
          <PriceBandSelector />
          <input
            type="url"
            value={sessionPortalUrl ?? ''}
            onChange={(e) => setSessionPortalUrl(e.target.value || null)}
            placeholder="Portal URL (required)"
            className={`hidden h-9 w-48 rounded-lg border bg-white px-3 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-flipdish focus:outline-none focus:ring-1 focus:ring-flipdish md:inline-block md:text-sm ${
              portalFlashing
                ? 'border-red-500 animate-[ringFlashFast_0.35s_ease-in-out_infinite]'
                : 'border-neutral-300'
            }`}
          />
          {sessionPortalUrl && (
            <a
              href={sessionPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-flipdish px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-flipdish-hover md:text-sm"
              title={sessionPortalUrl}
            >
              <LinkIcon size={14} />
              <span className="hidden sm:inline">Open in Portal</span>
            </a>
          )}
          {!isClientReview && (
            <button
              type="button"
              onClick={handleSaveAndShare}
              disabled={savingSession}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-40 md:text-sm"
              title="Save & share link"
            >
              <Share2 size={14} />
              <span className="hidden sm:inline">{savingSession ? 'Saving…' : 'Save & Share Link'}</span>
            </button>
          )}
          <div className="max-w-[160px] truncate rounded-lg border border-flipdish px-3 py-2 text-center text-xs font-medium text-flipdish sm:max-w-[240px] md:text-sm">
            {menu.name}
          </div>
          <button
            type="button"
            onClick={startDemo}
            className="flex items-center gap-2 rounded-lg bg-flipdish px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm hover:bg-flipdish-hover md:px-4 md:text-sm"
          >
            <Play size={16} fill="currentColor" className="md:h-[18px] md:w-[18px]" />
            Demo
          </button>
        </div>
      </header>

      {phase === 'dispatch' ? (
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-4 py-8 md:gap-10">
          <h1 className="text-center text-xl font-semibold text-flipdish md:text-2xl">
            Select dispatch type
          </h1>
          <div className="grid w-full max-w-5xl grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5 md:gap-6">
            {dispatchChannels.map((ch) => {
              const Icon = dispatchIcon(ch);
              const hi = demoHighlightDispatch(ch);
              return (
                <button
                  key={ch}
                  type="button"
                  data-staff-dispatch={ch}
                  onClick={() => selectDispatch(ch)}
                  className={`flex aspect-square max-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-flipdish bg-white text-flipdish shadow-sm transition-all hover:bg-flipdish-muted/40 active:scale-[0.98] sm:max-h-[220px] md:max-h-[260px] md:gap-4 ${
                    hi ? 'ring-4 ring-flipdish/35 ring-offset-2' : ''
                  }`}
                >
                  <Icon size={44} strokeWidth={1.25} className="sm:h-12 sm:w-12 md:h-14 md:w-14" />
                  <span className="text-center text-sm font-semibold uppercase tracking-wide md:text-base">
                    {CHANNEL_LABEL[ch]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="max-w-md text-center text-sm text-neutral-500 md:text-base">
            Preview only — this screen mirrors Flipdish POS dispatch selection before the menu opens.
          </p>
        </main>
      ) : (
        <div className={`flex flex-1 ${embedded ? 'overflow-visible' : 'min-h-0 overflow-hidden'}`}>
          <div className={`flex min-w-0 flex-1 flex-col ${embedded ? 'overflow-visible' : 'min-h-0 overflow-hidden'}`}>
            {/* Category tiles — coloured like POS */}
            <div
              ref={categoryStripRef}
              data-demo-category-strip
              data-tour-anchor="tour-categories"
              className={`grid shrink-0 grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2.5 border-b border-neutral-200 bg-white px-4 py-2.5 sm:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] sm:gap-3 sm:px-5 sm:py-3 md:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] md:gap-3.5 md:px-6 ${
                demoStaffCategoryStripRing ? 'ring-2 ring-flipdish ring-offset-2' : ''
              }`}
            >
              {menu.categories
                .filter((c) => c.enabled)
                .map((cat) => {
                  const { bg, fg } = categoryTileColors(cat);
                  const active = activeCategory?.id === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      data-staff-category={cat.id}
                      onClick={() => setActiveCategory(cat)}
                      className={`flex min-h-[52px] w-full items-center justify-center appearance-none rounded-lg px-2 py-2.5 text-center transition-all sm:min-h-[56px] sm:px-2.5 sm:py-3 md:min-h-[60px] md:rounded-xl md:px-3 md:py-3 ${
                        demoHighlightCategory(cat.id)
                          ? 'ring-2 ring-flipdish ring-offset-2'
                          : active
                            ? 'ring-2 ring-neutral-900 ring-offset-2'
                            : ''
                      }`}
                      style={{
                        backgroundColor: bg,
                        color: fg,
                        forcedColorAdjust: 'none',
                      }}
                    >
                      <span className="line-clamp-3 text-[11px] font-bold uppercase leading-tight sm:text-xs md:text-sm">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
            </div>

            <div className={embedded ? 'flex-1' : 'min-h-0 flex-1'}>
              {/* Item grid */}
              <div
                ref={itemsGridRef}
                data-demo-items-region
                data-tour-anchor="tour-items"
                className={`${embedded ? 'overflow-visible' : 'min-h-0 h-full overflow-y-auto'} bg-neutral-50 p-4 sm:p-5 md:p-6 ${
                  demoStaffItemsRegionRing ? 'ring-2 ring-flipdish ring-offset-2' : ''
                }`}
              >
                <div className="mb-4 md:mb-5">
                  <h2 className="truncate text-base font-semibold uppercase tracking-wide text-neutral-800 md:text-lg">
                    {activeCategory?.name ?? 'Menu'}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
                  {activeCategory?.items
                    .filter((i) => i.enabled)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        data-staff-item={item.id}
                        onClick={() => handlePosItemClick(item)}
                        className={`relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-sm transition-all hover:border-flipdish/50 hover:shadow-md active:scale-[0.99] md:rounded-2xl ${
                          demoHighlightItem(item.id) ? 'ring-2 ring-flipdish ring-offset-2' : ''
                        }`}
                      >
                        {menu ? (
                          <CommentButton
                            menuId={menu.id}
                            itemId={item.id}
                            onClick={() => setCommentItem(item)}
                          />
                        ) : null}
                        <div className="h-[4.5rem] w-full shrink-0 overflow-hidden bg-neutral-100 sm:h-20 md:h-24">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-neutral-300">
                              <ShoppingBag size={26} strokeWidth={1} className="md:h-7 md:w-7" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-1.5 p-3 md:gap-2 md:p-3.5">
                          <p className="line-clamp-2 text-xs font-semibold leading-snug text-neutral-900 md:text-sm">
                            {item.name}
                          </p>
                          {item.description ? (
                            <p className="line-clamp-2 text-[11px] leading-snug text-neutral-500 md:text-xs">
                              {item.description}
                            </p>
                          ) : null}
                          <div className="mt-auto flex items-end justify-between pt-1.5">
                            <span className="flex items-baseline gap-1 text-base font-semibold tabular-nums text-flipdish md:text-lg">
                              €{(item.prices[activeChannel] ?? 0).toFixed(2)}
                              {item.drsCharge ? <span className="text-xs font-medium text-neutral-500">+{item.drsCharge === 0.25 ? '25c' : '15c'} DRS</span> : null}
                            </span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 md:h-9 md:w-9">
                              <Plus size={16} className="md:h-[18px] md:w-[18px]" />
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* Ticket / order panel — min-h-0 keeps flex footer visible; scroll is only in line list */}
          <aside
            data-demo-staff-ticket
            data-tour-anchor="tour-basket"
            className={`flex min-h-0 w-[min(100%,400px)] shrink-0 flex-col border-l border-neutral-200 bg-white sm:w-[min(100%,440px)] md:w-[min(100%,480px)] ${
              demoStaffTicketRing ? 'ring-2 ring-flipdish ring-offset-2' : ''
            }`}
          >
            <div className="flex items-center gap-2 border-b border-neutral-200 p-3 md:gap-3 md:p-4">
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-flipdish py-3 text-sm font-medium text-flipdish md:py-3.5 md:text-base"
              >
                <User size={18} className="md:h-5 md:w-5" />
                Add customer
              </button>
              <button
                type="button"
                onClick={() => setOrder([])}
                className="rounded-lg border border-neutral-200 p-2.5 text-neutral-500 hover:bg-neutral-50 hover:text-red-600 md:p-3"
                title="Clear ticket"
              >
                <RotateCcw size={20} className="md:h-[22px] md:w-[22px]" />
              </button>
            </div>

            <div className="flex items-center justify-between bg-neutral-700 px-3 py-2.5 text-xs text-white md:px-4 md:py-3 md:text-sm">
              <span className="font-medium">
                Store / {CHANNEL_LABEL[activeChannel]}
              </span>
              <span className="tabular-nums opacity-80">—</span>
            </div>

            <div className={`${embedded ? 'flex-1 overflow-visible' : 'min-h-0 flex-1 overflow-y-auto'} p-3 md:p-4`}>
              {order.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center text-neutral-400 md:py-16">
                  <p className="text-sm font-semibold uppercase tracking-wide md:text-base">
                    No items yet
                  </p>
                  <p className="mt-2 text-xs md:text-sm">Tap products to add to the ticket</p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {order.map((line, idx) => (
                    <li
                      key={`${line.timestamp}-${idx}`}
                      className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 md:text-base">{line.item.name}</p>
                        <p className="text-xs text-neutral-400">×1</p>
                        {line.selections && Object.keys(line.selections).length > 0 ? (
                          <ul className="mt-1 space-y-0.5 border-l border-neutral-200 pl-2">
                            {Object.entries(line.selections).flatMap(([gid, ids]) => {
                              const g = menu.modifierGroups[gid];
                              return ids.flatMap((oid) => {
                                const opt = g?.options.find((o) => o.id === oid);
                                if (!opt) return [];
                                return [
                                  <li key={`${gid}-${oid}`} className="text-xs text-neutral-500">
                                    {opt.name}
                                  </li>,
                                ];
                              });
                            })}
                          </ul>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-flipdish md:text-base">
                          €{line.price.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setOrder((o) => o.filter((_, i) => i !== idx))}
                          className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              ref={ticketFooterRef}
              className="border-t border-neutral-200 bg-neutral-800 p-4 text-white md:p-5"
            >
              <div className="space-y-2 text-xs uppercase tracking-wide md:text-sm">
                <div className="flex justify-between text-neutral-400">
                  <span>Total order price</span>
                  <span className="tabular-nums">€{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Total sale price</span>
                  <span className="tabular-nums">€{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2 text-base font-semibold md:text-lg">
                  <span>Total payable</span>
                  <span className="tabular-nums text-white">€{total.toFixed(2)}</span>
                </div>
              </div>

              <div
                data-staff-ticket-actions
                className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 md:mt-5 md:gap-3 md:pt-5"
              >
                <button
                  type="button"
                  className="flex h-11 items-center justify-center rounded-lg border border-white/30 bg-white/5 text-white md:h-12"
                >
                  <Minus size={18} />
                </button>
                <button
                  type="button"
                  className="flex h-11 items-center justify-center rounded-lg border border-white/30 bg-white/5 text-white md:h-12"
                >
                  <Plus size={18} />
                </button>
                <button
                  type="button"
                  className="flex h-11 items-center justify-center rounded-lg border border-flipdish bg-flipdish text-white md:h-12"
                >
                  <Printer size={18} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 md:mt-3 md:gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-flipdish bg-white py-3 text-sm font-semibold text-flipdish md:py-3.5 md:text-base"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-flipdish bg-white py-3 text-sm font-semibold text-flipdish md:py-3.5 md:text-base"
                >
                  Pay
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-500 py-3 text-sm font-medium text-neutral-300 md:py-3.5 md:text-base"
                >
                  Exit
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {modifierModal && currentModGroup ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModifierModal(null);
          }}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            role="dialog"
            aria-modal
            aria-labelledby="staff-modifier-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-neutral-200 px-4 py-4 md:px-6 md:py-5">
              <h2
                id="staff-modifier-title"
                className="text-center text-base font-bold text-neutral-900 md:text-lg"
              >
                {modifierModalTitle(currentModGroup)} (
                {modifierModalCounterLabel(currentModGroup, modifierModal.selections)})
              </h2>
            </header>
            <div
              data-demo-modifiers-region
              className={`min-h-0 flex-1 overflow-y-auto p-4 md:p-5 ${
                demoStaffModifiersRegionRing ? 'ring-2 ring-flipdish ring-offset-2 rounded-lg' : ''
              }`}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 lg:gap-4">
                {currentModGroup.options
                  .filter((o) => o.enabled)
                  .map((opt) => {
                    const selected = (modifierModal.selections[currentModGroup.id] ?? []).includes(
                      opt.id,
                    );
                    const { bg, fg } = modifierOptionTileColors(opt);
                    const optPrice = opt.prices[activeChannel] ?? opt.price;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-staff-modifier-option={opt.id}
                        onClick={() =>
                          setModifierModal((m) => {
                            if (!m) return m;
                            const next = toggleModifierOption(
                              currentModGroup.id,
                              opt.id,
                              currentModGroup.maxSelection,
                              m.selections,
                            );
                            // Drop selections inside conditional sub-groups
                            // that are no longer reachable after the toggle.
                            const active = new Set(
                              modifierGroupsForItem(menu, m.item, next).map((g) => g.id),
                            );
                            const cleaned: Record<string, string[]> = {};
                            for (const [k, v] of Object.entries(next)) {
                              if (active.has(k)) cleaned[k] = v;
                            }
                            return { ...m, selections: cleaned };
                          })
                        }
                        className={`flex min-h-[4.5rem] flex-col items-start justify-center rounded-md border-2 border-neutral-800 px-3 py-3 text-left transition-all appearance-none md:min-h-[5rem] md:px-4 ${
                          selected ? 'ring-2 ring-neutral-900 ring-offset-2' : ''
                        }`}
                        style={{
                          backgroundColor: bg,
                          color: fg,
                          forcedColorAdjust: 'none',
                        }}
                      >
                        <span className="text-sm font-bold md:text-base">{opt.name}</span>
                        <span className="mt-0.5 text-sm font-normal opacity-95">
                          €{optPrice.toFixed(2)}
                          {opt.drsCharge ? ` +${opt.drsCharge === 0.25 ? '25c' : '15c'}` : ''}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
            <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-neutral-200 bg-neutral-50 p-4 md:gap-3 md:p-5">
              <button
                type="button"
                className="rounded-md bg-neutral-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-600 md:px-5 md:py-3 md:text-base"
                onClick={() => setModifierModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modifierModal.stepIndex === 0}
                className="rounded-md bg-amber-100 px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40 md:px-5 md:py-3 md:text-base"
                onClick={() =>
                  setModifierModal((m) =>
                    m && m.stepIndex > 0 ? { ...m, stepIndex: m.stepIndex - 1 } : m,
                  )
                }
              >
                Previous
              </button>
              <button
                type="button"
                disabled={
                  !modifierGroupStepValid(currentModGroup, modifierModal.selections) ||
                  modifierModal.stepIndex >= modifierFlowGroups.length - 1
                }
                className="rounded-md bg-flipdish px-4 py-2.5 text-sm font-semibold text-white hover:bg-flipdish-hover disabled:cursor-not-allowed disabled:opacity-40 md:px-5 md:py-3 md:text-base"
                onClick={() =>
                  setModifierModal((m) => (m ? { ...m, stepIndex: m.stepIndex + 1 } : m))
                }
              >
                Next
              </button>
              <button
                type="button"
                disabled={
                  modifierModal.stepIndex !== modifierFlowGroups.length - 1 ||
                  !modifiersValidForItem(menu, modifierModal.item, modifierModal.selections)
                }
                className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 md:px-5 md:py-3 md:text-base"
                onClick={() => {
                  if (!modifiersValidForItem(menu, modifierModal.item, modifierModal.selections)) {
                    return;
                  }
                  addItemToOrder(modifierModal.item, { ...modifierModal.selections });
                  setModifierModal(null);
                }}
              >
                Finish
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {activeScenario ? <DemoOverlay layout="staff" dock="preview" /> : null}

      {shareModalOpen && shareSessionId ? (
        <ShareSessionModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          sessionId={shareSessionId}
          menuA={menu}
          menuB={null}
          scopes={{ webApp: false, pos: true }}
        />
      ) : null}

      {commentItem && menu ? (
        <CommentsModal
          open={!!commentItem}
          onClose={() => setCommentItem(null)}
          menuId={menu.id}
          itemId={commentItem.id}
          itemName={commentItem.name}
          categoryName={findCategoryContainingItem(menu, commentItem.id)?.name}
        />
      ) : null}
    </div>
  );
};
