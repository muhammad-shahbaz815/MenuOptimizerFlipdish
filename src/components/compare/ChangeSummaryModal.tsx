'use client';
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Minus, ArrowRight, Folder, Layers } from 'lucide-react';
import type { NormalizedMenu, NormalizedItem, SalesChannel } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  oldMenu: NormalizedMenu;
  newMenu: NormalizedMenu;
  channel: SalesChannel;
}

interface ItemRef {
  item: NormalizedItem;
  categoryName: string;
}

interface PriceChange extends ItemRef {
  oldPrice: number;
  newPrice: number;
}

interface ModifierChange extends ItemRef {
  /** Modifier group names attached on the NEW menu but not the OLD one. */
  added: string[];
  /** Modifier group names attached on the OLD menu but not the NEW one. */
  removed: string[];
}

function indexByName(menu: NormalizedMenu): Map<string, ItemRef> {
  const map = new Map<string, ItemRef>();
  for (const cat of menu.categories) {
    for (const item of cat.items) {
      map.set(item.name.toLowerCase(), { item, categoryName: cat.name });
    }
  }
  return map;
}

/**
 * Modifier group ids change between uploads — match by group name so we can
 * actually compare which modifier groups are attached to "the same" item
 * across two menus.
 */
function modifierGroupNamesForItem(item: NormalizedItem, menu: NormalizedMenu): string[] {
  return item.modifierGroupIds
    .map((id) => menu.modifierGroups[id]?.name)
    .filter((n): n is string => !!n);
}

