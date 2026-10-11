import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { classProgress } from "@/server/insights/progress";
import { progressWorkbook } from "@/server/reports/workbooks";

export const runtime = "nodejs";

/** 📈 The Students dashboard of a class as an Excel file. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "reports:export")) return new NextResponse("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  try {
    const v = await classProgress(repo, actor, String(sp.get("classId") ?? ""), sp.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING");
    const bytes = progressWorkbook(v);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="students-${v.className.replace(/[^\w-]+/g, "")}-${v.subject.toLowerCase()}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
