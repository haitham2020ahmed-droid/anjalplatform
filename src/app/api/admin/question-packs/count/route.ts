import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { packCount } from "@/server/admin/load-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 📥 Load new questions: what is in already / left for ONE pack (?pack=gap). The page asks for every pack at once
 * after it has opened (route handlers run in parallel; server actions would run one after another). School admin only.
 * A pack that cannot be counted answers 200 with { ok: false, error } so its row can say why.
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || actor.role !== "SCHOOL_ADMIN" || !actor.schoolId) return NextResponse.json({ ok: false, error: "Only the school admin can load new questions." }, { status: 403 });
  const key = new URL(req.url).searchParams.get("pack") ?? "";
  if (!/^[A-Za-z]{2,20}$/.test(key)) return NextResponse.json({ ok: false, error: "Unknown question pack." }, { status: 400 });
  try {
    return NextResponse.json(await packCount(repo, actor, key), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, key, error: (e as Error).message || "This pack could not be counted.", what: "", schema: false }, { status: (e as { status?: number }).status === 403 ? 403 : 400 });
  }
}
