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
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (production) h.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return h;
}

/** Best-effort client IP from proxy headers (only trust these behind your own reverse proxy). */
export function clientIp(headers: { get(name: string): string | null }): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}
export { contentSecurityPolicy, newNonce } from "./csp";
