import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin, clientIp, isSameOriginPost, sessionCookie, sessionCookieName } from "@/server/auth/http";
import { getAuthConfig, isProd, repo } from "@/server/auth/next";
import { revokeSession } from "@/server/auth/sessions";
import { ClassSignInError, signInByName } from "@/server/auth/class-signin";

export const runtime = "nodejs";

/** Relative redirects only: behind Render's proxy the request URL carries an internal host. */
const go = (to: string) => new NextResponse(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

/**
 * 👆 Class sign-in (r76): a student tapped their name on /qr/<key>. A plain form post to a fixed address (works across
 * deployments). Success → that student's own short session (end of school day / 3 hours) → student home. A session
 * of someone else on this device ends first (shared classroom devices).
 */
export async function POST(req: Request) {
  // same-origin only (as the username/password sign-in): APP_URL, or the host this request reached
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); }
  catch { if (!isSameOriginPost(req.headers, env.APP_URL)) return new NextResponse("Cross-site request blocked.", { status: 403 }); }
  let form: FormData;
  try { form = await req.formData(); } catch { return go("/qr"); }
  const key = String(form.get("key") ?? "").trim().slice(0, 100);
  const studentId = String(form.get("studentId") ?? "").slice(0, 40);
  const back = (e: string) => go(key && /^[A-Za-z0-9_-]+$/.test(key) ? `/qr/${key}?e=${e}` : "/qr");
  if (!key || !studentId) return back("RETRY");
  try {
    const r = await signInByName(repo, { key, studentId, ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") }, getAuthConfig());
    const name = sessionCookieName(isProd);
    const old = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
    if (old) await revokeSession(repo, decodeURIComponent(old)).catch(() => undefined);
    const res = go(r.user.mustChangePassword ? "/change-password" : "/student");
    const c = sessionCookie(r.token, r.expiresAt, isProd);
    res.cookies.set(c.name, c.value, c);
    return res;
  } catch (e) {
    if (e instanceof ClassSignInError) return back(e.code);
    throw e;
  }
}
