// Single source of truth for the Anthropic model ids used by every endpoint.
//
// Edge functions (analyze, review, format-report, format-notion, prompts)
// import either MODEL directly or pickModel(useSonnet) — the picker lets
// the UI flip individual runs onto the cheaper Sonnet model for A/B
// comparison without redeploying.
//
// Pricing reminder (very rough, as of early 2026):
//   Sonnet 4.x   ≈  $3 in / $15 out per million tokens
//   Opus 4.x     ≈ $15 in / $75 out per million tokens  (~5× Sonnet)
// An audit run uses ~50-150K input tokens and ~10-40K output tokens;
// multiply across analyze + review + format passes for the total.

export const MODEL        = 'claude-opus-4-6';     // default for production traffic
export const SONNET_MODEL = 'claude-sonnet-4-6';   // opt-in via UI toggle for cost-comparison

// Pick a model based on a UI flag. Truthy → Sonnet, otherwise → the default.
// Used by all endpoints so the toggle works end-to-end with no per-route logic.
export function pickModel(useSonnet: boolean): string {
  return useSonnet ? SONNET_MODEL : MODEL;
}

// 1M-context Sonnet variant. Anthropic exposes the 1M-token context window
// as a beta header on the standard Sonnet model id — no separate model
// string. Headers + threshold are exported so /api/analyze and /api/review
// can auto-promote large menus onto the long-context channel without the
// user toggling anything.
export const LONG_CONTEXT_BETA = 'context-1m-2025-08-07';

// Slimmed-menu char count at which we auto-promote to the 1M-context
// Sonnet. ~500KB ≈ 125K input tokens for the menu alone — plus prompt
// (~7K), supporting reports (up to 180K when 12 CSVs are attached),
// thinking budget (8K), and output reservation (40K) easily overflows
// the standard 200K context. The 1M variant has 5× the headroom.
export const LONG_CONTEXT_THRESHOLD_CHARS = 500_000;

// Decide model + beta header for a given input size and Sonnet preference.
// Returns: { model, beta, longContext, reason }
//   - beta:        anthropic-beta header value, or null
//   - longContext: true iff the 1M-context channel was selected
//   - reason:      short string for the UI disclaimer
//                  ('user_confirm', 'menu_size', 'manual')
//
// Logic, in priority order:
//   1. forceLongContext flag (client confirmed via size modal) → Sonnet 1M
//   2. menuChars > LONG_CONTEXT_THRESHOLD_CHARS → Sonnet 1M (safety net
//      for menus that grew unexpectedly large; the client modal should
//      normally catch this, but the auto-promote keeps the experience
//      stable if the client somehow forgot to flag a big upload)
//   3. Otherwise → honour the user's Sonnet toggle: Sonnet if on, else Opus
export function pickModelForRun({
  menuChars = 0,
  useSonnet = false,
  forceLongContext = false,
}: {
  menuChars?: number;
  useSonnet?: boolean;
  forceLongContext?: boolean;
} = {}): { model: string; beta: string | null; longContext: boolean; reason: string | null } {
  if (forceLongContext) {
    return {
      model: SONNET_MODEL,
      beta: LONG_CONTEXT_BETA,
      longContext: true,
      reason: 'user_confirm',
    };
  }
  if (menuChars > LONG_CONTEXT_THRESHOLD_CHARS) {
    return {
      model: SONNET_MODEL,
      beta: LONG_CONTEXT_BETA,
      longContext: true,
      reason: 'menu_size',
    };
  }
  return {
    model: useSonnet ? SONNET_MODEL : MODEL,
    beta: null,
    longContext: false,
    reason: useSonnet ? 'manual' : null,
  };
}
