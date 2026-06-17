import type {
  NormalizedCategory,
  NormalizedItem,
  NormalizedMenu,
  NormalizedModifierGroup,
  NormalizedModifierOption,
  SalesChannel,
} from '@/types';
import { isAdminMenuExport } from './adminExport';
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

function strId(v: unknown, fallback: string): string {
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  return fallback;
}

/**
 * Classic Flipdish menu JSON (MenuSections / MenuItems) without admin `MenuId` —
 * as produced by the PHP Menu Preview upload path.
 */
export function isFlipdishPortalMenu(v: unknown): boolean {
  if (isAdminMenuExport(v)) return false;
  const o = asRecord(v);
  return o !== null && Array.isArray(o.MenuSections) && o.MenuSections.length > 0;
}

export function normalizeFlipdishPortalMenu(raw: unknown): NormalizedMenu {
  const root = asRecord(raw);
  const warnings: string[] = [];
  if (!root || !Array.isArray(root.MenuSections)) {
    return {
      id: 'portal-empty',
      name: 'Menu',
      categories: [],
      modifierGroups: {},
      channels: [...CHANNELS],
      metadata: {
        sourceType: 'flipdish_portal',
        itemCount: 0,
        categoryCount: 0,
        warnings: ['Invalid Flipdish menu payload.'],
      },
    };
  }

  const menuName =
    typeof root.Name === 'string' && root.Name.trim().length > 0
      ? root.Name.trim()
      : typeof root.name === 'string' && root.name.trim().length > 0
        ? root.name.trim()
        : 'Menu';


  const modifierGroups: Record<string, NormalizedModifierGroup> = {};

  const sections = root.MenuSections as unknown[];
  const categories: NormalizedCategory[] = [];

  sections.forEach((secRaw, secIdx) => {
    const s = asRecord(secRaw);
    if (!s) return;

    const sectionId = strId(s.MenuSectionId ?? s.Id ?? s.PublicId, `sec-${secIdx}`);
    const sectionName =
      typeof s.Name === 'string' && s.Name.trim().length > 0 ? s.Name.trim() : `Category ${secIdx + 1}`;

    const itemsRaw = Array.isArray(s.MenuItems) ? s.MenuItems : [];
    const items: NormalizedItem[] = [];

    itemsRaw.forEach((itRaw, itemIdx) => {
      const item = asRecord(itRaw);
      if (!item) return;

      const itemId = strId(item.MenuItemId ?? item.Id, `item-${secIdx}-${itemIdx}`);
      const itemName =
        typeof item.Name === 'string' && item.Name.trim().length > 0 ? item.Name.trim() : 'Item';
      const price = num(item.ActualPrice ?? item.Price);
      const prices: Record<SalesChannel, number> = {
        Collection: price,
        Delivery: price,
        DineIn: price,
        Takeaway: price,
      };

      const sets = Array.isArray(item.MenuItemOptionSets) ? item.MenuItemOptionSets : [];
      const modifierGroupIds: string[] = [];

      sets.forEach((osRaw, modIdx) => {
        const os = asRecord(osRaw);
        if (!os) return;

        const gid = strId(
          os.MenuItemOptionSetId,
          `portal-${secIdx}-${itemIdx}-${modIdx}`,
        );
        modifierGroupIds.push(gid);

        if (modifierGroups[gid]) return;

        const rawItems = Array.isArray(os.MenuItemOptionSetItems) ? os.MenuItemOptionSetItems : [];
        const options: NormalizedModifierOption[] = rawItems.map((optRaw, optIdx) => {
          const o = asRecord(optRaw);
          const optId = strId(o?.MenuItemOptionSetItemId ?? o?.Id, `${gid}-opt-${optIdx}`);
          const optPrice = num(o?.Price);
          const optPrices: Record<SalesChannel, number> = {
            Collection: optPrice,
            Delivery: optPrice,
            DineIn: optPrice,
            Takeaway: optPrice,
          };
          const rawImg = o?.ImageUrl ?? o?.imageUrl ?? o?.Image ?? o?.image;
          const imageUrl = typeof rawImg === 'string' && rawImg.length > 0 ? rawImg : null;
          return {
            id: optId,
            name: typeof o?.Name === 'string' && o.Name.trim() ? o.Name.trim() : 'Option',
            price: optPrice,
            prices: optPrices,
            enabled: o?.IsAvailable !== false,
            ...(imageUrl ? { imageUrl } : {}),
          } satisfies NormalizedModifierOption;
        });

        const rawMin = num(os.MinSelectCount);
        const rawMaxNum = num(os.MaxSelectCount);
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

        modifierGroups[gid] = {
          id: gid,
          name: typeof os.Name === 'string' && os.Name.trim() ? os.Name.trim() : 'Options',
          isRequired: min > 0,
          minSelection: min,
          maxSelection: max,
          options,
        };
      });

      const rawImage = item.ImageUrl ?? item.imageUrl;
      items.push({
        id: itemId,
        name: itemName,
        description: typeof item.Description === 'string' ? item.Description : undefined,
        enabled: item.IsAvailable !== false,
        prices,
        modifierGroupIds,
        imageUrl: typeof rawImage === 'string' && rawImage.length > 0 ? rawImage : undefined,
      });
    });

    categories.push({
      id: sectionId,
      name: sectionName,
      description: typeof s.Description === 'string' ? s.Description : undefined,
      enabled: s.IsAvailable !== false,
      items,
    });
  });

  const itemCount = categories.reduce((acc, c) => acc + c.items.length, 0);

  return {
    id: freshUploadId(),
    name: menuName,
    categories,
    modifierGroups,
    channels: [...CHANNELS],
    metadata: {
      sourceType: 'flipdish_portal',
      itemCount,
      categoryCount: categories.length,
      warnings,
    },
  };
}
