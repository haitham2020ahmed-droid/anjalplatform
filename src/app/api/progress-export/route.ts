import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { classProgress } from "@/server/insights/progress";
import { workbookXlsx } from "@/imports/questions/template-files";

export const runtime = "nodejs";

/** 📈 The Students dashboard of a class as an Excel file. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "reports:export")) return new NextResponse("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  try {
    const v = await classProgress(repo, actor, String(sp.get("classId") ?? ""), sp.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING");
    const head = ["Student", "Student ID", "Status", "Why", "Level", "Answers", "Correct", "Accuracy %", "Skills mastered", "Skills needing work", "Minutes this week", "Minutes this month", "Minutes total", "Tasks done", "Tasks pending", "Tasks late", "Last active", "MAP Fall RIT", "MAP latest RIT", "Latest term", "Spring target", "Growth needed", "Plan", "Weakest goal areas"];
    const rows = v.rows.map((r) => [r.name, r.number, r.status.replace("_", " "), r.statusWhy, r.level ?? "", String(r.practice.answers), String(r.practice.correct), r.practice.accuracy === null ? "" : String(r.practice.accuracy), String(r.mastered), String(r.needsWork), String(r.practice.week.minutes), String(r.practice.month.minutes), String(r.practice.totalMinutes), String(r.work.done), String(r.work.pending), String(r.work.late), r.practice.lastActive?.slice(0, 10) ?? "", String(r.map?.fall?.rit ?? ""), String(r.map?.latest?.rit ?? ""), r.map?.latest?.term ?? "", String(r.map?.springTarget ?? ""), String(r.map?.gap ?? ""), r.intensity ?? "", r.weakest.join(", ")]);
    const bytes = workbookXlsx([{ name: v.className.slice(0, 30) || "Class", rows: [head, ...rows], widths: head.map((h, i) => (i === 0 || i === 3 ? 32 : Math.max(10, h.length + 2))), headerStyle: true, freeze: true }]);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="students-${v.className.replace(/[^\w-]+/g, "")}-${v.subject.toLowerCase()}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
