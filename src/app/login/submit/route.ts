import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, clientIp, sessionCookie } from "@/server/auth/http";
import { env } from "@/lib/env";
import { login } from "@/server/auth/login";
import { getAuthConfig, HOME_BY_ROLE, isProd, repo } from "@/server/auth/next";
import type { Role } from "@/server/auth/rbac";

export const runtime = "nodejs";

const LoginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username.").max(100),
  password: z.string().min(1, "Enter your password.").max(128),
});

/** Relative redirects only: behind Render's proxy the request URL carries an internal host. */
const go = (to: string) => new NextResponse(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store" } });
const back = (error: string, username: string, next = "") => go(`/login?${new URLSearchParams({ error, ...(username ? { u: username.slice(0, 100) } : {}), ...(next ? { next } : {}) })}`);
/** Only an internal path is followed after sign-in (never another site: “//x”, “/\x”, “http:”). */
const safeNext = (v: unknown): string => { const t = String(v ?? ""); return /^\/(?![\/\\])[^\s]*$/.test(t) && t.length <= 300 && !t.startsWith("/login") && !t.startsWith("/api") ? t : ""; };

/**
 * Sign in by a plain form POST to a fixed address (not a Server Action): a sign-in page left open
 * across a deployment keeps working (Server Action ids change with every build).
 */
export async function POST(req: Request) {
  // same-origin only (what Server Actions checked for us): APP_URL, or the host this request reached
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); }
  catch {
    const origin = req.headers.get("origin") ?? req.headers.get("referer");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let ok = false;
    try { ok = Boolean(origin && host && new URL(origin).host === host); } catch { ok = false; }
    if (!ok) return new NextResponse("Cross-site request blocked.", { status: 403 });
  }
  let form: FormData;
  try { form = await req.formData(); } catch { return back("Please try again.", ""); }
  const username = String(form.get("username") ?? "");
  const next = safeNext(form.get("next"));
  const parsed = LoginSchema.safeParse({ username, password: form.get("password") });
  if (!parsed.success) return back(parsed.error.issues[0].message, username, next);
  const r = await login(repo, { ...parsed.data, ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") }, getAuthConfig());
  if (!r.ok) return back(r.message, username, next);
  const res = go(r.mustChangePassword ? "/change-password" : next || HOME_BY_ROLE[String(r.user.role) as Role]);
  const c = sessionCookie(r.token, r.expiresAt, isProd);
  res.cookies.set(c.name, c.value, c);
  return res;
}
