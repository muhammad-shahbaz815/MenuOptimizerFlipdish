// Gold-standard reference audit.
//
// Used by /api/review's confirmatory check to ensure structure, depth, and
// analytical patterns match a known good consulting deliverable.
//
// IMPORTANT: This is a STRUCTURE reference only. The reviewer is explicitly
// instructed not to import restaurant-specific facts (item names, prices,
// category names) from this template into the revised audit.

export const GOLD_STANDARD = `
THE CAVE RESTAURANT — Menu JSON Audit & Recommendations
Location: 109 Saint Margarets Road, Twickenham TW1 2LH

## 1. Headline Counts
| Metric | Count |
|---|---|
| Total categories | 22 (19 enabled, 3 disabled — Dessert Wine, Cocktails, Spirits) |
| Total items | 147 (137 enabled, 10 disabled) |
| Modifiers defined in the menu | 17 |
| Images at category level | 0 |
| Images at item level | 55 of 147 (37%) |
| Items with modifier links attached | 35 of 147 (24%) |
| True merchandising upsells configured | 0 |

### Food vs Drink split
| Section | Categories | Items | Items with images | Coverage |
|---|---|---|---|---|
| Food | 12 | 91 | 51 | 56% |
| Drinks | 10 | 56 | 4 | 7% |

## 2. Image Coverage by Category
A complete table of every category, sorted by coverage descending, with counts and percentage. Rows mark 100% with ✓ and 0% with ✗. Example structure:
| Category | Items | Images | Coverage |
|---|---|---|---|
| Salads | 5 | 5 | 100% ✓ |
| Cave Specials | 6 | 6 | 100% ✓ |
| Desserts | 8 | 6 | 75% |
| ... | ... | ... | ... |
| Hot Drinks | 9 | 0 | 0% ✗ |
| All wine, beer, bubbles, spirits | 31 | 0 | 0% |

## 3. The "Upsells" Finding — Important
Cross-reference each item's modifierIds against the modifier definitions to determine whether modifiers are TRUE cross-sell upsells (add naan, add side, dessert/tea attach) vs VARIANT PICKERS (Choose Size, Glass or Jug, Cup or Pot, Choose your Option, Choose Flavour, Choose Servings). Bullet list of variant-picker groups with item counts. Conclude with whether any true cross-sells exist and tie back to revenue impact (e.g., delivery being merchandised flat).

## 4. Items in the Wrong Category
| Item | Currently in | Should be in | Why |
|---|---|---|---|
Every miscategorised item with a clear, specific reason — bread classified as cold starter when it's hot/baked, soup misfiled as starter, sides misfiled as starters, duplicates across categories, naming-confusion items (full meals vs single skewers).

## 5. Other Data-Quality Issues
### Typos that will appear on the live menu and receipts
Bullet list with arrow notation: "current spelling" → should be "correct spelling".

### Other issues
- Items missing descriptions (with count and notable examples)
- Duplicate item names across categories
- Disabled categories still polluting the JSON
- Image-coverage extremes (call out the 100% vs 0% gap)
- Inconsistent use of dietary notation (e.g. (V)) where applicable
- Price-point mismatches suggesting categorisation confusion

## Recommendations to Make the Menu More Navigable

### A. Restructure into cleaner categories
Propose a TWO-TIER structure (FOOD parent group, DRINKS parent group). Markdown table per group with Category | Notes columns. Mark NEW categories, MERGES, RENAMES. Conclude with how many lines this collapses the navigator to.

Example FOOD group:
| Category | Notes |
|---|---|
| Breads & Clay Oven | NEW — rescues breads from Cold Starters |
| Cold Mezze | Cold Starters minus breads |
| Hot Starters & Soup | Hot Starters minus Chips and Mixed Starters |
| Salads | |
| Sharing Platters | NEW — Mixed Starters £35.85, Mixed Grilled 1/2/4 |
| Grilled Dishes | Kebabs, plus Cave Special Spicy Chicken |
| Slow-Cooked Stews | |
| Cave Specials | Rice-led signatures only |
| Wraps & Lunch | |
| Kids Menu | |
| Sides & Extras | Chips, Saffron Rice, Extra Skewers |
| Desserts | |

DRINKS group:
| Category | Notes |
|---|---|
| Soft Drinks & Juices | Merge Cold Drinks |
| Persian Specialities | Doogh + Persian teas + Saffron lemonade |
| Hot Drinks | |
| Beers, Wines & Bubbles | Consolidate or keep separate per local licensing |
| Cocktails / Spirits | Re-introduce when re-enabled |

### B. Image coverage — fix the gaps in priority order
Bullet list ORDERED BY IMPACT. For each: name the category, quote the current coverage %, explain the rationale (ordering without a picture cuts conversion by ~25-35%). Specifically call out: kids/wraps as highest impact, fill gaps for stews/grilled dishes via single styled photoshoot, drinks unique to the brand (Doogh, Saffron Lemonade) over generic items, and category banner images.

### C. Configure real upsells (currently zero or near-zero)
| When customer adds… | Prompt | Type |
|---|---|---|
At least 5 rows. Each prompt is concrete with the cross-sell amount in £. Types: "Optional add-on" or "Variant upgrade". Conclude with rationale paragraph noting AOV uplift potential — restaurants moving from zero to a structured upsell tree typically see 8-15% AOV lift on delivery within 60 days.

Example rows:
| Any kebab or stew | "Add naan? +£1.85 / Garlic naan +£2.85" | Optional add-on |
| Any kebab | "Upgrade your rice — Zereshk Polo +£2.95" | Variant upgrade |
| Any Joojeh / Koobideh | "Make it Torsh? +£3 (walnut & pomegranate marinade)" | Variant upgrade |
| Mixed Grill 2 / 4 | "Add a starter platter for the table +£12" | Optional add-on |
| Any main, after 6pm | "Finish with chai + baklava — £4.50" | Optional add-on |
| Any kebab | "Pairs traditionally with Doogh +£3.85" | Optional add-on |

### D. Fix every data-quality issue in §5
Bullet list of concrete 30-minute tasks: correct typos, write descriptions for items that have none, delete duplicate entries, rename ambiguous Extras, decide on disabled categories.

### E. Promote signature items currently buried
For each: name (with price in £), where it currently sits in the JSON, and where it should sit, with a one-sentence justification. At least 3 items.

### F. Add missing items the cuisine should include
Bullet list of items typical of the cuisine that are missing or under-represented. Connect to vegetarian gaps, Persian-specific items, dessert range expansion, mocktails section.

## 6. Revenue & Competitive Strategy (45-mile radius)
Detailed competitive comparison around the provided location. Cover:

### Competitive Landscape
List specific competitors in the radius (high-performing peers in same cuisine; broader competitive set). For each cluster, what they do that stands out: visual storytelling (every dish photographed), beverage pairings (Persian-inflected cocktails), tasting menus / set menus, vegetarian/vegan prominence, lunch meal deals, late-night service, loyalty schemes.

### Ideal item placement for greater visibility
Order high-selling items (using sales data if reports provided) — top 3 in each category should be (1) highest-margin, (2) most photogenic, (3) most unique/differentiated. Specific moves: name, current position, suggested position.

### High-value revenue-generating upsells derived from this menu
Concrete upsell concepts (Bread Trio bundle, Wine & Dine Pairing, Dessert Duo, Build-Your-Own Mezze, Friday Feast) with bundled prices and rationale. Quantify expected AOV lift.

### Meal deals, offers, combos to bring traffic in low-traffic days/hours
Use sales data (from supporting reports) to identify the slowest day/hour windows. Propose: weekday lunch deal (£14-15 with target customer), Mid-Week Mezze Special (% off starters), Wine Wednesday, Sunday family alternative, Happy Hour Sundowner, etc. For each: precise window, concrete price/discount, target audience, rationale.

### Deals to attract repeat customers
Quote the current repeat-rate from the supporting reports. Propose: digital loyalty stamp card, birthday bonus, referral programme, subscription model. Each with rationale and benchmark figures.

For every suggestion in this section, include a brief reason and the analysis behind it. Cite sales-data figures from supporting reports when available.

## Net Summary
2-3 sentences. Identify the SINGLE most impactful changes — what will actually move revenue. The image programme and the upsell programme typically lead.

End with the literal line: *— End of audit —*
`;
