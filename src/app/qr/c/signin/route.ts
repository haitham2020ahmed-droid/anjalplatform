import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin, clientIp, isSameOriginPost, sessionCookie, sessionCookieName } from "@/server/auth/http";
import { getAuthConfig, isProd, repo } from "@/server/auth/next";
import { revokeSession } from "@/server/auth/sessions";
import { PrintQrError, signInByName } from "@/server/auth/class-print-qr";

export const runtime = "nodejs";

/** Relative redirects only: behind Render's proxy the request URL carries an internal host. */
const go = (to: string) => new NextResponse(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

/**
 * 👆 Printed class QR (r85, fixed Oct 2026 "الكود مالوش داعي... اي حد ممكن يستخدمه"): a student tapped their name on
 * /qr/c/<token>. A plain form post to a fixed address — no class code any more (see class-print-qr.ts#signInByName
 * for why). Success → that student's own short session → student home (a session of someone else on this device
 * ends first).
 */
export async function POST(req: Request) {
  // same-origin only (as the username/password sign-in): APP_URL, or the host this request reached
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); }
  catch { if (!isSameOriginPost(req.headers, env.APP_URL)) return new NextResponse("Cross-site request blocked.", { status: 403 }); }
  let form: FormData;
  try { form = await req.formData(); } catch { return go("/login"); }
  const key = String(form.get("key") ?? "").trim().slice(0, 100);
  const studentId = String(form.get("studentId") ?? "").slice(0, 40);
  const back = (e: string) => go(key && /^[A-Za-z0-9_-]+$/.test(key) ? `/qr/c/${key}?e=${e}` : "/login");
  if (!key || !studentId) return back("RETRY");
  try {
    const r = await signInByName(repo, { token: key, studentId, ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") }, getAuthConfig());
    const name = sessionCookieName(isProd);
    const old = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
    if (old) await revokeSession(repo, decodeURIComponent(old)).catch(() => undefined);
    const res = go(r.user.mustChangePassword ? "/change-password" : "/student");
    const c = sessionCookie(r.token, r.expiresAt, isProd);
    res.cookies.set(c.name, c.value, c);
    return res;
  } catch (e) {
    if (e instanceof PrintQrError) return back(e.code);
    throw e;
  }
}
