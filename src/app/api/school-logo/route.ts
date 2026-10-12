import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { schoolLogoFor } from "@/server/admin/settings";
import { modelVersion } from "@/server/cache/bank-version";

export const runtime = "nodejs";

/**
 * The logo is on every page (the header): kept in memory per school for a minute, and until a school or its logo
 * changes in this process (Update 46: it was read from the database — up to 1 MB — on every page after a minute).
 */
const logos = new Map<string, { v: string; at: number; logo: Awaited<ReturnType<typeof schoolLogoFor>> }>();
async function logoOf(schoolId: string | null) {
  const key = schoolId ?? "", v = modelVersion("School", "SchoolAsset"), hit = logos.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.logo;
  const logo = await schoolLogoFor(repo, schoolId);
  if (logos.size >= 16) logos.clear();
  logos.set(key, { v, at: Date.now(), logo });
  return logo;
}

/** The school logo for the header and the sign-in page (uploaded logo, or the built-in default). Public. */
export async function GET() {
  const actor = await apiActor().catch(() => null);
  const logo = await logoOf(actor?.schoolId ?? null).catch(() => null);
  // a RELATIVE location: behind a proxy (Render) req.url carries an internal host the browser cannot reach
  if (!logo) return new NextResponse(null, { status: 307, headers: { Location: "/brand/school-logo-horizontal.jpg", "Cache-Control": "public, max-age=300" } });
  return new NextResponse(logo.bytes as unknown as BodyInit, {
    headers: { "Content-Type": logo.mime, "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff", ...(logo.mime === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}) },
  });
}
