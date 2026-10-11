import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { parseScope, rosterBackupChunks, scopeStudents, type RosterScope } from "@/server/admin/roster-clean";

export const runtime = "nodejs";

/** ⬇ JSON backup of everything “delete permanently” would remove (no password hashes). Admins only. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "students:manage") || (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN")) return new NextResponse("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const scope: RosterScope = parseScope((k) => q.get(k));
  try {
    await scopeStudents(repo, actor, scope); // permission and class checks before the download starts
    // streamed table by table (Update 42A): a whole-school backup is never held in memory at once
    const parts = rosterBackupChunks(repo, actor, scope);
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await parts.next();
          if (next.done) controller.close(); else controller.enqueue(enc.encode(next.value));
        } catch (e) { controller.error(e); }
      },
      async cancel() { await parts.return(undefined); },
    });
    return new NextResponse(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="roster-backup-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
