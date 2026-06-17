/**
 * How long a saved review session lives before it's eligible for cleanup.
 *
 * Sessions are persisted in Supabase along with all their comments. To keep
 * the database from accumulating stale rows indefinitely, every newly-created
 * session is stamped with an `expires_at` value 30 days into the future.
 * A `pg_cron` job on the Supabase side (or any scheduled task hitting
 * `DELETE FROM compare_sessions WHERE expires_at < NOW()`) sweeps them away.
 *
 * The client also refuses to load sessions whose `expires_at` is in the past
 * so reviewers see a clear "expired" state instead of an empty session.
 */
export const SESSION_TTL_DAYS = 30;

/** Returns an ISO-8601 timestamp `SESSION_TTL_DAYS` days from now. */
export function computeSessionExpiry(now: Date = new Date()): string {
  const expiry = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  return expiry.toISOString();
}

/**
 * Strip fields that should not be persisted to Supabase.
 * `compactPricing` can be very large (mirrors every price for every band) and
 * is only needed client-side for the price-band switcher; the baked-in prices
 * on items/options are sufficient for session reload.
 */
export function stripForStorage<T extends { metadata?: Record<string, unknown> } | null | undefined>(menu: T): T {
  if (!menu) return menu;
  const { compactPricing: _cp, ...rest } = (menu as any).metadata ?? {};
  return { ...(menu as any), metadata: rest } as T;
}

/** True if the supplied ISO timestamp is strictly before "now". */
export function isExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t < now.getTime();
}

/** Human-friendly "in 30 days" / "in 4 hours" string for the share UI. */
export function formatRelativeExpiry(expiresAt: string | null | undefined, now: Date = new Date()): string {
  if (!expiresAt) return 'never';
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const diffMs = t - now.getTime();
  if (diffMs <= 0) return 'expired';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days >= 2) return `in ${days} days`;
  if (days === 1) return 'in 1 day';
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours >= 2) return `in ${hours} hours`;
  if (hours === 1) return 'in 1 hour';
  return 'in under an hour';
}
