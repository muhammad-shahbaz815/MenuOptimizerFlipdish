import type { NormalizedCategory, NormalizedItem, NormalizedMenu } from '@/types';

export function findItemById(menu: NormalizedMenu, itemId: string): NormalizedItem | null {
  for (const c of menu.categories) {
    const item = c.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return null;
}

export function findCategoryContainingItem(
  menu: NormalizedMenu,
  itemId: string,
): NormalizedCategory | null {
  return menu.categories.find((c) => c.items.some((i) => i.id === itemId)) ?? null;
}
