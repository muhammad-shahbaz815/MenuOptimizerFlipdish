import type { NormalizedModifierGroup } from '@/types';

/** Client-facing copy derived from normalized min/max (matches menu export rules). */
export function formatModifierGroupHint(group: NormalizedModifierGroup): string {
  const min = group.minSelection;
  const max = group.maxSelection;

  if (min === 0 && max === 0) {
    return 'Optional — no selection needed';
  }

  if (min > 0 && max > 0 && min === max) {
    return min === 1
      ? 'Required — choose 1'
      : `Required — choose exactly ${min}`;
  }

  if (min > 0 && max > min) {
    return `Required — choose ${min} to ${max}`;
  }

  if (min > 0) {
    return max > 0
      ? `Required — choose at least ${min} (up to ${max})`
      : `Required — choose at least ${min}`;
  }

  // min === 0, max > 0
  return max === 1
    ? 'Optional — choose up to 1'
    : `Optional — choose up to ${max}`;
}
