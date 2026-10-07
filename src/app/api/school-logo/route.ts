import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { schoolLogoFor } from "@/server/admin/settings";

export const runtime = "nodejs";

/** The school logo for the header and the sign-in page (uploaded logo, or the built-in default). Public. */
export async function GET() {
  const actor = await apiActor().catch(() => null);
  const logo = await schoolLogoFor(repo, actor?.schoolId ?? null).catch(() => null);
  // a RELATIVE location: behind a proxy (Render) req.url carries an internal host the browser cannot reach
  if (!logo) return new NextResponse(null, { status: 307, headers: { Location: "/brand/school-logo-horizontal.jpg", "Cache-Control": "public, max-age=300" } });
  return new NextResponse(Buffer.from(logo.bytes), {
    headers: { "Content-Type": logo.mime, "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff", ...(logo.mime === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}) },
  });
}
