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
import { isClassSignInPath } from "@/server/auth/http";

const PUBLIC = ["/login", "/_next", "/favicon", "/api/health", "/brand/", "/api/school-logo", "/manifest.webmanifest", "/sw.js", "/icons/", "/offline.html", "/api/ui-lang"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const production = process.env.NODE_ENV === "production";
  const nonce = newNonce();
  const csp = contentSecurityPolicy({ production, nonce });

  // the Class QR sign-in pages (r76) are open without a session: the student is about to sign in
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p)) || isClassSignInPath(pathname);
  const hasCookie = req.cookies.has("__Host-ela_session") || req.cookies.has("ela_session");
  if (!isPublic && !hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // come back here after signing in (e.g. a game joined from a QR code); pages only, never API calls
    url.search = req.method === "GET" && !pathname.startsWith("/api") && pathname !== "/" ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-pathname", pathname);   // the page frame keeps English content left-to-right in Arabic mode
  headers.set("x-search", req.nextUrl.search);   // the page frame's report bar (which report, class, student, range)
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

// The question upload and the Fluency Coach recording routes are left out: Next.js cuts request bodies passing through
// middleware at 10 MB (Excel files with pictures: up to 50 MB; a 4-minute reading: up to 12 MB). Both routes check
// the session and the origin themselves.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/question-imports|api/fluency/score).*)"] };
