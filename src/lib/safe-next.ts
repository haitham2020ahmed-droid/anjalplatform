/**
 * Where to go after signing in (`next`): only an internal page path is followed — never another site ("//x", "/\x",
 * "http:"), never the sign-in page itself or an API address. Every plan link (src/lib/plan-links.ts) qualifies, so a
 * link clicked in a downloaded PDF while signed out opens the sign-in page and then the same skill straight after.
 */
export const safeNext = (v: unknown): string => { const t = String(v ?? ""); return /^\/(?![\/\\])[^\s]*$/.test(t) && t.length <= 300 && !t.startsWith("/login") && !t.startsWith("/api") ? t : ""; };
