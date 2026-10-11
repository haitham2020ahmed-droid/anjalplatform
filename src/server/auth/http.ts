/**
 * HTTP-level protections (pure functions, used by Next.js handlers and next.config).
 *
 * CSRF: Server Actions are protected by Next.js (POST-only + Origin/Host check).
 * Route handlers that mutate state call `assertSameOrigin`, and the session cookie
 * is SameSite=Lax, so cross-site form posts never carry it.
 */

/** "__Host-" prefix (production) forces Secure, Path=/ and no Domain: the cookie cannot be set by subdomains. */
export function sessionCookieName(production: boolean): string {
  return production ? "__Host-ela_session" : "ela_session";
}

export interface CookieSpec {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  expires: Date;
}

export function sessionCookie(token: string, expiresAt: Date, production: boolean): CookieSpec {
  return { name: sessionCookieName(production), value: token, httpOnly: true, secure: production, sameSite: "lax", path: "/", expires: expiresAt };
}

export function clearedSessionCookie(production: boolean): CookieSpec {
  return { ...sessionCookie("", new Date(0), production) };
}

/** Same-origin check for state-changing route handlers. */
export function isSameOrigin(headers: { origin?: string | null; referer?: string | null; host?: string | null }, appUrl: string): boolean {
  const allowed = new URL(appUrl).origin;
  const source = headers.origin ?? (headers.referer ? safeOrigin(headers.referer) : null);
  if (!source) return false; // browsers always send Origin on cross-site POST; missing = reject
  return source === allowed;
}

function safeOrigin(u: string): string | null {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

export function assertSameOrigin(headers: { origin?: string | null; referer?: string | null; host?: string | null }, appUrl: string): void {
  if (!isSameOrigin(headers, appUrl)) throw Object.assign(new Error("Cross-site request blocked."), { status: 403 });
}

/**
 * Security headers applied to every response (next.config.ts). The Content-Security-
 * Policy is NOT here: it needs a per-request nonce and is set by middleware (csp.ts).
 */
export function securityHeaders(production: boolean): { key: string; value: string }[] {
  const h = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // the microphone only for this site (students record themselves reading aloud)
    { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (production) h.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return h;
}

/**
 * Client IP from proxy headers. X-Forwarded-For is "client, proxy1, proxy2, ..."
 * where every proxy APPENDS the address it saw. Everything left of what our own
 * trusted proxies appended is client-controlled (a client can send any XFF it
 * likes), so we take the address TRUSTED_PROXY_HOPS positions from the right
 * (default 1 = the address appended by the single trusted proxy, e.g. Render).
 * Taking the left-most value would let a client rotate fake IPs and bypass
 * per-IP login rate limits.
 */
export function clientIp(
  headers: { get(name: string): string | null },
  hops: number = trustedProxyHops(),
): string {
  // Render sits behind Cloudflare: Cloudflare overwrites these with the address it saw, so a client cannot fake them,
  // and every user does not collapse onto one Cloudflare edge address (which the right-most XFF entry can be there).
  const edge = headers.get("cf-connecting-ip")?.trim() || headers.get("true-client-ip")?.trim();
  if (edge) return edge;
  const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length) {
    const n = Math.max(1, Math.floor(hops) || 1);
    // fewer entries than hops: the left-most one is the closest we can get
    return parts[Math.max(0, parts.length - n)];
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

function trustedProxyHops(): number {
  const n = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
export { contentSecurityPolicy, newNonce } from "./csp";
