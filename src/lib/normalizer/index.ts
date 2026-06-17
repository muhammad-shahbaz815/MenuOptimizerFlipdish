import type {
  NormalizedMenu,
  NormalizedCategory,
  NormalizedItem,
  NormalizedModifierGroup,
  NormalizedModifierOption,
  RawMenuV3,
  RawCategoryV3,
  RawItemV3,
  RawModifierGroupV3,
  RawModifierOptionV3,
  SalesChannel,
  CompactPricingData,
} from '@/types';

export { isAdminMenuExport, normalizeAdminMenuExport } from './adminExport';
export { isFlipdishPortalMenu, normalizeFlipdishPortalMenu } from './flipdishPortal';
export { freshUploadId } from './freshUploadId';
import { freshUploadId } from './freshUploadId';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** V3 exports are usually camelCase; some pipelines use PascalCase or British spelling. */
function pickExportColor(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length > 0) return normalizeMenuColorToken(t);
    }
  }
  return undefined;
}

function normalizeMenuColorToken(s: string): string {
  if (/^#[0-9A-Fa-f]{3}$/i.test(s) || /^#[0-9A-Fa-f]{6}$/i.test(s) || /^#[0-9A-Fa-f]{8}$/i.test(s)) {
    return s;
  }
  if (/^[0-9A-Fa-f]{6}$/i.test(s)) return `#${s}`;
  if (/^[0-9A-Fa-f]{3}$/i.test(s)) return `#${s}`;
  return s;
}

function resolveRawCategories(raw: RawMenuV3): RawCategoryV3[] {
  if (Array.isArray(raw.categories) && raw.categories.length > 0) {
    return raw.categories;
  }
  const root = asRecord(raw);
  if (!root) return raw.categories ?? [];
  const menu = asRecord(root.menu) ?? asRecord(root.Menu);
  if (!menu) return raw.categories ?? [];
  const nested = menu.categories ?? menu.Categories;
  return Array.isArray(nested) ? (nested as RawCategoryV3[]) : (raw.categories ?? []);
}

export function normalizeV3Menu(
  raw: RawMenuV3,
  opts?: { priceBandId?: string },
): NormalizedMenu {
  const warnings: string[] = [];

  // Collect distinct priceBandIds in encounter order.
  const priceBands: string[] = [];
  const seenBands = new Set<string>();
  const collectBands = (profiles: { priceBandId?: string }[] | undefined) => {
    if (!Array.isArray(profiles)) return;
    for (const p of profiles) {
      const id = (p as any)?.priceBandId;
      if (typeof id === 'string' && id.length > 0 && !seenBands.has(id)) {
        seenBands.add(id);
        priceBands.push(id);
      }
    }
  };
  for (const cat of resolveRawCategories(raw)) {
    const items = (cat as any).items ?? [];
    for (const it of items) collectBands((it as any).pricingProfiles);
  }
  for (const mod of raw.modifiers || []) {
    for (const opt of mod.items || []) collectBands((opt as any).pricingProfiles);
  }

  const activeBandId: string | undefined =
    opts?.priceBandId && seenBands.has(opts.priceBandId)
      ? opts.priceBandId
      : priceBands[0];

  // Build modifier group map — skip disabled groups entirely.
  const modifierGroups: Record<string, NormalizedModifierGroup> = {};
  (raw.modifiers || []).filter(mod => mod.enabled !== false).forEach(mod => {
    modifierGroups[mod.id] = normalizeModifierGroup(mod, activeBandId);
  });

  const rawCats = resolveRawCategories(raw);

  // Build compact pricing table before normalizing categories.
  const compactPricing: CompactPricingData = { items: {}, options: {} };
  for (const cat of rawCats) {
    for (const item of (cat as any).items ?? []) {
      if (!Array.isArray(item.pricingProfiles)) continue;
      compactPricing.items[item.id] = {};
      for (const pp of item.pricingProfiles) {
        if (!pp.priceBandId) continue;
        compactPricing.items[item.id][pp.priceBandId] = {
          c: pp.collectionPrice ?? 0, d: pp.deliveryPrice ?? 0,
          di: pp.dineInPrice ?? 0, t: pp.takeawayPrice ?? 0,
        };
      }
    }
  }
  for (const mod of raw.modifiers ?? []) {
    for (const opt of mod.items ?? []) {
      if (!Array.isArray(opt.pricingProfiles)) continue;
      compactPricing.options[opt.id] = {};
      for (const pp of opt.pricingProfiles) {
        if (!pp.priceBandId) continue;
        compactPricing.options[opt.id][pp.priceBandId] = {
          c: pp.collectionPrice ?? 0, d: pp.deliveryPrice ?? 0,
          di: pp.dineInPrice ?? 0, t: pp.takeawayPrice ?? 0,
        };
      }
    }
  }

  const categories: NormalizedCategory[] = rawCats.map((cat) =>
    normalizeCategory(cat, warnings, activeBandId, modifierGroups),
  );
  const itemCount = categories.reduce((acc, cat) => acc + cat.items.length, 0);

  const channels: SalesChannel[] = ['Collection', 'Delivery', 'DineIn', 'Takeaway'];

  return {
    id: freshUploadId(),
    name: raw.name || 'Unnamed Menu',
    categories,
    modifierGroups,
    channels,
    metadata: {
      sourceType: 'v3',
      itemCount,
      categoryCount: categories.length,
      warnings,
      ...(priceBands.length > 0 ? { priceBands } : {}),
      ...(activeBandId ? { activePriceBandId: activeBandId } : {}),
      compactPricing,
    }
  };
}

