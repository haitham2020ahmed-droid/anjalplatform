import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { exportFlagged } from "@/server/admin/answer-length";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 🎯 Answer-length check → "Export flagged (JSON)": { id, source, stem, options[], correct } rows, to send for rewriting. */
export async function GET() {
  const actor = await apiActor();
  if (!actor || (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") || !actor.schoolId || !can(actor, "questions:read")) return NextResponse.json({ ok: false, error: "Only an admin can export questions." }, { status: 403 });
  const rows = await exportFlagged(repo, actor);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(rows, null, 1), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="answer-length-flagged-${day}.json"`, "Cache-Control": "no-store" } });
}
