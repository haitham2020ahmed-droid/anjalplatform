/**
 * Edge middleware:
 *  1. Content-Security-Policy with a fresh nonce on every response (Phase 12). Next.js
 *     reads the nonce from the request header and adds it to its inline scripts.
 *  2. Fast redirect to /login when no session cookie is present. It does NOT trust the
 *     cookie: full validation (DB lookup, expiry, revocation, role) happens server-side
 *     in requireActor(). This only spares a round trip.
 */
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, newNonce } from "@/server/auth/csp";

const PUBLIC = ["/login", "/_next", "/favicon", "/api/health", "/brand/", "/api/school-logo"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const production = process.env.NODE_ENV === "production";
  const nonce = newNonce();
  const csp = contentSecurityPolicy({ production, nonce });

  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
  const hasCookie = req.cookies.has("__Host-ela_session") || req.cookies.has("ela_session");
  if (!isPublic && !hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
