import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin, clientIp, isSameOriginPost, sessionCookie, sessionCookieName } from "@/server/auth/http";
import { getAuthConfig, isProd, repo } from "@/server/auth/next";
import { revokeSession } from "@/server/auth/sessions";
import { PrintQrError, signInByClassCode } from "@/server/auth/class-print-qr";

export const runtime = "nodejs";

/** Relative redirects only: behind Render's proxy the request URL carries an internal host. */
const go = (to: string) => new NextResponse(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

/**
 * 🔢 Printed class QR (r85): a student tapped their name on /qr/c/<token> and typed the class code. A plain form post
 * to a fixed address. Success → that student's own short session → student home (a session of someone else on this
 * device ends first). Wrong code → back to the code page (5 wrong from one device in 10 minutes lock that name).
 */
export async function POST(req: Request) {
  // same-origin only (as the username/password sign-in): APP_URL, or the host this request reached
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); }
  catch { if (!isSameOriginPost(req.headers, env.APP_URL)) return new NextResponse("Cross-site request blocked.", { status: 403 }); }
  let form: FormData;
  try { form = await req.formData(); } catch { return go("/login"); }
  const key = String(form.get("key") ?? "").trim().slice(0, 100);
  const studentId = String(form.get("studentId") ?? "").slice(0, 40);
  const code = String(form.get("code") ?? "").slice(0, 12);
  const okKey = key && /^[A-Za-z0-9_-]+$/.test(key);
  const okId = /^[A-Za-z0-9_-]{1,40}$/.test(studentId);
  const back = (e: string) => go(okKey ? `/qr/c/${key}?${okId ? `s=${encodeURIComponent(studentId)}&` : ""}e=${e}` : "/login");
  if (!okKey || !okId) return back("RETRY");
  try {
    const r = await signInByClassCode(repo, { token: key, studentId, code, ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") }, getAuthConfig());
    const name = sessionCookieName(isProd);
    const old = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
    if (old) await revokeSession(repo, decodeURIComponent(old)).catch(() => undefined);
    const res = go(r.user.mustChangePassword ? "/change-password" : "/student");
    const c = sessionCookie(r.token, r.expiresAt, isProd);
    res.cookies.set(c.name, c.value, c);
    return res;
  } catch (e) {
    if (e instanceof PrintQrError) return e.code === "OFF" ? go(`/qr/c/${key}?e=OFF`) : back(e.code);
    throw e;
  }
}
