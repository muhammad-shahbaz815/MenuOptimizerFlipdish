// Sanitize a menu JSON before sending it to Claude.
//
// Strips fields the model can't act on (image URLs, binary blobs, internal
// timestamps, sync plumbing, hashes) while preserving every item name,
// price, description, and modifier reference — so the model sees exactly
// the data a human would care about, with none of the catalog/CDN
// metadata that bloats Flipdish exports.

// Case-insensitive: we lowercase every incoming key before lookup, so this
// set only needs the lowercase form of each name (covers camelCase,
// snake_case, PascalCase variants in one entry).
export const NOISE_KEYS = new Set([
  // ── Timestamps & audit trail ────────────────────────────────────────────
  'createdat', 'updatedat', 'modifiedat', 'deletedat',
  'created_at', 'updated_at', 'modified_at', 'deleted_at',
  'createdon', 'updatedon', 'modifiedon', 'deletedon',
  'createdby', 'updatedby', 'modifiedby',
  'lastsyncedat', 'lastsyncat', 'lastupdated', 'lastmodified',
  'created', 'updated', 'modified',

  // ── Embedded binary / raw source blobs ──────────────────────────────────
  'imagebase64', 'imagedata', 'imageblob',
  'rawhtml', 'rawhtmlcontent', 'htmlbody', 'rawjson',

  // NOTE: image URL keys USED to live here but were causing the audit to
  // report "0 item-level images" / "0 category-level images" because the
  // model lost the "has image" signal entirely. They're now handled by
  // IMAGE_URL_KEYS below, which COMPACTS each value to "[image]" instead
  // of dropping the field — preserves the count signal while still saving
  // most of the bytes (CDN URLs are 80–200 chars; "[image]" is 7).

  // ── Sync / catalog plumbing ─────────────────────────────────────────────
  'syncstate', 'sync_state', 'syncstatus', 'sync_status',
  'tenantid', 'tenant_id', 'merchantid', 'merchant_id',
  'accountid', 'account_id', 'organizationid', 'organization_id',
  'orgid', 'org_id', 'ownerid', 'owner_id', 'workspaceid', 'workspace_id',

  // ── Hashes / signatures / checksums ─────────────────────────────────────
  'etag', 'hash', 'sha', 'signature', 'checksum', 'fingerprint',

  // ── Secondary IDs ───────────────────────────────────────────────────────
  // The audit prompt only uses the primary `id` field for modifier
  // cross-reference. Internal/external/POS/legacy IDs are pure plumbing
  // and can be huge across thousands of items.
  'internalid', 'internal_id',
  'externalid', 'external_id',
  'posid', 'pos_id', 'positemid', 'pos_item_id',
  'legacyid', 'legacy_id',
  'erpid', 'erp_id',
  'sourceid', 'source_id',
  'globalid', 'global_id',
  'shortid', 'short_id',
  'publicid', 'public_id',
  'productcode', 'product_code', 'sku',
  'barcode', 'plu',

  // ── Translations / localisation ─────────────────────────────────────────
  // Multi-language menus duplicate every name/description across N locales.
  // The audit is in English — drop the rest entirely.
  'translations', 'translatedfields', 'translated_fields',
  'localizations', 'localisations',
  'i18n', 'locales', 'localecontent', 'locale_content',
  'translatedname', 'translated_name',
  'translateddescription', 'translated_description',

  // ── Nutrition / allergen / dietary ──────────────────────────────────────
  // Large structured per-item blobs not used by the audit prompt's
  // analytical sections.
  'nutrition', 'nutritionfacts', 'nutrition_facts',
  'nutritioninfo', 'nutrition_info', 'nutritionalinfo', 'nutritional_info',
  'allergens', 'allergeninfo', 'allergen_info',
  'dietary', 'dietaryinfo', 'dietary_info',
  'dietaryconfiguration', 'dietary_configuration',
  'macros', 'caloriebreakdown', 'calorie_breakdown',
  'kcal', 'energykj', 'energy_kj',

  // ── Availability / scheduling ───────────────────────────────────────────
  // Weekly windows / day-of-week schedules — large arrays, not used by the
  // audit (CSVs provide the actual traffic data).
  'availability', 'availabilitywindow', 'availability_window',
  'availabilityschedule', 'availability_schedule',
  'schedule', 'schedules',
  'opentimes', 'open_times', 'openinghours', 'opening_hours',
  'unavailabletimes', 'unavailable_times',
  'datestart', 'dateend', 'date_start', 'date_end',
  'startdate', 'enddate', 'start_date', 'end_date',
]);

// Aggressive cap. Real item descriptions sit at 50–500 chars; even a
// generous menu blurb fits in 800. Hard-truncating here catches the
// pathological cases (embedded HTML, log dumps, full terms-of-service
// pasted into description fields) and is the highest-leverage knob for
// shrinking a multi-megabyte Flipdish export.
const HARD_STRING_CAP = 800;

