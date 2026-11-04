import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { hashToken } from "@/server/auth/config";
import { assertSameOrigin, clearedSessionCookie, sessionCookieName } from "@/server/auth/http";
import { isProd, repo } from "@/server/auth/next";
import { clearOwnSignInUse } from "@/server/auth/class-signin";
import { revokeSession } from "@/server/auth/sessions";

/** POST-only (a GET link could be triggered by another site). Same-origin enforced. */
export async function POST() {
  const h = await headers();
  try {
    assertSameOrigin({ origin: h.get("origin"), referer: h.get("referer") }, env.APP_URL);
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const jar = await cookies();
  const token = jar.get(sessionCookieName(isProd))?.value;
  if (token) {
    // 🐛 fix (Oct 2026, "يقدر يدخل تاني"): look up who this session belongs to BEFORE revoking it, so a student who
    // signed in by class QR and then signs themselves out is immediately free to scan the QR and sign back in — no
    // teacher action needed. A no-op for anyone who never signed in by class QR today.
    const session = await repo.findUnique("Session", { id: hashToken(token) });
    if (session?.userId) await clearOwnSignInUse(repo, String(session.userId)).catch(() => undefined);
    await revokeSession(repo, token);
  }
  const c = clearedSessionCookie(isProd);
  jar.set(c.name, c.value, c);
  return NextResponse.redirect(new URL("/login", env.APP_URL), 303);
}
