import type { DemoStep } from '@/types';

/** DOM anchors used to place the tour card beside the relevant preview UI. */
export function tourAnchorSelector(action: DemoStep['action']): string | null {
  switch (action) {
    case 'spotlightCategories':
      return '[data-tour-anchor="tour-categories"]';
    case 'spotlightItems':
      return '[data-tour-anchor="tour-items"]';
    case 'spotlightModifiers':
      return '[data-demo-modifiers-region]';
    case 'spotlightBasket':
    case 'openCart':
      return '[data-tour-anchor="tour-basket"]';
    default:
      return null;
  }
}

export interface TourCardPosition {
  top: number;
  left: number;
  transform: string;
}

/**
 * Places the tour card near the measured anchor so each step is easy to follow.
 * Uses viewport coordinates for `position: fixed` + portal to document.body.
 */
export function computeTourCardPosition(
  rect: DOMRect,
  action: DemoStep['action'],
): TourCardPosition {
  const margin = 12;
  const cardH = 240;
  const cardW = Math.min(384, window.innerWidth - 2 * margin);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const centerX = rect.left + rect.width / 2;
  const clampedCenterX = Math.min(Math.max(centerX, cardW / 2 + margin), vw - cardW / 2 - margin);

  if (action === 'spotlightModifiers') {
    const fitsAbove = rect.top > cardH + margin * 2;
    if (fitsAbove) {
      return { top: rect.top - margin, left: clampedCenterX, transform: 'translate(-50%, -100%)' };
    }
    const fitsBelow = rect.bottom + cardH + margin < vh;
    if (fitsBelow) {
      return { top: rect.bottom + margin, left: clampedCenterX, transform: 'translateX(-50%)' };
    }
    return { top: margin + 48, left: clampedCenterX, transform: 'translateX(-50%)' };
  }

  if (action === 'spotlightBasket' || action === 'openCart') {
    const nearBottom = rect.bottom > vh - 140;
    if (nearBottom) {
      return { top: rect.top - margin, left: clampedCenterX, transform: 'translate(-50%, -100%)' };
    }
    if (rect.left > vw * 0.48) {
      const leftPos = Math.max(margin, rect.left - cardW - 14);
      const top = Math.min(Math.max(margin, rect.top + 24), vh - cardH - margin);
      return { top, left: leftPos, transform: 'none' };
    }
    return { top: rect.bottom + margin, left: clampedCenterX, transform: 'translateX(-50%)' };
  }

  const belowTop = rect.bottom + margin;
  if (belowTop + cardH < vh - margin) {
    return { top: belowTop, left: clampedCenterX, transform: 'translateX(-50%)' };
  }
  return {
    top: Math.max(margin, rect.top - margin),
    left: clampedCenterX,
    transform: 'translate(-50%, -100%)',
  };
}

export function fallbackTourPosition(): TourCardPosition {
  const pad = 16;
  return {
    top: window.innerHeight - pad,
    left: window.innerWidth / 2,
    transform: 'translate(-50%, -100%)',
  };
}