// Keys whose values are image URLs / paths. We compact the value to a
// short marker ("[image]") rather than stripping the field entirely —
// the audit prompt counts items / categories with images, so it needs
// the field to survive even if the URL itself is useless to the model.
// Lowercased; case-insensitive lookup matches camelCase/snake_case.
const IMAGE_URL_KEYS = new Set([
  'image', 'images',
  'imageurl', 'image_url', 'imageurls', 'image_urls',
  'thumbnail', 'thumbnails',
  'thumbnailurl', 'thumbnail_url',
  'heroimage', 'hero_image',
  'heroimageurl', 'hero_image_url',
  'icon', 'iconurl', 'icon_url',
  'banner', 'bannerurl', 'banner_url',
  'photo', 'photos',
  'photourl', 'photo_url',
  'cover', 'coverimage', 'cover_image',
  'coverimageurl', 'cover_image_url',
  'backgroundimage', 'background_image',
  'backgroundimageurl', 'background_image_url',
  'logo', 'logourl', 'logo_url',
  'picture', 'pictures',
  'pictureurl', 'picture_url',
  'avatar', 'avatarurl', 'avatar_url',
  'imagepath', 'image_path',
  'imagekey', 'image_key',
  'mediaurl', 'media_url',
]);

// Replace an image-URL value with a compact "[image]" marker. Preserves
// null / empty values verbatim so the model can still tell which items
// genuinely have no image vs which ones do. Handles single strings,
// arrays of URLs, and nested objects with a `url` field.
function compactImageValue(val) {
  if (val == null) return val;
  if (val === '' || val === false) return val;
  if (Array.isArray(val)) {
    return val
      .map(x => {
        if (x == null || x === '') return x;
        if (typeof x === 'string') return '[image]';
        if (typeof x === 'object' && (x.url || x.src || x.href)) return '[image]';
        return x;
      })
      .filter(x => x != null);
  }
  if (typeof val === 'string') return '[image]';
  if (typeof val === 'object' && (val.url || val.src || val.href)) return '[image]';
  // Unknown shape (number, deeply nested object without url/src) — pass through
  return val;
}

// Key names where an item lists the modifier-group IDs it carries.
// Used to compute the set of referenced modifier definitions so we can
// drop orphans (definitions no item points at) — pure dead weight that
// adds nothing to the audit.
const MODIFIER_REF_KEYS = new Set([
  'modifierids', 'modifier_ids',
  'modifiergroupids', 'modifier_group_ids',
]);
// Parent-array keys that hold modifier-group definitions at the top level.
// When we hit one of these, we filter the array to keep only definitions
// whose id appears in the reference set.
const MODIFIER_DEF_KEYS = new Set([
  'modifiers', 'modifiergroups', 'modifier_groups',
  'optionsgroups', 'options_groups',
]);

// Collect every modifier-group id that any item references. Walks the
// menu once before the main slim pass so we know which modifier
// definitions are actually used.
function collectReferencedModifierIds(v, set = new Set()) {
  if (v == null || typeof v !== 'object') return set;
  if (Array.isArray(v)) {
    for (const item of v) collectReferencedModifierIds(item, set);
    return set;
  }
  for (const [k, val] of Object.entries(v)) {
    if (MODIFIER_REF_KEYS.has(k.toLowerCase()) && Array.isArray(val)) {
      for (const id of val) {
        if (id != null) set.add(String(id));
      }
    } else if (val && typeof val === 'object') {
      collectReferencedModifierIds(val, set);
    }
  }
  return set;
}

// True if this object looks like a modifier-group definition (has an id
// AND a choices-array shape). We only filter objects matching this
// heuristic so we don't accidentally drop unrelated objects with an id.
function isModifierDef(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const id = obj.id ?? obj.Id ?? obj.ID;
  if (id == null) return false;
  return Array.isArray(obj.options) || Array.isArray(obj.Options) ||
         Array.isArray(obj.choices) || Array.isArray(obj.Choices) ||
         Array.isArray(obj.values)  || Array.isArray(obj.Values)  ||
         Array.isArray(obj.modifiers) || Array.isArray(obj.Modifiers);
}

// Returns true if an object looks like a disabled / archived menu item
// that won't contribute to the audit. We skip these entirely so the
// model isn't asked to analyse decommissioned products.
function isDisabledItem(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (obj.enabled === false) return true;
  if (obj.isEnabled === false) return true;
  if (obj.disabled === true) return true;
  if (obj.isDisabled === true) return true;
  if (obj.isActive === false) return true;
  if (obj.active === false) return true;
  if (obj.isAvailable === false) return true;
  if (obj.available === false) return true;
  if (obj.isDeleted === true) return true;
  if (obj.deleted === true) return true;
  if (obj.archived === true) return true;
  if (obj.isArchived === true) return true;
  // Truthy soft-delete timestamp
  if (obj.deletedAt || obj.deleted_at || obj.archivedAt || obj.archived_at) return true;
  return false;
}

