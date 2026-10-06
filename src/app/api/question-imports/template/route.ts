import { NextResponse } from "next/server";
import { curriculumCsv, templateCsv, templateXlsx } from "@/imports/questions/template-files";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { loadCurriculumIndex } from "@/server/admin/question-import";

export const runtime = "nodejs";

/**
 * Official import templates, built from this school's curriculum:
 *   ?format=xlsx        Excel template (Questions, Instructions, Curriculum sheets)
 *   ?format=csv         CSV template (header + example rows)
 *   ?format=curriculum  the school's grades, skills and standards as CSV
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "questions:edit")) return new NextResponse("Forbidden", { status: 403 });
  const format = new URL(req.url).searchParams.get("format") ?? "xlsx";
  const idx = await loadCurriculumIndex(repo, actor);
  const common = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
  if (format === "xlsx") {
    return new NextResponse(Buffer.from(templateXlsx(idx)), { headers: { ...common, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="question-import-template.xlsx"' } });
  }
  if (format === "csv" || format === "curriculum") {
    const body = format === "csv" ? templateCsv(idx) : curriculumCsv(idx);
    const name = format === "csv" ? "question-import-template.csv" : "curriculum-skills-standards.csv";
    return new NextResponse(body, { headers: { ...common, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
  }
  return new NextResponse("Unknown format. Use xlsx, csv or curriculum.", { status: 400 });
}
