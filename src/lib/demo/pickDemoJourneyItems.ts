import type { NormalizedCategory, NormalizedItem, NormalizedMenu, SalesChannel } from '@/types';

export function pickDemoChannel(menu: NormalizedMenu): SalesChannel {
  if (menu.channels.includes('Takeaway')) return 'Takeaway';
  if (menu.channels.includes('Collection')) return 'Collection';
  return menu.channels[0] ?? 'Collection';
}

export function itemHasResolvableModifiers(menu: NormalizedMenu, item: NormalizedItem): boolean {
  return item.modifierGroupIds.some((id) => {
    const g = menu.modifierGroups[id];
    return Boolean(g?.options?.some((o) => o.enabled));
  });
}

function pickPreferredItem(menu: NormalizedMenu, cat: NormalizedCategory, excludeId?: string): NormalizedItem | null {
  const items = cat.items.filter((i) => i.enabled && i.id !== excludeId);
  if (items.length === 0) return null;
  return items.find((i) => itemHasResolvableModifiers(menu, i)) ?? items[0];
}

/**
 * Two categories (when possible) and two distinct items for richer demos.
 */
export function pickDemoJourneyItems(menu: NormalizedMenu): {
  cat1: NormalizedCategory;
  item1: NormalizedItem;
  cat2: NormalizedCategory;
  item2: NormalizedItem;
} | null {
  const cats = menu.categories.filter((c) => c.enabled && c.items.some((i) => i.enabled));
  if (cats.length === 0) return null;

  const cat1 = cats[0];
  const item1 = pickPreferredItem(menu, cat1);
  if (!item1) return null;

  const otherCat = cats.find((c) => c.id !== cat1.id);
  const cat2 = otherCat ?? cat1;

  let item2 = pickPreferredItem(menu, cat2, item1.id);
  if (!item2 && cat2.id === cat1.id) {
    item2 = cat1.items.find((i) => i.enabled && i.id !== item1.id) ?? null;
  }
  if (!item2) {
    item2 = pickPreferredItem(menu, cat1, item1.id);
  }
  if (!item2) return null;

  return { cat1, item1, cat2, item2 };
}

/** Category + item used to anchor the “modifiers” spotlight (prefers an item with resolvable modifiers). */
export function pickDemoTourAnchor(menu: NormalizedMenu): {
  category: NormalizedCategory;
  item: NormalizedItem;
  hasModifiers: boolean;
} | null {
  const cats = menu.categories.filter((c) => c.enabled);
  for (const cat of cats) {
    const withMods = cat.items.find((i) => i.enabled && itemHasResolvableModifiers(menu, i));
    if (withMods) return { category: cat, item: withMods, hasModifiers: true };
  }
  const cat = cats.find((c) => c.items.some((i) => i.enabled));
  const item = cat?.items.find((i) => i.enabled);
  if (!cat || !item) return null;
  return { category: cat, item, hasModifiers: false };
}
