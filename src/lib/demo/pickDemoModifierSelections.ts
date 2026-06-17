import type { NormalizedItem, NormalizedMenu } from '@/types';

function picksForGroup(menu: NormalizedMenu, groupId: string): string[] {
  const g = menu.modifierGroups[groupId];
  if (!g) return [];
  const enabled = g.options.filter((o) => o.enabled);
  const need = Math.min(g.minSelection, enabled.length);
  return enabled.slice(0, need).map((o) => o.id);
}

/** Pick the first enabled options per group to satisfy `minSelection` (for guided demo). */
export function pickDemoModifierSelections(
  menu: NormalizedMenu,
  item: NormalizedItem,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const gid of item.modifierGroupIds) {
    const g = menu.modifierGroups[gid];
    if (!g) continue;
    const enabled = g.options.filter((o) => o.enabled);
    if (enabled.length === 0) continue;
    out[gid] = picksForGroup(menu, gid);
  }
  return out;
}

/** Picks for a single modifier group (for layered demo steps). */
export function pickDemoModifierSelectionsForGroup(
  menu: NormalizedMenu,
  item: NormalizedItem,
  groupId: string,
): Record<string, string[]> {
  if (!item.modifierGroupIds.includes(groupId)) return {};
  const g = menu.modifierGroups[groupId];
  if (!g) return {};
  const enabled = g.options.filter((o) => o.enabled);
  if (enabled.length === 0) return {};
  return { [groupId]: picksForGroup(menu, groupId) };
}
