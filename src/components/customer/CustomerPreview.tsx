'use client';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/hooks/useStore';
import {
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Play,
  RotateCcw,
  X,
  ChevronDown,
  Monitor,
  Smartphone,
  Plus,
  MapPin,
  Store,
  User,
  Minus,
  ChevronUp,
  Share2,
  Mail,
  Link as LinkIcon,
} from 'lucide-react';
import type { NormalizedCategory, NormalizedItem, NormalizedMenu, NormalizedModifierGroup } from '@/types';
import { DemoOverlay } from '../demos/DemoOverlay';
import { buildCustomerDemoScenario } from '@/lib/demo/buildCustomerDemoScenario';
import {
  pickDemoModifierSelections,
  pickDemoModifierSelectionsForGroup,
} from '@/lib/demo/pickDemoModifierSelections';
import { formatModifierGroupHint } from '@/lib/utils/modifierHint';
import {
  lineTotal,
  modifierGroupStepValid,
  modifierGroupsForItem,
  modifiersValidForItem,
} from '@/lib/utils/modifierSelection';
import { findCategoryContainingItem, findItemById } from '@/lib/utils/menuLookup';
import { CommentButton } from '../comments/CommentButton';
import { CommentsModal } from '../comments/CommentsModal';
import { SubmitCommentsModal } from '../comments/SubmitCommentsModal';
import { ShareSessionModal } from '../compare/ShareSessionModal';
import { PortalLinkModal } from '../compare/PortalLinkModal';
import { PriceBandSelector } from '../shared/PriceBandSelector';
import { itemHasResolvableModifiers } from '@/lib/demo/pickDemoJourneyItems';
import { useAllComments, getSessionIdFromUrl } from '@/hooks/useComments';
import { computeSessionExpiry } from '@/lib/session/sessionLifetime';
import { trackSessionCreated } from '@/lib/session/trackSessionCreated';
import { supabase, isSupabaseConfigured } from '@/lib/supabase-client';

interface CustomerPreviewProps {
  onBack: () => void;
  /** When true once (e.g. after “Review” from home), start the guided demo immediately. */
  autoStartDemo?: boolean;
  onAutoStartDemoConsumed?: () => void;
  /** Set when hosted inside Menu Preview iframe (`?embed=1`) — avoids `100svh`/`dvh` using the outer window. */
  embedded?: boolean;
  /** Embed-only: hide the top-left “Back” chrome (navigation owned by parent). Ok! */
  hideBack?: boolean;
}

type CartLine = {
  item: NormalizedItem;
  selections: Record<string, string[]>;
  qty: number;
};

function selectionsLabel(menu: NormalizedMenu, selections: Record<string, string[]>): string {
  const parts: string[] = [];
  for (const [gid, ids] of Object.entries(selections)) {
    const g = menu.modifierGroups[gid];
    if (!g) continue;
    for (const id of ids) {
      const o = g.options.find((x) => x.id === id);
      if (o) parts.push(o.name);
    }
  }
  return parts.join(', ');
}

function cartLinesEqual(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const aa = (a[k] ?? []).slice().sort().join(',');
    const bb = (b[k] ?? []).slice().sort().join(',');
    if (aa !== bb) return false;
  }
  return true;
}

const COMPACT_MODAL_MQ = '(max-width: 767px)';

/** Phones / narrow screens: start in mobile-style preview; wider viewports default to web (toggle still available). */
function getDefaultCustomerPreviewMode(): 'web' | 'mobile' {
  if (typeof window === 'undefined') return 'web';
  return window.matchMedia(COMPACT_MODAL_MQ).matches ? 'mobile' : 'web';
}

