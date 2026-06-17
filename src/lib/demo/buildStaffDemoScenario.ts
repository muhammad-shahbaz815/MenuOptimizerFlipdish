import type { DemoScenario, DemoStep, NormalizedMenu } from '@/types';
import { pickDemoTourAnchor } from './pickDemoJourneyItems';

const STEP_MS = 5200;

const CATEGORIES: Omit<DemoStep, 'id' | 'action'> = {
  label: 'Menu categories',
  description: "Those are your menu categories. Staff use these tiles to jump between sections.",
  delay: STEP_MS,
};

const ITEMS: Omit<DemoStep, 'id' | 'action'> = {
  label: 'Menu items',
  description:
    "For each category, you'll find the items that you are offering for your customers. Check buttons match what you sell.",
  delay: STEP_MS,
};

const MODIFIERS: Omit<DemoStep, 'id' | 'action' | 'targetId'> = {
  label: 'Modifiers',
  description:
    'Modifiers are options for a given item to select from. Please make sure they are accurate!',
  delay: STEP_MS,
};

const TICKET: Omit<DemoStep, 'id' | 'action' | 'targetId'> = {
  label: 'Ticket',
  description:
    'The item is on the ticket — review lines, modifier text, and totals the way staff will before payment.',
  delay: STEP_MS,
};

function firstEnabledItemId(menu: NormalizedMenu): string | undefined {
  for (const c of menu.categories.filter((x) => x.enabled)) {
    const i = c.items.find((x) => x.enabled);
    if (i) return i.id;
  }
  return undefined;
}

/**
 * POS preview tour: categories, items, modifiers, then ticket with the sample line added.
 */
export function buildStaffDemoScenario(menu: NormalizedMenu): DemoScenario {
  const anchor = pickDemoTourAnchor(menu);
  const ticketItemId = anchor?.item.id ?? firstEnabledItemId(menu);

  const steps: DemoStep[] = [
    { id: 'tour-categories', action: 'spotlightCategories', ...CATEGORIES },
    { id: 'tour-items', action: 'spotlightItems', ...ITEMS },
    {
      id: 'tour-modifiers',
      action: 'spotlightModifiers',
      ...MODIFIERS,
      ...(anchor ? { targetId: anchor.item.id } : {}),
    },
  ];

  if (ticketItemId) {
    steps.push({
      id: 'tour-ticket',
      action: 'spotlightBasket',
      targetId: ticketItemId,
      ...TICKET,
    });
  }

  return {
    id: `staff-demo-${Date.now()}`,
    name: 'Menu review tour',
    description:
      'Spotlight categories, items, modifiers, and ticket on this POS preview. If you spot issues, leave item-level notes in Check Menu Structure.',
    type: 'staff',
    steps,
  };
}
