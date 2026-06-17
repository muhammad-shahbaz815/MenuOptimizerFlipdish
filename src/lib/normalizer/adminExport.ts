import type {
  NormalizedCategory,
  NormalizedItem,
  NormalizedMenu,
  NormalizedModifierGroup,
  NormalizedModifierOption,
  SalesChannel,
} from '@/types';
import { freshUploadId } from './freshUploadId';

const CHANNELS: SalesChannel[] = ['Collection', 'Delivery', 'DineIn', 'Takeaway'];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function strId(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  return 'unknown';
}

/** Flipdish admin / kiosk JSON export (often saved as `.txt`). */
export function isAdminMenuExport(v: unknown): boolean {
  const o = asRecord(v);
  if (!o) return false;
  return o.MenuId != null && Array.isArray(o.MenuSections);
}

function sortByDisplayOrder<T>(arr: T[], getOrder: (x: T) => number): T[] {
  return [...arr].sort((a, b) => getOrder(a) - getOrder(b));
}

export function normalizeAdminMenuExport(raw: unknown): NormalizedMenu {
  const root = asRecord(raw);
  if (!root) {
    return {
      id: 'admin-empty',
      name: 'Menu',
      categories: [],
      modifierGroups: {},
      channels: [...CHANNELS],
      metadata: {
        sourceType: 'admin',
        itemCount: 0,
        categoryCount: 0,
        warnings: ['Invalid admin menu payload.'],
      },
    };
  }

  const warnings: string[] = [];
  const menuName =
    typeof root.Name === 'string' && root.Name.trim().length > 0 ? root.Name.trim() : 'Menu';

  const modifierGroups: Record<string, NormalizedModifierGroup> = {};

  const registerOptionSet = (os: Record<string, unknown>) => {
    if (os.IsDeleted === true) return;
    const id = strId(os.MenuItemOptionSetId);
    if (modifierGroups[id]) return;

    const rawItems = Array.isArray(os.MenuItemOptionSetItems) ? os.MenuItemOptionSetItems : [];
    const sorted = sortByDisplayOrder(rawItems, (x) => num(asRecord(x)?.DisplayOrder));

    const rawMin = num(os.MinSelectCount);
    const rawMaxNum = num(os.MaxSelectCount);
    const options: NormalizedModifierOption[] = sorted
      .map((opt) => {
        const o = asRecord(opt);
        if (!o || o.IsDeleted === true) return null;
        const price = num(o.Price);
        const prices: Record<SalesChannel, number> = {
          Collection: price,
          Delivery: price,
          DineIn: price,
          Takeaway: price,
        };
        const rawImg = o.ImageUrl ?? o.imageUrl ?? o.Image ?? o.image;
        const imageUrl = typeof rawImg === 'string' && rawImg.length > 0 ? rawImg : null;
        return {
          id: strId(o.MenuItemOptionSetItemId),
          name: typeof o.Name === 'string' ? o.Name : 'Option',
          price,
          prices,
          enabled: o.IsAvailable !== false,
          ...(imageUrl ? { imageUrl } : {}),
        } satisfies NormalizedModifierOption;
      })
      .filter((x): x is NormalizedModifierOption => x !== null);

    const enabledOptions = options.filter((o) => o.enabled);
    const optionCount = enabledOptions.length;

    const min = Math.max(0, Math.floor(rawMin));
    let max: number;
    if (os.MaxSelectCount != null && !Number.isNaN(rawMaxNum)) {
      max = Math.max(0, Math.floor(rawMaxNum));
    } else if (optionCount > 0) {
      max = optionCount;
    } else {
      max = min > 0 ? min : 1;
    }
    if (max < min) max = min;

    modifierGroups[id] = {
      id,
      name: typeof os.Name === 'string' && os.Name.trim() ? os.Name.trim() : 'Options',
      isRequired: min > 0,
      minSelection: min,
      maxSelection: max,
      options,
    };
  };

  const sections = Array.isArray(root.MenuSections) ? root.MenuSections : [];
  const sortedSections = sortByDisplayOrder(sections, (x) => num(asRecord(x)?.DisplayOrder));

  for (const sec of sortedSections) {
    const s = asRecord(sec);
    if (!s || s.IsDeleted === true) continue;
    const items = Array.isArray(s.MenuItems) ? s.MenuItems : [];
    for (const it of items) {
      const item = asRecord(it);
      if (!item || item.IsDeleted === true) continue;
      const sets = Array.isArray(item.MenuItemOptionSets) ? item.MenuItemOptionSets : [];
      for (const os of sets) {
        const o = asRecord(os);
        if (o) registerOptionSet(o);
      }
    }
  }

  const categories: NormalizedCategory[] = [];

  for (const sec of sortedSections) {
    const s = asRecord(sec);
    if (!s || s.IsDeleted === true) continue;

    const sectionAvailable = s.IsAvailable !== false;
    const hiddenFromUsers = s.IsHiddenFromUsers === true;
    const catEnabled = sectionAvailable && !hiddenFromUsers;

    const itemsRaw = Array.isArray(s.MenuItems) ? s.MenuItems : [];
    const sortedItems = sortByDisplayOrder(itemsRaw, (x) => num(asRecord(x)?.DisplayOrder));

    const items: NormalizedItem[] = [];
    for (const it of sortedItems) {
      const item = asRecord(it);
      if (!item || item.IsDeleted === true) continue;

      const price = num(item.ActualPrice ?? item.Price);
      const prices: Record<SalesChannel, number> = {
        Collection: price,
        Delivery: price,
        DineIn: price,
        Takeaway: price,
      };

      const sets = Array.isArray(item.MenuItemOptionSets) ? item.MenuItemOptionSets : [];
      const modifierGroupIds = sets
        .map((os) => asRecord(os))
        .filter((os): os is Record<string, unknown> => os !== null && os.IsDeleted !== true)
        .map((os) => strId(os.MenuItemOptionSetId));

      const imageUrl =
        typeof item.ImageUrl === 'string' && item.ImageUrl.length > 0 ? item.ImageUrl : undefined;

      items.push({
        id: strId(item.MenuItemId),
        name: typeof item.Name === 'string' ? item.Name : 'Item',
        description: typeof item.Description === 'string' ? item.Description : undefined,
        enabled: item.IsAvailable !== false,
        prices,
        modifierGroupIds,
        imageUrl,
      });
    }

    categories.push({
      id: strId(s.MenuSectionId),
      name: typeof s.Name === 'string' ? s.Name : 'Category',
      description: typeof s.Description === 'string' ? s.Description : undefined,
      enabled: catEnabled,
      items,
    });
  }

  const itemCount = categories.reduce((acc, c) => acc + c.items.length, 0);

  return {
    id: freshUploadId(),
    name: menuName,
    categories,
    modifierGroups,
    channels: [...CHANNELS],
    metadata: {
      sourceType: 'admin',
      itemCount,
      categoryCount: categories.length,
      warnings,
    },
  };
}
