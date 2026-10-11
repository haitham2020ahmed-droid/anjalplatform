import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { accountsWorkbookXlsx, accountsXlsx, classAccounts, fileSafe } from "@/server/teacher/class-accounts";
import { accessibleClasses } from "@/server/teacher/assign";

export const runtime = "nodejs";

/**
 * ⬇️ The class's accounts as Excel (Student Name | Username | Password). Only the class's teacher and the admin.
 * ?all=1: every class this person teaches (an admin: every class of the school), one sheet per class.
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN")) return new NextResponse("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const classId = q.get("classId") ?? "";
  try {
    if (q.get("all") === "1") {
      const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(0, 60);
      const list = [];
      for (const c of classes) list.push(await classAccounts(repo, actor, String(c.id)));   // one class at a time (memory)
      return new NextResponse(Buffer.from(accountsWorkbookXlsx(list)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="accounts-all-classes.xlsx"`, "Cache-Control": "no-store" } });
    }
    const a = await classAccounts(repo, actor, classId);
    return new NextResponse(Buffer.from(accountsXlsx(a)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="accounts-${fileSafe(a.className)}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) {
    // another teacher's class (or a made-up id): 404, so class ids cannot be probed
    if (e instanceof ForbiddenError || (e as { status?: number })?.status === 403 || (e as Error)?.name === "ValidationError") return new NextResponse("Not found", { status: 404 });
    throw e;
  }
}
