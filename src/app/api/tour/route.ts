import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { markTourSeen } from "@/server/ui/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/tour — the signed-in user finished or skipped the first-login tour (shown once per user). */
export async function POST(req: Request) {
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  await markTourSeen(repo, actor);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
