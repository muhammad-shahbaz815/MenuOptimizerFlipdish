'use client';
import React, { useMemo, useState, useEffect } from 'react';
import { ChevronRight, ShoppingCart, X } from 'lucide-react';
import type { NormalizedCategory, NormalizedItem, NormalizedMenu, SalesChannel } from '@/types';
import { CommentButton } from '../comments/CommentButton';
import { CommentsModal } from '../comments/CommentsModal';
import { findCategoryContainingItem } from '@/lib/utils/menuLookup';
import { useStore } from '@/hooks/useStore';
import { getSessionIdFromUrl } from '@/hooks/useComments';

interface DiffMeta {
  /** Set of item names (lowercase) that appear in the OTHER menu. */
  otherItemNames: Set<string>;
  /** Lowercase name →  collection price in the other menu (for delta display). */
  otherItemPrices: Map<string, number>;
  /** Set of category names (lowercase) that appear in the OTHER menu. */
  otherCategoryNames: Set<string>;
}

interface Props {
  menu: NormalizedMenu;
  channel: SalesChannel;
  /** When provided, items are tagged "Only here" / "Price differs" against the other menu. */
  diff?: DiffMeta;
  /**
   * In compare mode, the two panels often render variants of the same menu and
   * therefore share the same menu.id and item.ids. Pass 'A' or 'B' so comments
   * stay scoped to the side they were placed on. OK!
   */
  slot?: 'A' | 'B';
}

