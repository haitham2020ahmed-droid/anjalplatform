/**
 * Content-Security-Policy (Phase 12). Edge-safe: no Node imports (used by middleware).
 *
 * Next.js (App Router) bootstraps every page with small INLINE scripts. A production
 * policy of `script-src 'self'` blocks them, so the pages would render but nothing
 * interactive would work. The fix documented by Next.js: middleware creates a random
 * nonce per request, puts it in the policy, and Next.js adds it to its own scripts.
 * 'strict-dynamic' lets those trusted scripts load the app's chunks; inline scripts
 * without the nonce (e.g. injected by an attacker) stay blocked.
 */
export function contentSecurityPolicy(opts: { production: boolean; nonce?: string }): string {
  const script = opts.production
    ? opts.nonce ? `'self' 'nonce-${opts.nonce}' 'strict-dynamic'` : "'self'"
    : "'self' 'unsafe-eval' 'unsafe-inline'"; // development: React refresh needs eval
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'", // Next.js/Tailwind inject critical CSS; styles cannot run code
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // recordings (blob:) and word pronunciations from the free dictionary
    "media-src 'self' blob: https://api.dictionaryapi.dev https://ssl.gstatic.com",
    "manifest-src 'self'",
    "worker-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** 128-bit random nonce, base64 (Web Crypto: works on the Edge and in Node). */
export function newNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}
