import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { rosterBackup, type RosterScope } from "@/server/admin/roster-clean";

export const runtime = "nodejs";

/** ⬇ JSON backup of everything “delete permanently” would remove (no password hashes). Admins only. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "students:manage") || (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN")) return new NextResponse("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const scope: RosterScope = q.get("scope") === "grade" ? { kind: "GRADE", grade: Number(q.get("grade")) } : q.get("scope") === "class" ? { kind: "CLASS", classId: String(q.get("classId")) } : { kind: "SCHOOL" };
  try {
    const data = await rosterBackup(repo, actor, scope);
    return new NextResponse(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="roster-backup-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
