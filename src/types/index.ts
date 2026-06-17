export interface RawMenuV3 {
  id?: string;
  name?: string;
  categories?: RawCategoryV3[];
  modifiers?: RawModifierGroupV3[];
  // ... other fields
}

export interface RawCategoryV3 {
  id: string;
  caption: string;
  notes?: string;
  enabled: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  items: RawItemV3[];
}

export interface RawItemV3 {
  id: string;
  caption: string;
  notes?: string;
  enabled: boolean;
  pricingProfiles: RawPricingProfileV3[];
  modifierMembers: { modifierId: string }[];
  imageUrl?: string;
  image?: string;
  charges?: { chargeId: string; priceBandId?: string }[];
}

export interface RawPricingProfileV3 {
  priceBandId?: string;
  collectionPrice?: number;
  deliveryPrice?: number;
  dineInPrice?: number;
  takeawayPrice?: number;
}

export interface RawModifierGroupV3 {
  id: string;
  caption: string;
  enabled: boolean;
  /** V3 export uses `min` / `max` on modifier groups */
  min?: number;
  max?: number;
  minSelectCount?: number;
  maxSelectCount?: number;
  items: RawModifierOptionV3[];
}

export interface RawModifierOptionV3 {
  id: string;
  caption: string;
  enabled: boolean;
  pricingProfiles: RawPricingProfileV3[];
  backgroundColor?: string;
  foregroundColor?: string;
  /** Conditional sub-modifiers: groups that appear only when this option is selected. */
  modifierMembers?: { modifierId: string }[];
  charges?: { chargeId: string; priceBandId?: string }[];
}

export interface CompactPricingData {
  /** itemId → priceBandId → per-channel prices */
  items: Record<string, Record<string, { c: number; d: number; di: number; t: number }>>;
  /** modifierOptionId → priceBandId → per-channel prices */
  options: Record<string, Record<string, { c: number; d: number; di: number; t: number }>>;
}

// Normalized Types
export type SalesChannel = 'Collection' | 'Delivery' | 'DineIn' | 'Takeaway';

export interface NormalizedMenu {
  id: string;
  name: string;
  description?: string;
  categories: NormalizedCategory[];
  modifierGroups: Record<string, NormalizedModifierGroup>;
  channels: SalesChannel[];
  metadata: {
    sourceType: 'v3' | 'legacy' | 'admin' | 'flipdish_portal';
    itemCount: number;
    categoryCount: number;
    warnings: string[];
    /** Ordered list of distinct priceBandIds encountered in the source V3 menu. */
    priceBands?: string[];
    /** Which priceBandId was applied when this normalization was produced. */
    activePriceBandId?: string;
    /** Compact price table so the price-band switcher works after a session is reloaded from Supabase. */
    compactPricing?: CompactPricingData;
  };
}

export interface NormalizedCategory {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  /** POS category tile (from export) */
  backgroundColor?: string;
  foregroundColor?: string;
  items: NormalizedItem[];
}

export interface NormalizedItem {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  prices: Record<SalesChannel, number>;
  modifierGroupIds: string[];
  imageUrl?: string;
  /** Deposit Return Scheme charge in euros (e.g. 0.15 or 0.25), if applicable. */
  drsCharge?: number;
}

export interface NormalizedModifierGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  options: NormalizedModifierOption[];
}

export interface NormalizedModifierOption {
  id: string;
  name: string;
  /** Primary display price (collection); prefer `prices[channel]` in UI */
  price: number;
  prices: Record<SalesChannel, number>;
  enabled: boolean;
  /** POS modifier tile (from export) */
  backgroundColor?: string;
  foregroundColor?: string;
  imageUrl?: string;
  /** Conditional sub-modifier group IDs revealed only when this option is selected. */
  modifierGroupIds?: string[];
  /** Deposit Return Scheme charge in euros, if applicable. */
  drsCharge?: number;
}

/**
 * Which platforms this uploaded menu applies to (internal agent selection).
 * One or both may be true — multi-select when the menu is used everywhere.
 */
export interface ReviewProductScopes {
  webApp: boolean;
  pos: boolean;
}

export interface DemoStep {
  id: string;
  label: string;
  description: string;
  action:
    | 'goToScreen'
    | 'openCategory'
    | 'selectItem'
    | 'chooseModifier'
    | 'addToCart'
    | 'openCart'
    | 'goToCheckout'
    | 'chooseOrderType'
    /** Guided tour: highlight all category controls (web/app or POS). */
    | 'spotlightCategories'
    /** Guided tour: highlight items in the active category. */
    | 'spotlightItems'
    /** Guided tour: highlight modifier choices (opens sample item when needed). */
    | 'spotlightModifiers'
    /** Guided tour: add sample item to basket/ticket and highlight it. */
    | 'spotlightBasket';
  targetId?: string;
  /** For chooseModifier: pick only this group and merge into existing selections (multi-layer demos). */
  modifierGroupId?: string;
  delay?: number;
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  type: 'customer' | 'staff';
  steps: DemoStep[];
}
