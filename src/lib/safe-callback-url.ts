/**
 * Returns a safe callback URL to prevent open redirects.
 * Allows: relative paths (e.g. /, /report) and same-origin absolute URLs when origin is provided.
 * Rejects: protocol-relative (//) and other-origin absolute URLs.
 */
export function getSafeCallbackUrl(callbackUrl: string | null | undefined, origin?: string): string {
  if (!callbackUrl || typeof callbackUrl !== 'string') return '/';
  const trimmed = callbackUrl.trim();
  if (trimmed === '') return '/';
  if (trimmed.startsWith('//')) return '/';
  if (trimmed.startsWith('/')) return trimmed;
  if (origin) {
    try {
      const url = new URL(trimmed, origin);
      if (url.origin === origin) return url.pathname + url.search + url.hash;
    } catch {
      // invalid URL
    }
  }
  return '/';
}
