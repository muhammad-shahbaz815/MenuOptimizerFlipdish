import type { DemoScenario, DemoStep, NormalizedMenu } from '@/types';
import { pickDemoTourAnchor } from './pickDemoJourneyItems';

const STEP_MS = 5200;

const CATEGORIES: Omit<DemoStep, 'id' | 'action'> = {
  label: 'Menu categories',
  description: "Those are your menu categories. Check order and naming before you sign off.",
  delay: STEP_MS,
};

const ITEMS: Omit<DemoStep, 'id' | 'action'> = {
  label: 'Menu items',
  description:
    "For each category, you'll find the items that you are offering for your customers. Review names, prices, and descriptions.",
  delay: STEP_MS,
};

const MODIFIERS: Omit<DemoStep, 'id' | 'action' | 'targetId'> = {
  label: 'Modifiers',
  description:
    'Modifiers are options for a given item to select from. Please make sure they are accurate!',
  delay: STEP_MS,
};

const BASKET: Omit<DemoStep, 'id' | 'action' | 'targetId'> = {
  label: 'Basket',
  description:
    'The item is added to the basket — review line details, selections, and totals before checkout.',
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
 * Guided tour: categories, items, modifiers, then basket with the sample item added.
 */
export function buildCustomerDemoScenario(menu: NormalizedMenu): DemoScenario {
  const anchor = pickDemoTourAnchor(menu);
  const basketItemId = anchor?.item.id ?? firstEnabledItemId(menu);

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

  if (basketItemId) {
    steps.push({
      id: 'tour-basket',
      action: 'spotlightBasket',
      targetId: basketItemId,
      ...BASKET,
    });
  }

  return {
    id: `cust-demo-${Date.now()}`,
    name: 'Menu review tour',
    description:
      'Walk through categories, items, modifiers, and basket on this preview. If you spot issues, leave item-level notes in Check Menu Structure.',
    type: 'customer',
    steps,
  };
}
