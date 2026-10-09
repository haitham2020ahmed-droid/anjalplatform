import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { departmentSummary } from "@/server/insights/department";
import { workbookXlsx } from "@/imports/questions/template-files";

export const runtime = "nodejs";

/** 🏫 The department week as Excel: classes and the hardest skills per grade. */
export async function GET() {
  const actor = await apiActor();
  if (!actor || !can(actor, "reports:export")) return new NextResponse("Forbidden", { status: 403 });
  try {
    const d = await departmentSummary(repo, actor);
    const head = ["Grade", "Class", "Teacher", "Students", "Practised this week", "Practised %", "Answers this week", "Minutes this week", "Accuracy %", "Tasks done", "Late", "MAP tested", "On track", "At risk", "Alerts open", "Alerts handled", "Oldest open (days)"];
    const rows = d.classes.map((c) => [String(c.grade), c.className, c.teacher, String(c.students), String(c.activeWeek), String(c.activePct), String(c.answersWeek), String(c.minutesWeek), c.accuracy === null ? "" : String(c.accuracy), String(c.done), String(c.late), String(c.tested), String(c.onTrack), String(c.atRisk), String(c.alertsOpen), String(c.alertsHandled), c.oldestOpenDays === null ? "" : String(c.oldestOpenDays)]);
    const weak = [["Grade", "Skill", "Accuracy %", "Answers", "Students"], ...d.weakest.flatMap((g) => g.skills.map((k) => [String(g.grade), k.name, String(k.accuracy), String(k.answers), String(k.students)]))];
    const bytes = workbookXlsx([
      { name: `Week ${d.week}`, rows: [head, ...rows], widths: head.map((h) => Math.max(10, h.length + 2)), headerStyle: true, freeze: true },
      { name: "Hardest skills", rows: weak, widths: [8, 40, 12, 10, 10], headerStyle: true, freeze: true },
    ]);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="department-${d.week}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