export function slimMenu(v) {
  // Pre-walk to learn which modifier-group ids any item actually
  // references. Unreferenced definitions get dropped below.
  const referencedModifierIds = collectReferencedModifierIds(v);
  return _slimInner(v, referencedModifierIds, null);
}

// ── Chunking helpers ──────────────────────────────────────────────────────
// Used by /api/analyze when the slimmed menu is still too large to fit in
// the 1M-context Sonnet model. We split the menu by top-level categories
// (never partial categories) into N balanced buckets and the endpoint
// fires N parallel-shaped sequential LLM calls, piping their streamed
// outputs back to the client with "Part X of N" separators.

// Recursively locate the menu's `categories` array (or PascalCase /
// snake_case variant). Returns { container, key, array } or null. We
// walk into nested objects (not arrays) because Flipdish exports
// sometimes wrap the menu in {menu: {categories: [...]}} or similar.
export function findCategoriesArray(obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return null;
  // Direct hit at this level
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && k.toLowerCase() === 'categories') {
      return { container: obj, key: k, array: v };
    }
  }
  // Recurse into nested objects
  for (const [, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const found = findCategoriesArray(v);
      if (found) return found;
    }
  }
  return null;
}

// Greedy balanced split: sort categories by serialized JSON size descending,
// assign each to the smallest current bucket. Produces N chunks each
// containing whole categories. Returns null if the menu has fewer
// categories than chunks (no split possible).
export function chunkMenuByCategories(slim, numChunks) {
  if (numChunks <= 1) return [slim];
  const found = findCategoriesArray(slim);
  if (!found || found.array.length < numChunks) return null;

  const categories = found.array;
  const sizes = categories.map(c => JSON.stringify(c).length);
  // Sort original indices by size descending
  const order = Array.from({ length: categories.length }, (_, i) => i)
    .sort((a, b) => sizes[b] - sizes[a]);

  const buckets = Array.from({ length: numChunks }, () => ({ size: 0, indices: [] }));
  for (const i of order) {
    let smallest = buckets[0];
    for (let b = 1; b < buckets.length; b++) {
      if (buckets[b].size < smallest.size) smallest = buckets[b];
    }
    smallest.indices.push(i);
    smallest.size += sizes[i];
  }

  // For each bucket, deep-clone the menu and replace the categories
  // array with this bucket's slice (sorted back into original order
  // so the audit reads in the same sequence as the source menu).
  return buckets.map(bucket => {
    const cloned = JSON.parse(JSON.stringify(slim));
    const clonedFound = findCategoriesArray(cloned);
    if (clonedFound) {
      clonedFound.container[clonedFound.key] = bucket.indices
        .sort((a, b) => a - b)
        .map(i => categories[i]);
    }
    return cloned;
  });
}

function _slimInner(v, refIds, parentKey) {
  if (v == null) return v;
  if (typeof v === 'string') {
    // Replace embedded binary data URIs with a marker — the model can't act
    // on raw bytes anyway, and they cost a lot of tokens.
    if (v.startsWith('data:image') || v.startsWith('data:application')) return '[binary]';
    let s = v;
    // Strip HTML tags from descriptions (Flipdish exports often have rich-text
    // HTML in description fields). Preserve the visible text.
    if (/<[a-z][^>]*>/i.test(s)) {
      s = s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // Hard truncation — applies to any string over 800 chars. See
    // HARD_STRING_CAP comment above for rationale.
    if (s.length > HARD_STRING_CAP) {
      s = s.slice(0, HARD_STRING_CAP) + `…[+${s.length - HARD_STRING_CAP} chars]`;
    }
    return s;
  }
  if (Array.isArray(v)) {
    // If this array sits under a modifiers/modifierGroups key, filter out
    // any definition whose id isn't referenced by some item's modifierIds.
    // Orphan definitions contribute nothing to the audit and can be a
    // large fraction of a long-lived Flipdish menu.
    const isModifierArray = parentKey && MODIFIER_DEF_KEYS.has(parentKey.toLowerCase());
    let items = v;
    if (isModifierArray && refIds && refIds.size > 0) {
      items = v.filter(obj => {
        if (!isModifierDef(obj)) return true; // unknown shape — keep
        const id = String(obj.id ?? obj.Id ?? obj.ID);
        return refIds.has(id);
      });
    }
    return items
      .map(item => _slimInner(item, refIds, null))
      .filter(x => x !== undefined);
  }
  if (typeof v === 'object') {
    if (isDisabledItem(v)) return undefined;
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const kl = k.toLowerCase();
      if (NOISE_KEYS.has(kl)) continue;
      // Image URL fields — compact the value to "[image]" so the audit
      // can still count items / categories that have images. See
      // IMAGE_URL_KEYS / compactImageValue for rationale.
      if (IMAGE_URL_KEYS.has(kl)) {
        out[k] = compactImageValue(val);
        continue;
      }
      out[k] = _slimInner(val, refIds, k);
    }
    return out;
  }
  return v;
}
