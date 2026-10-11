import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { departmentSummary } from "@/server/insights/department";
import { departmentWorkbook } from "@/server/reports/workbooks";

export const runtime = "nodejs";

/** 🏫 The department week as Excel: classes and the hardest skills per grade. */
export async function GET() {
  const actor = await apiActor();
  if (!actor || !can(actor, "reports:export")) return new NextResponse("Forbidden", { status: 403 });
  try {
    const d = await departmentSummary(repo, actor);
    const bytes = departmentWorkbook(d);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="department-${d.week}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
