import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { alertList } from "@/server/insights/alerts";
import { workbookXlsx } from "@/imports/questions/template-files";

export const runtime = "nodejs";

/** 🚨 Student alerts (with what was done) as an Excel file. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "reports:export")) return new NextResponse("Forbidden", { status: 403 });
  const st = new URL(req.url).searchParams.get("status");
  try {
    const rows = await alertList(repo, actor, { status: st === "OPEN" || st === "HANDLED" ? st : "ALL" });
    const head = ["Date", "Student", "Class", "Reason", "Details", "Status", "What was done", "By", "Handled on", "Days open"];
    const data = rows.map((r) => [r.createdAt.slice(0, 10), r.name, r.className, r.title, r.detail, r.status === "OPEN" ? "Not handled" : "Handled", r.action ?? "", r.handledBy ?? "", r.handledAt?.slice(0, 10) ?? "", r.status === "OPEN" ? String(r.ageDays) : ""]);
    const bytes = workbookXlsx([{ name: "Alerts", rows: [head, ...data], widths: [12, 28, 12, 22, 60, 14, 40, 22, 12, 10], headerStyle: true, freeze: true }]);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="student-alerts.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
