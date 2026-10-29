import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin, clientIp, isSameOriginPost, sessionCookie, sessionCookieName } from "@/server/auth/http";
import { getAuthConfig, isProd, repo } from "@/server/auth/next";
import { revokeSession } from "@/server/auth/sessions";
import { AssignedQrError, assignedQrSignIn } from "@/server/auth/assigned-qr";

export const runtime = "nodejs";

/** Relative redirects only: behind Render's proxy the request URL carries an internal host. */
const go = (to: string) => new NextResponse(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

/**
 * 👆 Assigned-item QR / link (owner request, Oct 2026): a student tapped their name on /qr/a/<token>. A plain form
 * post, no class code (same reasoning as the printed class QR, class-print-qr.ts#signInByName). Success → that
 * student's own session → straight to THIS item's own solve page (assignedQrSignIn resolves it), not student home.
 */
export async function POST(req: Request) {
  // same-origin only (as the username/password sign-in): APP_URL, or the host this request reached
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); }
  catch { if (!isSameOriginPost(req.headers, env.APP_URL)) return new NextResponse("Cross-site request blocked.", { status: 403 }); }
  let form: FormData;
  try { form = await req.formData(); } catch { return go("/login"); }
  const key = String(form.get("key") ?? "").trim().slice(0, 300);
  const studentId = String(form.get("studentId") ?? "").slice(0, 40);
  const back = (e: string) => go(key && /^[A-Za-z0-9_.|-]+$/.test(key) ? `/qr/a/${key}?e=${e}` : "/login");
  if (!key || !studentId) return back("RETRY");
  try {
    const r = await assignedQrSignIn(repo, { token: key, studentId, ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") }, getAuthConfig());
    const name = sessionCookieName(isProd);
    const old = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
    if (old) await revokeSession(repo, decodeURIComponent(old)).catch(() => undefined);
    const res = go(r.user.mustChangePassword ? "/change-password" : r.href);
    const c = sessionCookie(r.token, r.expiresAt, isProd);
    res.cookies.set(c.name, c.value, c);
    return res;
  } catch (e) {
    if (e instanceof AssignedQrError) return back(e.code);
    throw e;
  }
}
