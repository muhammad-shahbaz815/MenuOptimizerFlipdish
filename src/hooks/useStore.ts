import { create } from 'zustand';
import type {
  NormalizedMenu,
  SalesChannel,
  DemoScenario,
  ReviewProductScopes,
} from '@/types';

interface AppState {
  menu: NormalizedMenu | null;
  /** Second menu loaded for split-screen comparison. */
  menuB: NormalizedMenu | null;
  /** Which products (web/app vs POS) this menu applies to — set when the agent uploads. */
  reviewProductScopes: ReviewProductScopes | null;
  activeChannel: SalesChannel;
  activeScenario: DemoScenario | null;
  activeStepIndex: number;
  highlightedItem: { menuId: string; itemId: string; itemName?: string } | null;
  sessionSubmitted: boolean;
  /** Uploaded PDF report for compare view — persists across re-mounts. */
  uploadedPdf: File | null;
  /** Blob URL for the uploaded PDF (must be revoked when replaced/removed). */
  pdfBlobUrl: string | null;
  /** Display name when PDF was restored from remote storage (no File object). */
  pdfName: string | null;

  /** Flipdish Portal URL attached to this session (set by the agent before saving). */
  sessionPortalUrl: string | null;

  /** Price band currently applied to slot A (and slot B if both come from V3). */
  activePriceBandId: string | null;

  setMenu: (menu: NormalizedMenu | null) => void;
  setMenuB: (menu: NormalizedMenu | null) => void;
  setActivePriceBandId: (id: string | null) => void;
  setSessionPortalUrl: (url: string | null) => void;
  setReviewProductScopes: (scopes: ReviewProductScopes | null) => void;
  setActiveChannel: (channel: SalesChannel) => void;
  setActiveScenario: (scenario: DemoScenario | null) => void;
  setHighlightedItem: (highlightedItem: { menuId: string; itemId: string; itemName?: string } | null) => void;
  setSessionSubmitted: (submitted: boolean) => void;
  setUploadedPdf: (file: File | null) => void;
  /** Restore a PDF from a remote URL (e.g. Supabase Storage signed URL). */
  setPdfFromRemote: (url: string, name: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  resetScenario: () => void;
}

export const useStore = create<AppState>((set) => ({
  menu: null,
  menuB: null,
  reviewProductScopes: null,
  sessionPortalUrl: null,
  activeChannel: 'Collection',
  activeScenario: null,
  activeStepIndex: -1,
  highlightedItem: null,
  sessionSubmitted: false,
  uploadedPdf: null,
  pdfBlobUrl: null,
  pdfName: null,
  activePriceBandId: null,

  setMenu: (menu) => set(() => menu === null
    ? { menu: null }
    : { menu }),
  setMenuB: (menuB) => set(() => menuB === null
    ? { menuB: null }
    : { menuB }),
  setActivePriceBandId: (id) => set((state) => {
    const applyBand = (menu: NormalizedMenu | null): NormalizedMenu | null => {
      if (!menu) return null;
      const cp = menu.metadata.compactPricing;
      const bands = menu.metadata.priceBands ?? [];
      const bandId = id && bands.includes(id) ? id : bands[0];
      if (!cp || !bandId) return menu;
      const newCategories = menu.categories.map(cat => ({
        ...cat,
        items: cat.items.map(item => {
          const bp = cp.items[item.id]?.[bandId];
          if (!bp) return item;
          return { ...item, prices: { Collection: bp.c, Delivery: bp.d, DineIn: bp.di, Takeaway: bp.t } };
        }),
      }));
      const newModifierGroups: typeof menu.modifierGroups = {};
      for (const [gid, group] of Object.entries(menu.modifierGroups)) {
        newModifierGroups[gid] = {
          ...group,
          options: group.options.map(opt => {
            const bp = cp.options[opt.id]?.[bandId];
            if (!bp) return opt;
            return { ...opt, prices: { Collection: bp.c, Delivery: bp.d, DineIn: bp.di, Takeaway: bp.t }, price: bp.c };
          }),
        };
      }
      return { ...menu, categories: newCategories, modifierGroups: newModifierGroups, metadata: { ...menu.metadata, activePriceBandId: bandId } };
    };
    return {
      activePriceBandId: id,
      menu: applyBand(state.menu),
      menuB: applyBand(state.menuB),
    };
  }),
  setSessionPortalUrl: (url) => set({ sessionPortalUrl: url }),
  setReviewProductScopes: (scopes) => set({ reviewProductScopes: scopes }),

  setActiveChannel: (channel) => set({ activeChannel: channel }),

  setActiveScenario: (scenario) => set({
    activeScenario: scenario,
    activeStepIndex: scenario ? 0 : -1
  }),

  setHighlightedItem: (highlightedItem) => set({ highlightedItem }),

  setSessionSubmitted: (submitted) => set({ sessionSubmitted: submitted }),

  setUploadedPdf: (file) => set((state) => {
    // Only revoke blob URLs we created ourselves (not remote signed URLs).
    if (state.pdfBlobUrl?.startsWith('blob:')) URL.revokeObjectURL(state.pdfBlobUrl);
    return {
      uploadedPdf: file,
      pdfBlobUrl: file ? URL.createObjectURL(file) : null,
      pdfName: null,
    };
  }),

  setPdfFromRemote: (url, name) => set((state) => {
    if (state.pdfBlobUrl?.startsWith('blob:')) URL.revokeObjectURL(state.pdfBlobUrl);
    return { uploadedPdf: null, pdfBlobUrl: url, pdfName: name };
  }),

  nextStep: () => set((state) => ({
    activeStepIndex: Math.min(state.activeStepIndex + 1, (state.activeScenario?.steps.length || 0) - 1)
  })),

  prevStep: () => set((state) => ({
    activeStepIndex: Math.max(state.activeStepIndex - 1, 0)
  })),

  resetScenario: () => set({ activeStepIndex: 0 })
}));