function subscribeCompactModalMq(onChange: () => void) {
  const mq = window.matchMedia(COMPACT_MODAL_MQ);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getCompactModalSnapshot() {
  return window.matchMedia(COMPACT_MODAL_MQ).matches;
}

function getCompactModalServerSnapshot() {
  return false;
}

export const CustomerPreview: React.FC<CustomerPreviewProps> = ({
  onBack,
  autoStartDemo,
  onAutoStartDemoConsumed,
  embedded = false,
  hideBack = false,
}) => {
  const {
    menu,
    activeChannel,
    activeScenario,
    setActiveScenario,
    activeStepIndex,
    sessionPortalUrl,
  } = useStore();

  const [activeCategory, setActiveCategory] = useState<NormalizedCategory | null>(
    menu?.categories.find((c) => c.enabled) ?? null,
  );
  const [selectedItem, setSelectedItem] = useState<NormalizedItem | null>(null);
  const [commentItem, setCommentItem] = useState<NormalizedItem | null>(null);

  // When the menu reference changes (price-band switch re-normalizes it),
  // re-resolve cached category/item refs by id so the visible prices update.
  useEffect(() => {
    if (!menu) return;
    setActiveCategory((prev) => {
      if (!prev) return menu.categories.find((c) => c.enabled) ?? null;
      const next = menu.categories.find((c) => c.id === prev.id);
      return next ?? menu.categories.find((c) => c.enabled) ?? null;
    });
    setSelectedItem((prev) => {
      if (!prev) return null;
      for (const cat of menu.categories) {
        const found = cat.items.find((i) => i.id === prev.id);
        if (found) return found;
      }
      return null;
    });
  }, [menu]);

  // Session sharing / submission (mirrors compare view)
  const allCommentsForSessionRaw = useAllComments();
  // Defensive scope: only consider comments that belong to the currently
  // loaded menu. Anything left over in memory from a prior session is
  // dropped so it can't leak into shared session links or counts.
  const allCommentsForSession = allCommentsForSessionRaw.filter(
    (c) => c.menuId === menu?.id,
  );
  const unresolvedCount = allCommentsForSession.filter((c) => !c.resolved).length;
  const [shareSessionId, setShareSessionId] = useState<string | null>(getSessionIdFromUrl());
  const [savingSession, setSavingSession] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [portalUrl, setPortalUrl] = useState('');
  const [portalModalOpen, setPortalModalOpen] = useState(false);
  const [portalFlashing, setPortalFlashing] = useState(false);

  const flashPortalButton = useCallback(() => {
    setPortalFlashing(true);
    window.setTimeout(() => setPortalFlashing(false), 5000);
  }, []);
  const isReviewSession = getSessionIdFromUrl() !== null;
  const isAdminViewer =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('admin') === 'true' || !isReviewSession);
  const isClientReview = isReviewSession && !isAdminViewer;
  const [modifierSelections, setModifierSelections] = useState<Record<string, string[]>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [previewMode, setPreviewMode] = useState<'web' | 'mobile'>(() => getDefaultCustomerPreviewMode());
  const [itemDetailTab, setItemDetailTab] = useState<'description' | 'allergens'>('description');
  /** One modifier group per screen (web/app ordering). */
  const [modifierFlowStepIndex, setModifierFlowStepIndex] = useState(0);
  const [sectionOpen, setSectionOpen] = useState(true);
  /** Mobile preview: expand line items above the bottom checkout dock. */
  const [mobileBasketExpanded, setMobileBasketExpanded] = useState(false);

  /** True on phone-sized viewports even when preview toggle is "web" — item modal uses compact sheet + small hero. */
  const narrowViewport = useSyncExternalStore(
    subscribeCompactModalMq,
    getCompactModalSnapshot,
    getCompactModalServerSnapshot,
  );
  const sheetCompact = previewMode === 'mobile' || narrowViewport;

  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const itemsListRef = useRef<HTMLDivElement>(null);

  const scrollSelectorIntoView = useCallback((selector: string, root?: HTMLElement | null) => {
    const rootEl = root ?? document;
    const el = rootEl.querySelector(selector) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, []);

  // "Locate target" from the Comments overview pushes a highlightedItem into
  // the store. Switch to the parent category and scroll the item into view so
  // the reviewer lands directly on the commented item.
  const highlightedItem = useStore((s) => s.highlightedItem);
  const setHighlightedItem = useStore((s) => s.setHighlightedItem);
  useEffect(() => {
    if (!menu || !highlightedItem) return;
    // Comments stored in compare mode are slot-prefixed; normalize so a
    // locate-target from any source lands here when the underlying menu matches.
    const target = highlightedItem.menuId;
    const matchesThisMenu =
      target === menu.id || target === `A:${menu.id}` || target === `B:${menu.id}`;
    if (!matchesThisMenu) return;

    const parent = menu.categories.find((cat) =>
      cat.items.some((i) => i.id === highlightedItem.itemId),
    );
    if (!parent) {
      setHighlightedItem(null);
      return;
    }
    setActiveCategory(parent);
    const itemId = highlightedItem.itemId;
    setTimeout(() => {
      scrollSelectorIntoView(
        `[data-demo-item="${itemId}"]`,
        itemsListRef.current ?? undefined,
      );
      const el = document.querySelector(
        `[data-demo-item="${itemId}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.classList.add('ring-4', 'ring-amber-400', 'transition-all', 'duration-300');
        setTimeout(() => {
          el.classList.remove('ring-4', 'ring-amber-400', 'transition-all', 'duration-300');
        }, 2500);
      }
    }, 150);
    setHighlightedItem(null);
  }, [highlightedItem, menu, scrollSelectorIntoView, setHighlightedItem]);

  // Save the current menu + comments as a shareable session. Mirrors the
  // compare-view flow so the email/share link points to a unique session
  // URL instead of the bare site root.
  const persistCustomerSession = useCallback(
    async (openShareModal: boolean): Promise<string | null> => {
      if (!menu) return null;
      setSavingSession(true);

      const payload = {
        menu_a: menu,
        menu_b: null,
        scopes: { webApp: true, pos: false },
        expires_at: computeSessionExpiry(),
        portal_url: portalUrl || null,
      };

      const finishLocally = (): string => {
        const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newSession = {
          id: localId,
          menuA: menu,
          menuB: null,
          scopes: { webApp: true, pos: false },
          createdAt: Date.now(),
          portalUrl: portalUrl || null,
        };
        const raw = window.localStorage.getItem('mjr_local_sessions_v1');
        const existing: any[] = raw ? JSON.parse(raw) : [];
        existing.push(newSession);
        window.localStorage.setItem('mjr_local_sessions_v1', JSON.stringify(existing));
        setShareSessionId(localId);
        const url = `${window.location.origin}${window.location.pathname}?sessionId=${localId}`;
        window.history.pushState({ path: url }, '', url);
        if (openShareModal) setShareModalOpen(true);
        return localId;
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
              // Surface this loudly — otherwise the email goes out with a
              // link to a session that has no comments and the recipient
              // sees nothing.
              console.error('Failed to save comments to Supabase:', commentsError);
              alert(
                `Comments could not be saved to the cloud: ${commentsError.message ?? 'unknown error'}. The session link will work but the recipient may not see all comments.`,
              );
            }
          }

          const url = `${window.location.origin}${window.location.pathname}?sessionId=${newId}`;
          window.history.pushState({ path: url }, '', url);
          if (openShareModal) setShareModalOpen(true);
          return newId;
        } catch (err) {
          console.error('Error saving session to Supabase:', err);
          alert('Failed to save session to the cloud. Falling back to local storage.');
          return finishLocally();
        } finally {
          setSavingSession(false);
        }
      }

      const id = finishLocally();
      setSavingSession(false);
      return id;
    },
    [menu, allCommentsForSession, portalUrl, setSavingSession],
  );

  const handleSaveAndShare = useCallback(() => {
    if (!portalUrl) {
      flashPortalButton();
      return;
    }
    void persistCustomerSession(true);
  }, [persistCustomerSession, portalUrl, flashPortalButton]);

  const handleOpenSubmitModal = useCallback(async () => {
    if (!shareSessionId && menu) {
      await persistCustomerSession(false);
    }
    setSubmitModalOpen(true);
  }, [shareSessionId, menu, persistCustomerSession]);

  const pushCartLine = useCallback((item: NormalizedItem, selections: Record<string, string[]>) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.item.id === item.id && cartLinesEqual(l.selections, selections));
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...c, { item, selections: { ...selections }, qty: 1 }];
    });
  }, []);

  useEffect(() => {
    if (!selectedItem) {
      setModifierSelections({});
      setModifierFlowStepIndex(0);
      return;
    }
    setModifierSelections({});
    setItemDetailTab('description');
    setModifierFlowStepIndex(0);
  }, [selectedItem?.id]);

  useEffect(() => {
    if (!selectedItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItem?.id]);

  useEffect(() => {
    if (cart.length === 0) setMobileBasketExpanded(false);
  }, [cart.length]);

  const startDemo = useCallback(() => {
    if (!menu) return;
    setCart([]);
    setSelectedItem(null);
    setModifierSelections({});
    const first = menu.categories.find((c) => c.enabled) ?? null;
    setActiveCategory(first);
    setActiveScenario(buildCustomerDemoScenario(menu));
  }, [menu, setActiveScenario]);

  useEffect(() => {
    if (!autoStartDemo) return;
    startDemo();
    onAutoStartDemoConsumed?.();
  }, [autoStartDemo, startDemo, onAutoStartDemoConsumed]);

  const currentDemoStep = activeScenario?.type === 'customer' ? activeScenario.steps[activeStepIndex] : undefined;

  const isDemoHighlightCategory = (categoryId: string) =>
    currentDemoStep?.action === 'spotlightCategories' ||
    (currentDemoStep?.action === 'openCategory' && currentDemoStep.targetId === categoryId);

  const isDemoHighlightItem = (itemId: string) => {
    if (currentDemoStep?.action === 'spotlightItems') return true;
    if (currentDemoStep?.action === 'spotlightModifiers') {
      if (currentDemoStep.targetId !== itemId) return false;
      if (!menu || !selectedItem || selectedItem.id !== itemId) return true;
      const g = modifierGroupsForItem(menu, selectedItem);
      const sheetOpen = g.length > 0 && itemHasResolvableModifiers(menu, selectedItem);
      return !sheetOpen;
    }
    return currentDemoStep?.action === 'selectItem' && currentDemoStep.targetId === itemId;
  };

  const isDemoHighlightBasket =
    currentDemoStep?.action === 'openCart' || currentDemoStep?.action === 'spotlightBasket';

  const isDemoSpotlightModifiersStep = currentDemoStep?.action === 'spotlightModifiers';

  useEffect(() => {
    if (!menu || activeScenario?.type !== 'customer' || !currentDemoStep || activeStepIndex < 0) {
      return;
    }

    const run = window.setTimeout(() => {
      switch (currentDemoStep.action) {
        case 'spotlightCategories': {
          setSectionOpen(true);
          setCart([]);
          setSelectedItem(null);
          setModifierSelections({});
          const fc = menu.categories.find((c) => c.enabled);
          if (fc) {
            setActiveCategory(fc);
            scrollSelectorIntoView('[data-demo-category-strip]');
          }
          break;
        }
        case 'spotlightItems': {
          setSectionOpen(true);
          setSelectedItem(null);
          setModifierSelections({});
          const fc = menu.categories.find((c) => c.enabled && c.items.some((i) => i.enabled));
          if (fc) {
            setActiveCategory(fc);
            scrollSelectorIntoView('[data-demo-items-region]');
          }
          break;
        }
        case 'spotlightModifiers': {
          setSectionOpen(true);
          const itemId = currentDemoStep.targetId;
          if (!itemId) break;
          const item = findItemById(menu, itemId);
          if (!item?.enabled) break;
          const parent = findCategoryContainingItem(menu, item.id);
          if (parent) setActiveCategory(parent);
          const groups = modifierGroupsForItem(menu, item);
          if (groups.length > 0 && itemHasResolvableModifiers(menu, item)) {
            setSelectedItem(item);
            setModifierFlowStepIndex(0);
            setModifierSelections(pickDemoModifierSelections(menu, item));
            window.setTimeout(() => {
              scrollSelectorIntoView('[data-demo-modifiers-region]');
            }, 200);
          } else {
            setSelectedItem(item);
            setModifierFlowStepIndex(0);
            setModifierSelections({});
            window.setTimeout(() => {
              scrollSelectorIntoView(`[data-demo-item="${itemId}"]`, itemsListRef.current ?? undefined);
            }, 120);
          }
          break;
        }
        case 'spotlightBasket': {
          const itemId = currentDemoStep.targetId;
          const item = itemId ? findItemById(menu, itemId) : null;
          if (!item?.enabled) break;
          setSelectedItem(null);
          setModifierSelections({});
          setMobileBasketExpanded(true);
          const picks = pickDemoModifierSelections(menu, item);
          pushCartLine(item, picks);
          window.setTimeout(() => {
            scrollSelectorIntoView('[data-demo-basket]');
          }, 120);
          break;
        }
        case 'goToScreen': {
          setCart([]);
          setSelectedItem(null);
          setModifierSelections({});
          const fc = menu.categories.find((c) => c.enabled);
          if (fc) {
            setActiveCategory(fc);
            scrollSelectorIntoView(`[data-demo-category="${fc.id}"]`, categoryScrollRef.current);
          }
          break;
        }
        case 'openCategory': {
          if (!currentDemoStep.targetId) break;
          const cat = menu.categories.find((c) => c.id === currentDemoStep.targetId);
          if (cat) {
            setActiveCategory(cat);
            scrollSelectorIntoView(
              `[data-demo-category="${currentDemoStep.targetId}"]`,
              categoryScrollRef.current,
            );
          }
          break;
        }
        case 'selectItem': {
          if (!currentDemoStep.targetId) break;
          const item = findItemById(menu, currentDemoStep.targetId);
          if (!item?.enabled) break;
          const parent = findCategoryContainingItem(menu, item.id);
          if (parent) setActiveCategory(parent);
          setSelectedItem(item);
          scrollSelectorIntoView(
            `[data-demo-item="${currentDemoStep.targetId}"]`,
            itemsListRef.current ?? undefined,
          );
          break;
        }
        case 'chooseModifier': {
          if (!currentDemoStep.targetId) break;
          const item = findItemById(menu, currentDemoStep.targetId);
          if (!item?.enabled) break;
          const parent = findCategoryContainingItem(menu, item.id);
          if (parent) setActiveCategory(parent);
          setSelectedItem(item);
          const groups = modifierGroupsForItem(menu, item);
          if (currentDemoStep.modifierGroupId) {
            const gi = groups.findIndex((g) => g.id === currentDemoStep.modifierGroupId);
            if (gi >= 0) setModifierFlowStepIndex(gi);
            setModifierSelections((prev) => ({
              ...prev,
              ...pickDemoModifierSelectionsForGroup(menu, item, currentDemoStep.modifierGroupId!),
            }));
          } else {
            setModifierFlowStepIndex(0);
            setModifierSelections(pickDemoModifierSelections(menu, item));
          }
          break;
        }
        case 'addToCart': {
          const itemId = currentDemoStep.targetId;
          const item = itemId ? findItemById(menu, itemId) : null;
          if (!item?.enabled) break;
          const picks = pickDemoModifierSelections(menu, item);
          pushCartLine(item, picks);
          setSelectedItem(null);
          setModifierSelections({});
          break;
        }
        case 'openCart':
          scrollSelectorIntoView('[data-demo-basket]');
          break;
        default:
          break;
      }
    }, 60);

    return () => window.clearTimeout(run);
  }, [
    activeScenario?.id,
    activeScenario?.type,
    activeStepIndex,
    currentDemoStep?.action,
    currentDemoStep?.id,
    currentDemoStep?.targetId,
    currentDemoStep?.modifierGroupId,
    menu,
    activeChannel,
    scrollSelectorIntoView,
    pushCartLine,
  ]);

  const toggleModifier = (group: NormalizedModifierGroup, optionId: string) => {
    if (!selectedItem || !menu) return;
    const gid = group.id;

    // Compute the next selections state, then drop entries for any nested
    // conditional groups that are no longer reachable — otherwise stale
    // picks inside a hidden sub-group would silently satisfy validation.
    const pruneToActive = (next: Record<string, string[]>) => {
      const active = new Set(
        modifierGroupsForItem(menu, selectedItem, next).map((g) => g.id),
      );
      const cleaned: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(next)) {
        if (active.has(k)) cleaned[k] = v;
      }
      return cleaned;
    };

    setModifierSelections((prev) => {
      const current = prev[gid] ?? [];
      let next: Record<string, string[]>;
      if (group.maxSelection <= 1) {
        next = { ...prev, [gid]: [optionId] };
      } else if (current.includes(optionId)) {
        next = { ...prev, [gid]: current.filter((id) => id !== optionId) };
      } else if (current.length >= group.maxSelection) {
        return prev;
      } else {
        next = { ...prev, [gid]: [...current, optionId] };
      }
      return pruneToActive(next);
    });
  };

  const handleAddToCart = () => {
    if (!menu || !selectedItem) return;
    if (!modifiersValidForItem(menu, selectedItem, modifierSelections)) return;
    pushCartLine(selectedItem, { ...modifierSelections });
    setSelectedItem(null);
    setModifierSelections({});
  };

  const setLineQty = (index: number, qty: number) => {
    if (qty < 1) {
      setCart((c) => c.filter((_, i) => i !== index));
      return;
    }
    setCart((c) => c.map((line, i) => (i === index ? { ...line, qty } : line)));
  };

  const tryQuickAdd = (e: React.MouseEvent, item: NormalizedItem) => {
    e.stopPropagation();
    if (!menu) return;
    const empty: Record<string, string[]> = {};
    if (!modifiersValidForItem(menu, item, empty)) {
      setSelectedItem(item);
      return;
    }
    pushCartLine(item, empty);
  };

  if (!menu) return null;

  const isMobile = previewMode === 'mobile';
  const lineUnit = (line: CartLine) => lineTotal(menu, line.item, line.selections, activeChannel);
  const cartTotal = cart.reduce((sum, line) => sum + lineUnit(line) * line.qty, 0);
  const accentRing = 'ring-2 ring-neutral-900 ring-offset-2';

  const itemModifierGroups =
    selectedItem ? modifierGroupsForItem(menu, selectedItem, modifierSelections) : [];
  const safeModStep = Math.min(
    modifierFlowStepIndex,
    Math.max(0, itemModifierGroups.length - 1),
  );
  const currentModifierGroup =
    itemModifierGroups.length > 0 ? itemModifierGroups[safeModStep] : undefined;
  const isLastModifierStep =
    itemModifierGroups.length > 0 && safeModStep === itemModifierGroups.length - 1;
  const canContinueModifierStep =
    Boolean(currentModifierGroup) &&
    modifierGroupStepValid(currentModifierGroup!, modifierSelections);
  const canAddItemNoModifiers =
    Boolean(selectedItem) &&
    itemModifierGroups.length === 0 &&
    modifiersValidForItem(menu, selectedItem!, modifierSelections);
  const canAddItemWithModifiers =
    Boolean(selectedItem) &&
    itemModifierGroups.length > 0 &&
    isLastModifierStep &&
    modifiersValidForItem(menu, selectedItem!, modifierSelections);

  const demoItemsRegionRing =
    activeScenario?.type === 'customer' && currentDemoStep?.action === 'spotlightItems';

  const demoModifiersRegionRing =
    activeScenario?.type === 'customer' &&
    isDemoSpotlightModifiersStep &&
    itemModifierGroups.length > 0 &&
    Boolean(currentModifierGroup);

  const demoItemDetailTourRing =
    activeScenario?.type === 'customer' &&
    isDemoSpotlightModifiersStep &&
    itemModifierGroups.length === 0;

  /** Bottom padding so list content clears the fixed validation dock under the phone preview. */
  const itemsBottomPadding = activeScenario
    ? isMobile
      ? 'pb-4'
      : cart.length > 0
        ? 'pb-28 md:pb-24'
        : 'pb-24 md:pb-20'
    : isMobile
      ? 'pb-4'
      : 'pb-8';

  const scrollCatsForward = () => {
    categoryScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  };

  const orderTypeLabel = activeChannel;

  const renderCategoryPills = () => (
    <div
      className="border-b border-neutral-200 bg-white"
      data-demo-category-strip
      data-tour-anchor="tour-categories"
    >
      <div ref={categoryScrollRef} className="overflow-x-auto">
        <div className="flex min-w-max items-center gap-2 px-4 py-3 sm:px-5">
        {menu.categories
          .filter((c) => c.enabled)
          .map((cat) => {
            const active = activeCategory?.id === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                data-demo-category={cat.id}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors sm:text-sm ${
                  active
                    ? 'border-neutral-900 text-neutral-900'
                    : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300'
                } ${isDemoHighlightCategory(cat.id) ? accentRing : ''}`}
              >
                {cat.name}
              </button>
            );
          })}
        <button
          type="button"
          onClick={scrollCatsForward}
          className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          aria-label="Scroll categories"
        >
          <ChevronRight size={18} strokeWidth={1.75} />
        </button>
        </div>
      </div>
    </div>
  );

  const renderItemCard = (item: NormalizedItem) => {
    const price = item.prices[activeChannel]?.toFixed(2);
    const drs = item.drsCharge;
    const hi = isDemoHighlightItem(item.id);

    if (isMobile) {
      return (
        <button
          key={item.id}
          type="button"
          data-demo-item={item.id}
          onClick={() => setSelectedItem(item)}
          className={`relative flex w-full items-stretch gap-3 border border-neutral-200 bg-white p-3 text-left transition-shadow hover:shadow-sm ${
            hi ? accentRing : ''
          }`}
        >
          {menu ? (
            <CommentButton
              menuId={menu.id}
              itemId={item.id}
              onClick={() => setCommentItem(item)}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-neutral-900">{item.name}</h3>
            {item.description ? (
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-neutral-500">{item.description}</p>
            ) : null}
            <div className="mt-3 flex items-center gap-1 text-sm font-semibold tabular-nums text-neutral-900">
              €{price}
              {drs ? <span className="text-xs font-medium text-neutral-500">+{drs === 0.25 ? '25c' : '15c'} DRS</span> : null}
              <ChevronRight size={14} className="text-neutral-400" aria-hidden />
            </div>
          </div>
          <div className="relative shrink-0">
            {item.imageUrl ? (
              <div className="h-[88px] w-[88px] overflow-hidden border border-neutral-100 bg-neutral-50">
                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-[88px] w-[88px] items-center justify-center border border-neutral-100 bg-neutral-50 text-neutral-200">
                <ShoppingCart size={28} strokeWidth={1} />
              </div>
            )}
            <button
              type="button"
              onClick={(e) => tryQuickAdd(e, item)}
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition-transform hover:scale-105 active:scale-95"
              aria-label={`Add ${item.name}`}
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
          </div>
        </button>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        data-demo-item={item.id}
        onClick={() => setSelectedItem(item)}
        className={`relative flex w-full gap-3 border border-neutral-200 bg-white p-4 text-left transition-shadow hover:shadow-sm ${
          hi ? accentRing : ''
        }`}
      >
        {menu ? (
          <CommentButton
            menuId={menu.id}
            itemId={item.id}
            onClick={() => setCommentItem(item)}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-sm font-semibold text-neutral-900 sm:text-base">{item.name}</h3>
          {item.description ? (
            <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-neutral-500">{item.description}</p>
          ) : null}
          <div className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold tabular-nums text-neutral-900">
            €{price}
            {drs ? <span className="text-xs font-medium text-neutral-500">+{drs === 0.25 ? '25c' : '15c'} DRS</span> : null}
            <ChevronRight size={16} className="text-neutral-400" aria-hidden />
          </div>
        </div>
        <div className="relative w-[120px] shrink-0 sm:w-[140px]">
          {item.imageUrl ? (
            <div className="aspect-square w-full overflow-hidden border border-neutral-100 bg-neutral-50">
              <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex aspect-square w-full items-center justify-center border border-neutral-100 bg-neutral-50 text-neutral-200">
              <ShoppingCart size={36} strokeWidth={1} />
            </div>
          )}
          <button
            type="button"
            onClick={(e) => tryQuickAdd(e, item)}
            className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md transition-transform hover:scale-105 active:scale-95"
            aria-label={`Add ${item.name}`}
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>
      </button>
    );
  };

  const renderBasketPanel = (variant: 'sidebar' | 'mobile_bar') => {
    const inner = (
      <>
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="relative text-neutral-900">
              <ShoppingCart size={22} strokeWidth={1.75} />
              {cart.length > 0 ? (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-bold text-white">
                  {cart.reduce((n, l) => n + l.qty, 0)}
                </span>
              ) : null}
            </div>
            <span className="text-sm font-semibold text-neutral-900">Basket</span>
          </div>
        </div>
        <div
          className={
            embedded
              ? 'px-4 py-3'
              : 'max-h-[min(50vh,420px)] overflow-y-auto px-4 py-3'
          }
        >
          {cart.length === 0 ? (
            <p className="text-center text-sm text-neutral-400">Your basket is empty</p>
          ) : (
            <ul className="space-y-4">
              {cart.map((line, idx) => {
                const sub = lineUnit(line) * line.qty;
                const mods = selectionsLabel(menu, line.selections);
                return (
                  <li key={`${line.item.id}-${idx}`} className="border-b border-neutral-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">{line.item.name}</p>
                        {mods ? <p className="mt-1 text-xs text-neutral-500">{mods}</p> : null}
                        <p className="mt-1 text-sm font-semibold tabular-nums text-neutral-900">€{sub.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1">
                      <button
                        type="button"
                        onClick={() => setLineQty(idx, line.qty - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-700 hover:bg-white"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => setLineQty(idx, line.qty + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-700 hover:bg-white"
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {cart.length > 0 ? (
          <div className="border-t border-neutral-200 p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between bg-neutral-900 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
            >
              <span>Checkout</span>
              <span className="tabular-nums">€{cartTotal.toFixed(2)}</span>
            </button>
          </div>
        ) : null}
      </>
    );

    if (variant === 'sidebar') {
      return (
        <aside
          className="flex w-full shrink-0 flex-col border-l border-neutral-200 bg-white lg:w-[300px]"
          data-tour-anchor="tour-basket"
        >
          <button
            type="button"
            className="flex w-full items-center justify-between border-b border-neutral-200 px-4 py-3 text-left text-sm text-neutral-800 hover:bg-neutral-50"
          >
            <span className="flex items-center gap-2">
              <User size={18} strokeWidth={1.75} className="text-neutral-500" />
              Log In
            </span>
            <ChevronRight size={16} className="text-neutral-400" />
          </button>
          <div data-demo-basket className={`flex flex-1 flex-col ${isDemoHighlightBasket ? accentRing : ''}`}>
            {inner}
          </div>
        </aside>
      );
    }

    const mobileQty = cart.reduce((n, l) => n + l.qty, 0);
    const dockRing = isDemoHighlightBasket ? accentRing : '';

    if (cart.length === 0) {
      return (
        <div
          data-demo-basket
          data-tour-anchor="tour-basket"
          className={`sticky bottom-0 z-[110] w-full shrink-0 border-t border-neutral-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)] ${dockRing}`}
        >
          <div className="flex h-12 items-center justify-between px-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                <ShoppingCart size={18} strokeWidth={1.75} />
              </span>
              <span className="text-sm font-semibold text-neutral-900">Basket</span>
            </div>
            <span className="text-xs font-medium text-neutral-400">Empty</span>
          </div>
        </div>
      );
    }

    return (
      <div
        data-demo-basket
        data-tour-anchor="tour-basket"
        className={`sticky bottom-0 z-[110] w-full shrink-0 border-t border-neutral-200 bg-white shadow-[0_-6px_24px_rgba(0,0,0,0.08)] ${dockRing}`}
      >
        {mobileBasketExpanded ? (
          <div
            className={
              embedded
                ? 'border-b border-neutral-200 bg-white px-3 py-3'
                : 'max-h-[min(42vh,280px)] overflow-y-auto border-b border-neutral-200 bg-white px-3 py-3'
            }
          >
            <ul className="space-y-3">
              {cart.map((line, idx) => {
                const sub = lineUnit(line) * line.qty;
                const mods = selectionsLabel(menu, line.selections);
                return (
                  <li
                    key={`${line.item.id}-${idx}`}
                    className="border-b border-neutral-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">{line.item.name}</p>
                        {mods ? <p className="mt-0.5 text-xs text-neutral-500">{mods}</p> : null}
                        <p className="mt-1 text-sm font-semibold tabular-nums text-neutral-900">
                          €{sub.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => setLineQty(idx, line.qty - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-700 hover:bg-white"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums text-neutral-900">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLineQty(idx, line.qty + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-700 hover:bg-white"
                        aria-label="Increase quantity"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="flex h-14 w-full min-w-0 border-t border-neutral-100 bg-white">
          <button
            type="button"
            onClick={() => setMobileBasketExpanded((e) => !e)}
            className="flex min-w-0 flex-1 items-center gap-2.5 border-r border-neutral-200 bg-white px-3 text-left transition-colors hover:bg-neutral-50"
            aria-expanded={mobileBasketExpanded}
            aria-label={mobileBasketExpanded ? 'Hide basket details' : 'Show basket details'}
          >
            {mobileBasketExpanded ? (
              <ChevronDown size={20} className="shrink-0 text-neutral-500" aria-hidden />
            ) : (
              <ChevronUp size={20} className="shrink-0 text-neutral-500" aria-hidden />
            )}
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
              <ShoppingCart size={18} strokeWidth={1.75} />
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-0.5 text-[10px] font-bold text-neutral-900 ring-1 ring-neutral-200">
                {mobileQty}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between gap-2 bg-neutral-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            <span>Checkout</span>
            <span className="tabular-nums">€{cartTotal.toFixed(2)}</span>
          </button>
        </div>
      </div>
    );
  };

  const storeBlock = (
    <>
      <div className="border-b border-neutral-200 bg-white px-4 py-4 sm:px-5">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">{menu.name}</h1>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex min-w-0 items-start gap-3">
            <Store size={20} className="mt-0.5 shrink-0 text-neutral-500" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900">{orderTypeLabel}</p>
              <p className="mt-2 flex items-start gap-2 text-xs text-neutral-600 sm:text-sm">
                <MapPin size={14} className="mt-0.5 shrink-0 text-neutral-400" />
                <span>{menu.description?.trim() || 'Pickup at restaurant — address from your store settings'}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
      {renderCategoryPills()}
    </>
  );

  const shellMobile = embedded
    ? 'min-h-full w-full max-w-md flex-1 overflow-visible shadow-2xl'
    : 'h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] min-h-0 max-w-md flex-1 overflow-hidden shadow-2xl sm:h-[calc(100dvh-4.5rem)] sm:max-h-[calc(100dvh-4.5rem)]';
  const shellDesktop = embedded
    ? 'min-h-full max-w-6xl flex-1 overflow-visible rounded-lg border border-neutral-200 shadow-sm'
    : 'min-h-[calc(100dvh-4rem)] max-w-6xl border-x border-neutral-200 shadow-sm sm:min-h-[calc(100vh-4.5rem)] md:my-3 md:rounded-lg md:border md:shadow-md';

  return (
    <div
      className={`@container relative mx-auto flex w-full min-w-0 flex-col bg-white font-sans ${
        isMobile ? shellMobile : shellDesktop
      }`}
      style={{ fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2.5 sm:px-4">
        {hideBack ? (
          <div className="shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Web / App preview
          </div>
        ) : (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-700 transition-colors hover:text-neutral-900"
          >
            ← Back
          </button>
        )}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div
            className="mr-1 flex rounded-full border border-neutral-200 bg-neutral-50 p-0.5"
            role="group"
            aria-label="Preview layout"
          >
            <button
              type="button"
              onClick={() => setPreviewMode('web')}
              title="Web menu"
              aria-label="Web layout"
              aria-pressed={!isMobile}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                !isMobile ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Monitor size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('mobile')}
              title="Mobile menu"
              aria-label="Mobile layout"
              aria-pressed={isMobile}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                isMobile ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Smartphone size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <PriceBandSelector />
          {sessionPortalUrl && (
            <a
              href={sessionPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-portal-link
              className="inline-flex items-center gap-1.5 rounded-full bg-flipdish px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-flipdish-hover"
              title={sessionPortalUrl}
            >
              <LinkIcon size={12} />
              <span>Open in Portal</span>
            </a>
          )}

          {unresolvedCount > 0 && (
            <button
              type="button"
              onClick={handleOpenSubmitModal}
              className="relative inline-flex items-center gap-1.5 rounded-full bg-flipdish px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-flipdish-dark"
              title={`Submit ${unresolvedCount} review${unresolvedCount === 1 ? '' : 's'}`}
            >
              <Mail size={12} />
              <span className="hidden sm:inline">Submit Reviews</span>
              <span className="sm:hidden">({unresolvedCount})</span>
              <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              </span>
            </button>
          )}

          {!isClientReview && (
            <>
              <button
                type="button"
                onClick={() => setPortalModalOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  portalUrl
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
                } ${portalFlashing ? 'animate-[ringFlashFast_0.35s_ease-in-out_infinite]' : ''}`}
                title={portalUrl || 'Add the Flipdish Portal link for this menu'}
              >
                <LinkIcon size={12} />
                <span className="hidden sm:inline">{portalUrl ? 'Portal Link ✓' : 'Portal Link'}</span>
              </button>
              <button
                type="button"
                onClick={handleSaveAndShare}
                disabled={savingSession}
                aria-disabled={!portalUrl}
                className={`relative inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-40 ${
                  !portalUrl ? 'opacity-40' : !shareSessionId ? 'animate-[ringFlash_1.1s_ease-in-out_infinite] ring-offset-2' : ''
                }`}
                title="Save & share link"
              >
                <Share2 size={12} />
                <span className="hidden sm:inline">{savingSession ? 'Saving…' : 'Save & Share'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={startDemo}
            className="rounded-full p-2 text-neutral-900 transition-colors hover:bg-neutral-100"
            title="Play demo"
          >
            <Play size={18} fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={() => {
              setCart([]);
              setSelectedItem(null);
              setModifierSelections({});
              setActiveScenario(null);
            }}
            className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-neutral-50"
            title="Reset"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {!isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {storeBlock}
          <div className="flex min-h-0 flex-1">
            <div
              ref={itemsListRef}
              data-demo-items-region
              data-tour-anchor="tour-items"
              className={`${embedded ? 'min-w-0 flex-1 overflow-visible' : 'min-h-0 min-w-0 flex-1 overflow-y-auto'} ${itemsBottomPadding} px-4 py-5 sm:px-5 ${
                demoItemsRegionRing ? accentRing : ''
              }`}
            >
              <button
                type="button"
                onClick={() => setSectionOpen((o) => !o)}
                className="mb-4 flex w-full items-center justify-between text-left"
              >
                <h2 className="text-lg font-bold uppercase tracking-wide text-neutral-900">
                  {activeCategory?.name}
                </h2>
                {sectionOpen ? (
                  <ChevronUp size={22} className="text-neutral-400" />
                ) : (
                  <ChevronDown size={22} className="text-neutral-400" />
                )}
              </button>
              {activeCategory?.description ? (
                <p className="mb-6 text-sm text-neutral-500">{activeCategory.description}</p>
              ) : null}
              {sectionOpen ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {activeCategory?.items.filter((i) => i.enabled).map((item) => renderItemCard(item))}
                </div>
              ) : null}
            </div>
            {renderBasketPanel('sidebar')}
          </div>
        </div>
      ) : (
        <div className={`flex flex-1 flex-col ${embedded ? 'overflow-visible' : 'min-h-0 overflow-hidden'}`}>
          {storeBlock}
          <div
            ref={itemsListRef}
            data-demo-items-region
            data-tour-anchor="tour-items"
            className={`${embedded ? 'flex-1 overflow-visible' : 'min-h-0 flex-1 overflow-y-auto'} px-3 py-4 ${itemsBottomPadding} ${
              demoItemsRegionRing ? accentRing : ''
            }`}
          >
            <button
              type="button"
              onClick={() => setSectionOpen((o) => !o)}
              className="mb-3 flex w-full items-center justify-between text-left"
            >
              <h2 className="text-base font-bold uppercase tracking-wide text-neutral-900">
                {activeCategory?.name}
              </h2>
              {sectionOpen ? <ChevronUp size={20} className="text-neutral-400" /> : <ChevronDown size={20} className="text-neutral-400" />}
            </button>
            {sectionOpen ? (
              <div className="flex flex-col gap-3">
                {activeCategory?.items.filter((i) => i.enabled).map((item) => renderItemCard(item))}
              </div>
            ) : null}
          </div>
          {renderBasketPanel('mobile_bar')}
        </div>
      )}

      {selectedItem && menu
        ? createPortal(
            <div
              role="presentation"
              className={`fixed inset-0 z-[200] flex justify-center bg-neutral-900/50 p-0 ${
                sheetCompact ? 'items-end' : 'items-end sm:items-center sm:p-4'
              }`}
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedItem(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="customer-item-modal-title"
                onClick={(e) => e.stopPropagation()}
                className={`flex w-full max-w-full flex-col overflow-hidden bg-white min-h-0 ${
                  embedded
                    ? sheetCompact
                      ? 'max-h-[92%] rounded-t-2xl shadow-[0_-12px_40px_rgba(0,0,0,0.18)]'
                      : 'max-h-[90%] min-h-0 sm:rounded-lg max-w-lg lg:max-w-xl'
                    : sheetCompact
                      ? 'max-h-[min(92dvh,92svh)] rounded-t-2xl shadow-[0_-12px_40px_rgba(0,0,0,0.18)]'
                      : 'max-h-[min(92dvh,92vh)] min-h-0 sm:rounded-lg max-w-lg lg:max-w-xl'
                }`}
              >
                {/* Compact mobile preview: short hero + content-height sheet (no forced 90vh empty space). */}
                <div
                  className={`relative w-full shrink-0 overflow-hidden bg-neutral-100 min-h-0 ${
                    embedded
                      ? sheetCompact
                        ? itemModifierGroups.length > 0
                          ? 'h-36 max-h-36'
                          : 'h-40 max-h-40'
                        : 'h-44 max-h-[min(14rem,30vh)] sm:h-48 sm:max-h-[min(15rem,32vh)] md:h-52'
                      : sheetCompact
                        ? itemModifierGroups.length > 0
                          ? 'h-[min(11rem,22svh)] max-h-[min(11rem,22svh)]'
                          : 'h-[min(13rem,26svh)] max-h-[min(13rem,26svh)]'
                        : 'h-44 max-h-[min(14rem,30vh)] sm:h-48 sm:max-h-[min(15rem,32vh)] md:h-52'
                  }`}
                >
                  {selectedItem.imageUrl ? (
                    <img
                      src={selectedItem.imageUrl}
                      alt=""
                      className="absolute inset-0 h-full max-h-full w-full object-cover object-center"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-300">
                      <ShoppingCart size={56} strokeWidth={1} />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-black/5 transition-colors hover:bg-neutral-50"
                    aria-label="Close"
                  >
                    <X size={22} strokeWidth={1.75} />
                  </button>
                </div>

                <div
                  className={
                    sheetCompact
                      ? 'flex min-h-0 flex-col overflow-hidden'
                      : 'flex min-h-0 flex-1 flex-col overflow-hidden'
                  }
                >
                  {itemModifierGroups.length > 0 && currentModifierGroup ? (
                    <div
                      data-demo-modifiers-region
                      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
                        demoModifiersRegionRing ? `${accentRing} rounded-xl` : ''
                      }`}
                    >
                      <div className="shrink-0 border-b border-neutral-200 px-4 pt-3 sm:px-6 sm:pt-4">
                        <div className="flex items-center gap-2">
                          {safeModStep > 0 ? (
                            <button
                              type="button"
                              onClick={() => setModifierFlowStepIndex((s) => Math.max(0, s - 1))}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-neutral-100"
                              aria-label="Previous modifier"
                            >
                              <ChevronLeft size={22} strokeWidth={1.75} />
                            </button>
                          ) : (
                            <div className="h-10 w-10 shrink-0" aria-hidden />
                          )}
                          <p className="min-w-0 flex-1 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                            Step {safeModStep + 1} of {itemModifierGroups.length}
                          </p>
                          <div className="h-10 w-10 shrink-0" aria-hidden />
                        </div>
                        <p className="mt-1 text-center text-xs text-neutral-500">{selectedItem.name}</p>
                        <h2
                          id="customer-item-modal-title"
                          className="mt-2 text-center text-lg font-bold leading-snug text-neutral-900 sm:text-xl"
                        >
                          {currentModifierGroup.name}
                        </h2>
                        <p className="mt-1 pb-3 text-center text-sm text-neutral-500">
                          {formatModifierGroupHint(currentModifierGroup)}
                        </p>
                      </div>

                      <div
                        className={
                          sheetCompact
                            ? `no-scrollbar overflow-y-auto px-4 py-3 sm:px-6 ${
                                embedded ? 'max-h-52' : 'max-h-[min(52dvh,52svh)]'
                              }`
                            : 'no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6'
                        }
                      >
                        {selectedItem.modifierGroupIds.some((gid) => {
                          const g = menu.modifierGroups[gid];
                          return !g || !g.options.some((o) => o.enabled);
                        }) ? (
                          <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                            Some modifier groups are missing from this export — review on live ordering if needed.
                          </div>
                        ) : null}
                        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
                          {currentModifierGroup.options
                            .filter((o) => o.enabled)
                            .map((option) => {
                              const selected = modifierSelections[currentModifierGroup.id] ?? [];
                              const checked = selected.includes(option.id);
                              const multi = currentModifierGroup.maxSelection > 1;
                              const extra = option.prices[activeChannel] ?? option.price;
                              return (
                                <li key={option.id}>
                                  <button
                                    type="button"
                                    onClick={() => toggleModifier(currentModifierGroup, option.id)}
                                    className="flex w-full items-center gap-4 py-4 text-left transition-colors hover:bg-neutral-50/80"
                                  >
                                    <span
                                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                                        checked ? 'border-neutral-900 bg-neutral-900' : 'border-neutral-300 bg-white'
                                      }`}
                                      aria-hidden
                                    >
                                      {checked ? (
                                        multi ? (
                                          <span className="h-2 w-2 rounded-sm bg-white" />
                                        ) : (
                                          <span className="h-2 w-2 rounded-full bg-white" />
                                        )
                                      ) : null}
                                    </span>
                                    {option.imageUrl ? (
                                      <img
                                        src={option.imageUrl}
                                        alt=""
                                        loading="lazy"
                                        className="h-10 w-10 shrink-0 rounded-md object-cover bg-neutral-100"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    ) : null}
                                    <span className="min-w-0 flex-1 text-sm font-medium text-neutral-900">
                                      {option.name}
                                    </span>
                                    {extra > 0 ? (
                                      <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-700">
                                        +€{extra.toFixed(2)}
                                      </span>
                                    ) : null}
                                    {option.drsCharge ? (
                                      <span className="shrink-0 text-xs font-medium text-neutral-500">
                                        +{option.drsCharge === 0.25 ? '25c' : '15c'}
                                      </span>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                        </ul>
                      </div>

                      <div
                        className={`shrink-0 border-t border-neutral-200 bg-white px-4 pt-4 sm:px-6 ${
                          sheetCompact ? 'pb-[max(1rem,env(safe-area-inset-bottom,0px))]' : 'pb-4'
                        }`}
                      >
                        <div className="mb-4 flex items-end justify-end gap-2">
                          <div className="text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                              Total
                            </p>
                            <p className="text-lg font-bold tabular-nums text-neutral-900">
                              €{lineTotal(menu, selectedItem, modifierSelections, activeChannel).toFixed(2)}
                            </p>
                          </div>
                        </div>
                        {isLastModifierStep ? (
                          <button
                            type="button"
                            disabled={!canAddItemWithModifiers}
                            onClick={handleAddToCart}
                            className="flex w-full items-center justify-center bg-neutral-900 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Add to basket
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canContinueModifierStep}
                            onClick={() =>
                              setModifierFlowStepIndex((s) =>
                                Math.min(s + 1, itemModifierGroups.length - 1),
                              )
                            }
                            className="flex w-full items-center justify-center bg-neutral-900 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Continue
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="shrink-0 border-b border-neutral-200 px-4 pt-3 sm:px-6 sm:pt-5">
                        <h2
                          id="customer-item-modal-title"
                          className="pr-12 text-lg font-bold text-neutral-900 sm:pr-10 sm:text-2xl"
                        >
                          {selectedItem.name}
                        </h2>
                        <div className="mt-3 flex gap-8 border-b border-transparent sm:mt-4">
                          <button
                            type="button"
                            onClick={() => setItemDetailTab('description')}
                            className={`relative pb-3 text-sm font-semibold transition-colors ${
                              itemDetailTab === 'description'
                                ? 'text-neutral-900'
                                : 'text-neutral-400 hover:text-neutral-600'
                            }`}
                          >
                            Description
                            {itemDetailTab === 'description' ? (
                              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-neutral-900" />
                            ) : null}
                          </button>
                          <button
                            type="button"
                            onClick={() => setItemDetailTab('allergens')}
                            className={`relative pb-3 text-sm font-semibold transition-colors ${
                              itemDetailTab === 'allergens'
                                ? 'text-neutral-900'
                                : 'text-neutral-400 hover:text-neutral-600'
                            }`}
                          >
                            Allergens
                            {itemDetailTab === 'allergens' ? (
                              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-neutral-900" />
                            ) : null}
                          </button>
                        </div>
                      </div>

                      <div
                        className={`${
                          sheetCompact
                            ? `no-scrollbar overflow-y-auto px-4 py-4 sm:px-6 ${
                                embedded ? 'max-h-52' : 'max-h-[min(52dvh,52svh)]'
                              }`
                            : 'no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6'
                        } ${demoItemDetailTourRing ? `${accentRing} rounded-xl` : ''}`}
                      >
                        {demoItemDetailTourRing ? (
                          <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm leading-snug text-amber-900">
                            This item has no modifier options in this export. When your live menu includes choices or
                            add-ons, customers select them in this step — double-check they match what you serve.
                          </div>
                        ) : null}
                        {itemDetailTab === 'description' ? (
                          selectedItem.description ? (
                            <p className="text-sm leading-relaxed text-neutral-600">{selectedItem.description}</p>
                          ) : (
                            <p className="text-sm text-neutral-400">No description for this item.</p>
                          )
                        ) : (
                          <p className="text-sm leading-relaxed text-neutral-600">
                            Allergen information is not included in this menu export. Check with the restaurant for
                            allergen advice.
                          </p>
                        )}

                        {selectedItem.modifierGroupIds.map((groupId) => {
                          const group = menu.modifierGroups[groupId];
                          if (group && group.options.some((o) => o.enabled)) return null;
                          return (
                            <div
                              key={groupId}
                              className="mt-6 rounded-lg border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800"
                            >
                              Modifier group details are not available in this export.
                            </div>
                          );
                        })}
                      </div>

                      <div
                        className={`shrink-0 border-t border-neutral-200 bg-white px-4 pt-4 sm:px-6 ${
                          sheetCompact ? 'pb-[max(1rem,env(safe-area-inset-bottom,0px))]' : 'pb-4'
                        }`}
                      >
                        <div className="mb-4 flex items-end justify-end gap-2">
                          <div className="text-right">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                              Total
                            </p>
                            <p className="text-lg font-bold tabular-nums text-neutral-900">
                              €{lineTotal(menu, selectedItem, modifierSelections, activeChannel).toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!canAddItemNoModifiers}
                          onClick={handleAddToCart}
                          className="flex w-full items-center justify-center bg-neutral-900 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Add to basket
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {activeScenario ? <DemoOverlay layout="customer" dock="preview" /> : null}

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

      <PortalLinkModal
        open={portalModalOpen}
        initialValue={portalUrl}
        onSave={(url) => setPortalUrl(url)}
        onClose={() => setPortalModalOpen(false)}
      />

      {shareModalOpen && shareSessionId ? (
        <ShareSessionModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          sessionId={shareSessionId}
          menuA={menu}
          menuB={null}
          scopes={{ webApp: true, pos: false }}
        />
      ) : null}

      {submitModalOpen && menu ? (
        <SubmitCommentsModal
          open={submitModalOpen}
          onClose={() => setSubmitModalOpen(false)}
          menuName={menu.name}
          menuId={menu.id}
        />
      ) : null}
    </div>
  );
};