function pickProfile(
  profiles: { priceBandId?: string }[] | undefined,
  activeBandId: string | undefined,
): { collectionPrice?: number; deliveryPrice?: number; dineInPrice?: number; takeawayPrice?: number } {
  if (!Array.isArray(profiles) || profiles.length === 0) return {};
  if (activeBandId) {
    const match = profiles.find((p) => (p as any)?.priceBandId === activeBandId);
    if (match) return match as Record<string, number>;
  }
  return (profiles[0] as Record<string, number>) ?? {};
}

function pickStringField(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return undefined;
}

function pickBooleanField(obj: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'boolean') return v;
  }
  return fallback;
}

function normalizeCategory(
  cat: RawCategoryV3,
  warnings: string[],
  activeBandId?: string,
  modifierGroups?: Record<string, NormalizedModifierGroup>,
): NormalizedCategory {
  const o = cat as unknown as Record<string, unknown>;
  const id = pickStringField(o, 'id', 'Id') ?? cat.id;
  const name = pickStringField(o, 'caption', 'Caption') ?? cat.caption;
  const description = pickStringField(o, 'notes', 'Notes') ?? cat.notes;
  const enabled = pickBooleanField(o, ['enabled', 'Enabled'], cat.enabled);
  const itemsRaw = (Array.isArray(o.items) ? o.items : Array.isArray(o.Items) ? o.Items : cat.items) ?? [];

  const bg =
    pickExportColor(o, 'backgroundColor', 'BackgroundColor', 'background_colour', 'BackgroundColour') ??
    cat.backgroundColor;
  const fg =
    pickExportColor(o, 'foregroundColor', 'ForegroundColor', 'foreground_colour', 'ForegroundColour') ??
    cat.foregroundColor;

  return {
    id,
    name,
    description,
    enabled,
    backgroundColor: bg,
    foregroundColor: fg,
    items: itemsRaw.map((item) => normalizeItem(item as RawItemV3, warnings, activeBandId, modifierGroups)),
  };
}

function normalizeItem(
  item: RawItemV3,
  _warnings: string[],
  activeBandId?: string,
  modifierGroups?: Record<string, NormalizedModifierGroup>,
): NormalizedItem {
  const pp = pickProfile((item.pricingProfiles as any), activeBandId);
  const prices: Record<SalesChannel, number> = {
    Collection: (pp as any).collectionPrice ?? 0,
    Delivery: (pp as any).deliveryPrice ?? 0,
    DineIn: (pp as any).dineInPrice ?? 0,
    Takeaway: (pp as any).takeawayPrice ?? 0,
  };

  const rawImage = item.imageUrl || item.image;
  // Only include modifier group IDs that actually exist in the enabled groups map.
  const modifierGroupIds = (item.modifierMembers || [])
    .map((m) => m.modifierId)
    .filter((id) => !modifierGroups || id in modifierGroups);

  // Deposit Return Scheme: infer charge amount from volume in item name.
  // Charge definitions are external to this JSON (only a chargeId reference is
  // stored), but DRS amounts are standardised: ≤500ml → €0.15, >500ml → €0.25.
  let drsCharge: number | undefined;
  if (Array.isArray((item as any).charges) && (item as any).charges.length > 0) {
    const volMatch = item.caption.match(/(\d+(?:\.\d+)?)\s*(ml|l|litre|liter)/i);
    if (volMatch) {
      const vol = parseFloat(volMatch[1]);
      const unit = volMatch[2].toLowerCase();
      const ml = unit === 'ml' ? vol : vol * 1000;
      drsCharge = ml <= 500 ? 0.15 : 0.25;
    } else {
      drsCharge = 0.15; // default if size not determinable
    }
  }

  return {
    id: item.id,
    name: item.caption,
    description: item.notes,
    enabled: item.enabled,
    prices,
    imageUrl: typeof rawImage === 'string' && rawImage.length > 0 ? rawImage : undefined,
    modifierGroupIds,
    ...(drsCharge !== undefined ? { drsCharge } : {}),
  };
}