export const ChangeSummaryModal: React.FC<Props> = ({
  open,
  onClose,
  oldMenu,
  newMenu,
  channel,
}) => {
  const summary = useMemo(() => {
    const oldIndex = indexByName(oldMenu);
    const newIndex = indexByName(newMenu);

    const added: ItemRef[] = [];
    const removed: ItemRef[] = [];
    const priceChanged: PriceChange[] = [];
    const modifierChanged: ModifierChange[] = [];

    for (const [key, entry] of newIndex) {
      if (!oldIndex.has(key)) {
        added.push(entry);
        continue;
      }
      const oldEntry = oldIndex.get(key)!;

      // Price diff for the active channel.
      const oldPrice = oldEntry.item.prices[channel] ?? 0;
      const newPrice = entry.item.prices[channel] ?? 0;
      if (Math.abs(oldPrice - newPrice) > 0.001) {
        priceChanged.push({ ...entry, oldPrice, newPrice });
      }

      // Modifier group association diff. Compare by group NAME because
      // modifier group ids change between menu uploads.
      const oldGroupNames = modifierGroupNamesForItem(oldEntry.item, oldMenu);
      const newGroupNames = modifierGroupNamesForItem(entry.item, newMenu);
      const oldSet = new Set(oldGroupNames.map((n) => n.toLowerCase()));
      const newSet = new Set(newGroupNames.map((n) => n.toLowerCase()));
      const addedGroups = newGroupNames.filter((n) => !oldSet.has(n.toLowerCase()));
      const removedGroups = oldGroupNames.filter((n) => !newSet.has(n.toLowerCase()));
      if (addedGroups.length > 0 || removedGroups.length > 0) {
        modifierChanged.push({ ...entry, added: addedGroups, removed: removedGroups });
      }
    }
    for (const [key, entry] of oldIndex) {
      if (!newIndex.has(key)) removed.push(entry);
    }

    const oldCategoryNames = new Set(oldMenu.categories.map((c) => c.name.toLowerCase()));
    const newCategoryNames = new Set(newMenu.categories.map((c) => c.name.toLowerCase()));
    const addedCategories = newMenu.categories.filter((c) => !oldCategoryNames.has(c.name.toLowerCase()));
    const removedCategories = oldMenu.categories.filter((c) => !newCategoryNames.has(c.name.toLowerCase()));

    return {
      added,
      removed,
      priceChanged,
      modifierChanged,
      addedCategories,
      removedCategories,
    };
  }, [oldMenu, newMenu, channel]);

  if (!open) return null;

  const totalChanges =
    summary.added.length +
    summary.removed.length +
    summary.priceChanged.length +
    summary.modifierChanged.length +
    summary.addedCategories.length +
    summary.removedCategories.length;

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
        aria-labelledby="change-summary-title"
        className="flex w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: 'min(92vh, 92svh)' }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Old vs New
            </p>
            <h2 id="change-summary-title" className="mt-0.5 text-base font-semibold text-neutral-900">
              Summary of changes
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {totalChanges === 0
                ? 'No differences detected for this channel.'
                : `${totalChanges} change${totalChanges === 1 ? '' : 's'} on ${channel === 'DineIn' ? 'Dine-in' : channel}`}
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

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {totalChanges === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-500">
              The OLD and NEW menus match on item names, prices, and categories for this channel.
            </div>
          ) : (
            <>
              {summary.added.length > 0 && (
                <Section
                  title="Added items"
                  count={summary.added.length}
                  accent="emerald"
                  icon={<Plus size={12} strokeWidth={2.5} />}
                >
                  <ul className="divide-y divide-neutral-100">
                    {summary.added.map((e) => (
                      <li key={`add-${e.item.id}`} className="flex items-baseline justify-between gap-3 py-2">
                        <span className="text-sm font-semibold text-neutral-900">{e.item.name}</span>
                        <span className="shrink-0 text-[11px] uppercase tracking-wide text-neutral-400">
                          {e.categoryName}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {summary.removed.length > 0 && (
                <Section
                  title="Removed items"
                  count={summary.removed.length}
                  accent="rose"
                  icon={<Minus size={12} strokeWidth={2.5} />}
                >
                  <ul className="divide-y divide-neutral-100">
                    {summary.removed.map((e) => (
                      <li key={`rem-${e.item.id}`} className="flex items-baseline justify-between gap-3 py-2">
                        <span className="text-sm font-semibold text-neutral-700 line-through decoration-neutral-300">
                          {e.item.name}
                        </span>
                        <span className="shrink-0 text-[11px] uppercase tracking-wide text-neutral-400">
                          {e.categoryName}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {summary.priceChanged.length > 0 && (
                <Section
                  title="Price changes"
                  count={summary.priceChanged.length}
                  accent="amber"
                  icon={<ArrowRight size={12} strokeWidth={2.5} />}
                >
                  <ul className="divide-y divide-neutral-100">
                    {summary.priceChanged.map((e) => (
                      <li
                        key={`price-${e.item.id}`}
                        className="flex items-baseline justify-between gap-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-neutral-900">{e.item.name}</p>
                          <p className="text-[11px] uppercase tracking-wide text-neutral-400">
                            {e.categoryName}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">
                          <span className="text-neutral-400 line-through decoration-neutral-300">
                            €{e.oldPrice.toFixed(2)}
                          </span>
                          <ArrowRight size={11} className="mx-1 inline align-middle text-neutral-400" />
                          <span
                            className={
                              e.newPrice > e.oldPrice ? 'text-amber-700' : 'text-emerald-700'
                            }
                          >
                            €{e.newPrice.toFixed(2)}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {summary.modifierChanged.length > 0 && (
                <Section
                  title="Modifier changes"
                  count={summary.modifierChanged.length}
                  accent="indigo"
                  icon={<Layers size={12} strokeWidth={2.5} />}
                >
                  <ul className="divide-y divide-neutral-100">
                    {summary.modifierChanged.map((e) => (
                      <li key={`mod-${e.item.id}`} className="py-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-semibold text-neutral-900">{e.item.name}</span>
                          <span className="shrink-0 text-[11px] uppercase tracking-wide text-neutral-400">
                            {e.categoryName}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {e.added.map((g) => (
                            <span
                              key={`add-${e.item.id}-${g}`}
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                              title="Modifier group added on the NEW menu"
                            >
                              <Plus size={9} strokeWidth={2.5} />
                              {g}
                            </span>
                          ))}
                          {e.removed.map((g) => (
                            <span
                              key={`rem-${e.item.id}-${g}`}
                              className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700"
                              title="Modifier group removed from the NEW menu"
                            >
                              <Minus size={9} strokeWidth={2.5} />
                              {g}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {(summary.addedCategories.length > 0 || summary.removedCategories.length > 0) && (
                <Section
                  title="Category changes"
                  count={summary.addedCategories.length + summary.removedCategories.length}
                  accent="slate"
                  icon={<Folder size={12} strokeWidth={2.5} />}
                >
                  <ul className="space-y-1.5">
                    {summary.addedCategories.map((c) => (
                      <li
                        key={`addcat-${c.id}`}
                        className="flex items-center gap-2 text-sm text-neutral-700"
                      >
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                          New
                        </span>
                        {c.name}
                      </li>
                    ))}
                    {summary.removedCategories.map((c) => (
                      <li
                        key={`remcat-${c.id}`}
                        className="flex items-center gap-2 text-sm text-neutral-600"
                      >
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-700">
                          Removed
                        </span>
                        <span className="line-through decoration-neutral-300">{c.name}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const ACCENT_CLASSES: Record<string, { dot: string; text: string }> = {
  emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  rose: { dot: 'bg-rose-500', text: 'text-rose-700' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-700' },
  indigo: { dot: 'bg-indigo-500', text: 'text-indigo-700' },
  slate: { dot: 'bg-neutral-400', text: 'text-neutral-700' },
};

const Section: React.FC<{
  title: string;
  count: number;
  accent: 'emerald' | 'rose' | 'amber' | 'indigo' | 'slate';
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, count, accent, icon, children }) => {
  const classes = ACCENT_CLASSES[accent];
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${classes.dot}`}
        >
          {icon}
        </span>
        <h3 className={`text-sm font-semibold ${classes.text}`}>{title}</h3>
        <span className="text-xs text-neutral-400">({count})</span>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2">{children}</div>
    </section>
  );
};
