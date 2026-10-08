import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { hostView } from "@/server/game/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The host screen's state (polled about every 1.5 s). */
export async function GET(_req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  try { return NextResponse.json(await hostView(repo, actor, (await params).gameId), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e; }
}
