import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { logError } from "@/server/teacher/extras";

export const runtime = "nodejs";

/** 🩺 The browser reports an error the student or teacher saw (message only). Signed-in users only. */
export async function POST(req: Request) {
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  const actor = await apiActor();
  if (!actor) return new NextResponse(null, { status: 204 });
  try {
    const b = (await req.json()) as { message?: string; path?: string; digest?: string };
    await logError(repo, { source: "BROWSER", message: String(b.message ?? "").slice(0, 1000), path: String(b.path ?? "").slice(0, 300), digest: b.digest ? String(b.digest).slice(0, 100) : null, userId: actor.userId });
  } catch { /* ignore */ }
  return new NextResponse(null, { status: 204 });
}