function normalizeModifierGroup(mod: RawModifierGroupV3, activeBandId?: string): NormalizedModifierGroup {
  const rawMin = mod.min ?? mod.minSelectCount;
  const rawMax = mod.max ?? mod.maxSelectCount;
  const min =
    rawMin != null && !Number.isNaN(Number(rawMin)) ? Math.max(0, Math.floor(Number(rawMin))) : 0;

  const enabledOptions = (mod.items || []).filter((i) => i.enabled);
  const optionCount = enabledOptions.length;

  let max: number;
  if (rawMax != null && !Number.isNaN(Number(rawMax))) {
    max = Math.max(0, Math.floor(Number(rawMax)));
  } else if (optionCount > 0) {
    max = optionCount;
  } else {
    max = min > 0 ? min : 1;
  }

  if (max < min) max = min;

  return {
    id: mod.id,
    name: mod.caption,
    isRequired: min > 0,
    minSelection: min,
    maxSelection: max,
    options: (mod.items || []).map((opt) => normalizeModifierOption(opt, activeBandId)),
  };
}

function normalizeModifierOption(opt: RawModifierOptionV3, activeBandId?: string): NormalizedModifierOption {
  const pp = pickProfile((opt.pricingProfiles as any), activeBandId);
  const prices: Record<SalesChannel, number> = {
    Collection: (pp as any).collectionPrice ?? 0,
    Delivery: (pp as any).deliveryPrice ?? 0,
    DineIn: (pp as any).dineInPrice ?? 0,
    Takeaway: (pp as any).takeawayPrice ?? 0,
  };
  const o = opt as unknown as Record<string, unknown>;
  const rawImg = o.imageUrl ?? o.image ?? o.ImageUrl ?? o.Image;
  const imageUrl = typeof rawImg === 'string' && rawImg.length > 0 ? rawImg : undefined;
  const nestedMembers = Array.isArray(opt.modifierMembers) ? opt.modifierMembers : [];
  const modifierGroupIds = nestedMembers
    .map((m) => (m && typeof m.modifierId === 'string' ? m.modifierId : null))
    .filter((id): id is string => id !== null);
  const bg =
    pickExportColor(
      o,
      'backgroundColor',
      'BackgroundColor',
      'background_colour',
      'BackgroundColour',
    ) ?? opt.backgroundColor;
  const fg =
    pickExportColor(
      o,
      'foregroundColor',
      'ForegroundColor',
      'foreground_colour',
      'ForegroundColour',
    ) ?? opt.foregroundColor;

  let optDrsCharge: number | undefined;
  if (Array.isArray((opt as any).charges) && (opt as any).charges.length > 0) {
    const volMatch = opt.caption.match(/(\d+(?:\.\d+)?)\s*(ml|l|litre|liter)/i);
    if (volMatch) {
      const vol = parseFloat(volMatch[1]);
      const unit = volMatch[2].toLowerCase();
      const ml = unit === 'ml' ? vol : vol * 1000;
      optDrsCharge = ml <= 500 ? 0.15 : 0.25;
    } else {
      optDrsCharge = 0.15;
    }
  }

  return {
    id: opt.id,
    name: opt.caption,
    price: prices.Collection,
    prices,
    enabled: opt.enabled,
    backgroundColor: bg,
    foregroundColor: fg,
    ...(imageUrl ? { imageUrl } : {}),
    ...(modifierGroupIds.length > 0 ? { modifierGroupIds } : {}),
    ...(optDrsCharge !== undefined ? { drsCharge: optDrsCharge } : {}),
  };
}

export function normalizeLegacyMenu(text: string): NormalizedMenu {
  const warnings: string[] = ["Legacy menu format detected. Parsing is experimental."];
  
  // Basic legacy parser logic: split by lines, look for categories and items
  const lines = text.split('\n');
  const categories: NormalizedCategory[] = [];
  let currentCategory: NormalizedCategory | null = null;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Very basic heuristic: if line is all caps and no price, it's a category
    if (trimmed === trimmed.toUpperCase() && !trimmed.includes('£') && !trimmed.includes('€')) {
      currentCategory = {
        id: `cat-${categories.length}`,
        name: trimmed,
        enabled: true,
        items: []
      };
      categories.push(currentCategory);
    } else if (currentCategory) {
      // Assume it's an item
      const priceMatch = trimmed.match(/[£€]?\s*(\d+\.\d{2})/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      const name = trimmed.replace(/[£€]?\s*\d+\.\d{2}/, '').trim();

      currentCategory.items.push({
        id: `item-${currentCategory.items.length}`,
        name,
        enabled: true,
        prices: { Collection: price, Delivery: price, DineIn: price, Takeaway: price },
        modifierGroupIds: []
      });
    }
  });

  return {
    id: freshUploadId(),
    name: 'Legacy Menu Export',
    categories,
    modifierGroups: {},
    channels: ['Collection', 'Takeaway'],
    metadata: {
      sourceType: 'legacy',
      itemCount: categories.reduce((acc, cat) => acc + cat.items.length, 0),
      categoryCount: categories.length,
      warnings
    }
  };
}
