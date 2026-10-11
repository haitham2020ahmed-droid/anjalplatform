import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { accountsXlsx, classAccounts, fileSafe } from "@/server/teacher/class-accounts";

export const runtime = "nodejs";

/** ⬇️ The class's accounts as Excel (Student Name | Username | Password). Only the class's teacher and the admin. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN")) return new NextResponse("Forbidden", { status: 403 });
  const classId = new URL(req.url).searchParams.get("classId") ?? "";
  try {
    const a = await classAccounts(repo, actor, classId);
    return new NextResponse(Buffer.from(accountsXlsx(a)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="accounts-${fileSafe(a.className)}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) {
    // another teacher's class (or a made-up id): 404, so class ids cannot be probed
    if (e instanceof ForbiddenError || (e as { status?: number })?.status === 403 || (e as Error)?.name === "ValidationError") return new NextResponse("Not found", { status: 404 });
    throw e;
  }
}
