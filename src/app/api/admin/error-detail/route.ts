import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { errorDetail } from "@/server/teacher/extras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🩺 The error page asks for the real message behind its "Reference" (the server error's digest), so an admin sees
 * WHY a page failed (e.g. "Run npx prisma db push"). School admin / platform admin only: anyone else gets 204.
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  const digest = new URL(req.url).searchParams.get("digest") ?? "";
  if (!actor) return new NextResponse(null, { status: 204 });
  const d = await errorDetail(repo, actor, digest).catch(() => null);
  if (!d) return new NextResponse(null, { status: 204 });
  return NextResponse.json(d, { headers: { "Cache-Control": "no-store" } });
}
