import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { classSignInRoster } from "@/server/auth/class-signin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 👀 Class QR sign-in (r76): the teacher's live list next to the QR (polled every ~5 s). Tiny JSON: is the QR open,
 * when it ends, and each student ✅ signed in today / ⏳ not yet. Only the teacher who opened the QR (and still
 * teaches the class).
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    return NextResponse.json(await classSignInRoster(repo, actor, id.slice(0, 40)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw e;
  }
}
