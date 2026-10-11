import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { alertList } from "@/server/insights/alerts";
import { alertsWorkbook } from "@/server/reports/workbooks";

export const runtime = "nodejs";

/** 🚨 Student alerts (with what was done) as an Excel file. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "reports:export")) return new NextResponse("Forbidden", { status: 403 });
  const st = new URL(req.url).searchParams.get("status");
  try {
    const rows = await alertList(repo, actor, { status: st === "OPEN" || st === "HANDLED" ? st : "ALL" });
    const bytes = alertsWorkbook(rows);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="student-alerts.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
