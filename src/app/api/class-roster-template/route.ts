import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { classRosterTemplateCsv, classRosterTemplateXlsx } from "@/server/teacher/class-accounts";

export const runtime = "nodejs";

/** 📄 The Upload Roster template: Student Name | Username (xlsx, or ?format=csv). */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN")) return new NextResponse("Forbidden", { status: 403 });
  if (new URL(req.url).searchParams.get("format") === "csv") {
    return new NextResponse(classRosterTemplateCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="class-roster-template.csv"', "Cache-Control": "no-store" } });
  }
  return new NextResponse(Buffer.from(classRosterTemplateXlsx()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="class-roster-template.xlsx"', "Cache-Control": "no-store" } });
}