export const MenuExplorer: React.FC<Props> = ({ menu, channel, diff, slot }) => {
  const commentMenuId = slot ? `${slot}:${menu.id}` : menu.id;
  const [activeCategory, setActiveCategory] = useState<NormalizedCategory | null>(
    menu.categories.find((c) => c.enabled) ?? menu.categories[0] ?? null,
  );
  const [openItem, setOpenItem] = useState<NormalizedItem | null>(null);
  const [commentItem, setCommentItem] = useState<NormalizedItem | null>(null);
  const [commentSubTarget, setCommentSubTarget] = useState<string | null>(null);

  const highlightedItem = useStore((s) => s.highlightedItem);
  const setHighlightedItem = useStore((s) => s.setHighlightedItem);

  const { sessionSubmitted } = useStore();
  const isReviewSession = getSessionIdFromUrl() !== null;
  const isAdmin = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('admin') === 'true' || !isReviewSession);
  const isLocked = sessionSubmitted && !isAdmin;

  useEffect(() => {
    // Locate-target navigation passes the comment's stored menuId, which in
    // compare mode is slot-prefixed ("A:..." / "B:..."). Match against our
    // commentMenuId so the right side actually scrolls.
    const targetMenuId = highlightedItem?.menuId;
    const matches =
      targetMenuId != null &&
      (targetMenuId === menu.id || targetMenuId === commentMenuId);
    if (highlightedItem && matches) {
      const itemId = highlightedItem.itemId;
      const targetSubName = highlightedItem.itemName;
      let foundCategory: NormalizedCategory | null = null;
      let foundItem: NormalizedItem | null = null;

      for (const cat of menu.categories) {
        const item = cat.items.find((i) => i.id === itemId);
        if (item) {
          foundCategory = cat;
          foundItem = item;
          break;
        }
      }

      if (foundCategory && foundItem) {
        setActiveCategory(foundCategory);
        setOpenItem(foundItem);

        setTimeout(() => {
          if (targetSubName && targetSubName.includes(' > ')) {
            const subTypeAndName = targetSubName.split(' > ')[1];
            setTimeout(() => {
              const safeSubId = subTypeAndName.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
              const el = document.getElementById(`detail-${safeSubId}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-4', 'ring-amber-400', 'scale-[1.02]', 'transition-all', 'duration-300');
                setTimeout(() => {
                  el.classList.remove('ring-4', 'ring-amber-400', 'scale-[1.02]', 'transition-all', 'duration-300');
                }, 2500);
              }
            }, 300);
          } else {
            const el = document.getElementById(`item-card-${itemId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-4', 'ring-amber-400', 'scale-[1.03]', 'transition-all', 'duration-300');
              setTimeout(() => {
                el.classList.remove('ring-4', 'ring-amber-400', 'scale-[1.03]', 'transition-all', 'duration-300');
              }, 2500);
            }
          }
        }, 150);
      }

      setHighlightedItem(null);
    }
  }, [highlightedItem, menu, commentMenuId, setHighlightedItem]);

  const enabledCategories = useMemo(
    () => menu.categories.filter((c) => c.enabled || c === activeCategory),
    [menu, activeCategory],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Category strip */}
      <div className="shrink-0 border-b border-neutral-200 bg-white">
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
          {enabledCategories.map((cat) => {
            const isActive = activeCategory?.id === cat.id;
            const onlyHere = diff && !diff.otherCategoryNames.has(cat.name.toLowerCase());
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`relative shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
                title={onlyHere ? 'Only in this menu' : undefined}
              >
                {cat.name}
                {onlyHere ? (
                  <span className="ml-1.5 inline-block rounded-full bg-rose-500 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase leading-none text-white">
                    new
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Items list */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-3">
        {!activeCategory ? (
          <p className="text-center text-sm text-neutral-500">No category selected.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {activeCategory.items
              .filter((i) => i.enabled || diff)
              .map((item) => {
                const price = item.prices[channel] ?? 0;
                const lowered = item.name.toLowerCase();
                const onlyHere = diff && !diff.otherItemNames.has(lowered);
                const otherPrice = diff?.otherItemPrices.get(lowered);
                const priceDiffers =
                  diff && !onlyHere && otherPrice != null && Math.abs(otherPrice - price) > 0.001;
                const tone = onlyHere
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : priceDiffers
                    ? 'border-amber-200 bg-amber-50/40'
                    : 'border-neutral-200 bg-white';
                return (
                  <button
                    key={item.id}
                    id={`item-card-${item.id}`}
                    type="button"
                    onClick={() => setOpenItem(item)}
                    className={`group relative flex items-stretch gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-md hover:border-neutral-300 ${tone}`}
                  >
                    <CommentButton
                      menuId={commentMenuId}
                      itemId={item.id}
                      itemName={item.name}
                      onClick={() => setCommentItem(item)}
                      readOnly={isLocked}
                    />
                    
                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <h4 className="text-sm font-semibold text-neutral-900 group-hover:text-flipdish transition-colors">
                            {item.name}
                          </h4>
                          {onlyHere ? (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                              New
                            </span>
                          ) : priceDiffers ? (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                              Price diff
                            </span>
                          ) : null}
                        </div>
                        {item.description ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">
                            {item.description}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs italic text-neutral-400">No description</p>
                        )}
                      </div>
                      
                      <div className="mt-2.5 flex items-center justify-between border-t border-neutral-100/50 pt-2 text-xs font-semibold text-neutral-900">
                        <div className="flex flex-col">
                          <span className="tabular-nums text-sm text-neutral-900">€{price.toFixed(2)}</span>
                          {priceDiffers && otherPrice != null ? (
                            <span className="text-[10px] font-normal text-amber-700">
                              (other: €{otherPrice.toFixed(2)})
                            </span>
                          ) : null}
                        </div>
                        <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400 group-hover:text-neutral-700 transition-colors">
                          Customize
                          <ChevronRight size={12} className="ml-0.5" />
                        </span>
                      </div>
                    </div>

                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-neutral-200">
                          <ShoppingCart size={24} strokeWidth={1} />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            {activeCategory.items.filter((i) => i.enabled || diff).length === 0 ? (
              <p className="col-span-full rounded-lg border border-dashed border-neutral-200 bg-white px-3 py-6 text-center text-sm text-neutral-500">
                No items in this category.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Item detail panel */}
      {openItem ? (
        <ItemDetailSheet
          item={openItem}
          menu={menu}
          channel={channel}
          commentMenuId={commentMenuId}
          onClose={() => setOpenItem(null)}
          onComment={(subName) => {
            setCommentItem(openItem);
            setCommentSubTarget(subName || null);
          }}
        />
      ) : null}

      {commentItem ? (
        <CommentsModal
          open={!!commentItem}
          onClose={() => {
            setCommentItem(null);
            setCommentSubTarget(null);
          }}
          menuId={commentMenuId}
          itemId={commentItem.id}
          itemName={commentSubTarget ? `${commentItem.name} > ${commentSubTarget}` : commentItem.name}
          categoryName={findCategoryContainingItem(menu, commentItem.id)?.name}
        />
      ) : null}
    </div>
  );
};

const ItemDetailSheet: React.FC<{
  item: NormalizedItem;
  menu: NormalizedMenu;
  channel: SalesChannel;
  commentMenuId: string;
  onClose: () => void;
  onComment: (subName?: string) => void;
}> = ({ item, menu, channel, commentMenuId, onClose, onComment }) => {
  const groups = item.modifierGroupIds
    .map((id) => menu.modifierGroups[id])
    .filter((g) => g != null);

  const { sessionSubmitted } = useStore();
  const isReviewSession = getSessionIdFromUrl() !== null;
  const isAdmin = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('admin') === 'true' || !isReviewSession);
  const isLocked = sessionSubmitted && !isAdmin;

  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-white shadow-[0_-12px_30px_rgba(0,0,0,0.08)]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-neutral-900">{item.name}</h3>
          <p className="mt-0.5 text-xs font-semibold tabular-nums text-neutral-700">
            €{(item.prices[channel] ?? 0).toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!isLocked && (
            <button
              type="button"
              onClick={() => onComment()}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Comments
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {item.imageUrl ? (
          <div className="mb-3 h-32 w-full overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50">
            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        {item.description ? (
          <p className="text-sm leading-relaxed text-neutral-700">{item.description}</p>
        ) : (
          <p className="text-sm italic text-neutral-400">No description.</p>
        )}
        {groups.length > 0 ? (
          <div className="mt-4">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Modifier groups
            </h4>
            <ul className="space-y-2">
              {groups.map((g) => {
                const groupSubName = `Group: ${g.name}`;
                const groupSubId = groupSubName.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
                return (
                  <li
                    key={g.id}
                    id={`detail-${groupSubId}`}
                    className="relative rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-neutral-900">{g.name}</p>
                        <p className="text-[11px] text-neutral-500">
                          {g.minSelection === 0 && g.maxSelection === 1
                            ? 'Optional · pick up to 1'
                            : `Pick ${g.minSelection}–${g.maxSelection}`}
                        </p>
                      </div>
                      <CommentButton
                        menuId={commentMenuId}
                        itemId={item.id}
                        itemName={`${item.name} > ${groupSubName}`}
                        variant="inline"
                        size="sm"
                        onClick={() => onComment(groupSubName)}
                        readOnly={isLocked}
                      />
                    </div>
                    {g.options.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1">
                        {g.options
                          .filter((o) => o.enabled)
                          .map((o) => {
                            const optionSubName = `Option: ${o.name}`;
                            const optionSubId = optionSubName.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
                            return (
                              <li
                                key={o.id}
                                id={`detail-${optionSubId}`}
                                className="relative flex items-center gap-1.5 rounded-full bg-white pl-2 pr-1.5 py-0.5 text-[11px] text-neutral-700 ring-1 ring-neutral-200 transition-all duration-300"
                              >
                                <span>
                                  {o.name}
                                  {o.prices[channel] && o.prices[channel] !== 0
                                    ? ` · €${(o.prices[channel] ?? 0).toFixed(2)}`
                                    : ''}
                                </span>
                                <CommentButton
                                  menuId={commentMenuId}
                                  itemId={item.id}
                                  itemName={`${item.name} > ${optionSubName}`}
                                  variant="inline"
                                  size="sm"
                                  onClick={() => onComment(optionSubName)}
                                  readOnly={isLocked}
                                />
                              </li>
                            );
                          })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export type { DiffMeta };
