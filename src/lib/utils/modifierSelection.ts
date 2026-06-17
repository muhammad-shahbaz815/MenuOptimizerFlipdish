import type { NormalizedItem, NormalizedMenu, NormalizedModifierGroup, SalesChannel } from '@/types';

/**
 * Ordered modifier groups currently visible for an item, given the user's
 * selections so far. Nested conditional groups (declared on individual
 * options via `modifierGroupIds`) are appended in declaration order
 * whenever their parent option is currently selected.
 *
 * Pass an empty `selections` object to get just the top-level groups.
 */
export function modifierGroupsForItem(
  menu: NormalizedMenu,
  item: NormalizedItem,
  selections: Record<string, string[]> = {},
): NormalizedModifierGroup[] {
  const list: NormalizedModifierGroup[] = [];
  const seen = new Set<string>();

  const walk = (groupIds: readonly string[]) => {
    for (const gid of groupIds) {
      if (seen.has(gid)) continue;
      const g = menu.modifierGroups[gid];
      if (!g) continue;
      const enabledOpts = g.options.filter((o) => o.enabled);
      if (enabledOpts.length === 0) continue;
      seen.add(gid);
      list.push(g);

      // Recurse into nested groups attached to currently-selected options
      // in this group. This is what powers conditional modifiers (e.g. the
      // "Select 1st Topping" / "Select 2nd Topping" groups that should
      // appear only after "Create Your Own Pizza" is picked).
      const chosen = selections[gid] ?? [];
      for (const oid of chosen) {
        const opt = g.options.find((o) => o.id === oid);
        if (!opt || !opt.modifierGroupIds || opt.modifierGroupIds.length === 0) continue;
        walk(opt.modifierGroupIds);
      }
    }
  };

  walk(item.modifierGroupIds);
  return list;
}

/** Greedy default: first `minSelection` enabled options per group (for demos / fallbacks). */
export function buildDefaultModifierSelections(
  menu: NormalizedMenu,
  item: NormalizedItem,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const gid of item.modifierGroupIds) {
    const g = menu.modifierGroups[gid];
    if (!g) continue;
    const enabled = g.options.filter((o) => o.enabled);
    const take = Math.min(g.minSelection, enabled.length);
    out[gid] = enabled.slice(0, take).map((o) => o.id);
  }
  return out;
}

export function modifierGroupStepValid(
  group: NormalizedModifierGroup,
  selections: Record<string, string[]>,
): boolean {
  const count = (selections[group.id] ?? []).length;
  return count >= group.minSelection && count <= group.maxSelection;
}

export function modifierExtrasTotal(
  menu: NormalizedMenu,
  item: NormalizedItem,
  selections: Record<string, string[]>,
  channel: SalesChannel,
): number {
  let sum = 0;
  const activeGroups = modifierGroupsForItem(menu, item, selections);
  for (const g of activeGroups) {
    const chosen = selections[g.id] ?? [];
    for (const oid of chosen) {
      const opt = g.options.find((o) => o.id === oid);
      if (opt) sum += opt.prices[channel] ?? opt.price;
    }
  }
  return sum;
}

export function lineTotal(
  menu: NormalizedMenu,
  item: NormalizedItem,
  selections: Record<string, string[]>,
  channel: SalesChannel,
): number {
  return (item.prices[channel] ?? 0) + modifierExtrasTotal(menu, item, selections, channel);
}

export function modifiersValidForItem(
  menu: NormalizedMenu,
  item: NormalizedItem,
  selections: Record<string, string[]>,
): boolean {
  // Only validate currently-visible groups; stale selections inside
  // hidden conditional sub-groups are ignored.
  const activeGroups = modifierGroupsForItem(menu, item, selections);
  for (const g of activeGroups) {
    const count = (selections[g.id] ?? []).length;
    if (count < g.minSelection || count > g.maxSelection) return false;
  }
  return true;
}
