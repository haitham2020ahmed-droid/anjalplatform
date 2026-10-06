import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin, clearedSessionCookie, sessionCookieName } from "@/server/auth/http";
import { isProd, repo } from "@/server/auth/next";
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
  if (token) await revokeSession(repo, token);
  const c = clearedSessionCookie(isProd);
  jar.set(c.name, c.value, c);
  return NextResponse.redirect(new URL("/login", env.APP_URL), 303);
}
