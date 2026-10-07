import { NextResponse } from "next/server";
import { curriculumCsv, curriculumTemplateCsv, curriculumTemplateXlsx, templateCsv, templateXlsx } from "@/imports/questions/template-files";
import { attachmentNodes } from "@/server/curriculum-map/questions";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { loadCurriculumIndex } from "@/server/admin/question-import";

export const runtime = "nodejs";

/**
 * Official import templates, built from this school's curriculum:
 *   ?format=xlsx        Excel template (Questions, Instructions, Curriculum sheets)
 *   ?format=csv         CSV template (header + example rows)
 *   ?format=curriculum  the school's grades, skills and standards as CSV
 *   ?format=map-xlsx    Curriculum import template (Questions, Curriculum Map with every place and ID, Instructions)
 *   ?format=map-csv     Curriculum import template as CSV
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "questions:edit")) return new NextResponse("Forbidden", { status: 403 });
  const format = new URL(req.url).searchParams.get("format") ?? "xlsx";
  const common = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
  if (format === "map-xlsx" || format === "map-csv") {
    const places = await attachmentNodes(repo, actor.schoolId!);
    // ?place=G4.U1.TS3.ACS.BELOW → a template for that place only (30 ready rows by default)
    const only = (new URL(req.url).searchParams.get("place") ?? "").trim().toUpperCase();
    if (only) { const one = places.filter((x) => x.code === only); if (!one.length) return NextResponse.json({ error: "That place is not on the Curriculum Map." }, { status: 404 }); places.splice(0, places.length, ...one); }
    const per = Number(new URL(req.url).searchParams.get("per") ?? "") || (only ? 30 : undefined);  // ready rows per place (1–100)
    if (format === "map-csv") return new NextResponse(curriculumTemplateCsv(places, per), { headers: { ...common, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="curriculum-import-template.csv"' } });
    return new NextResponse(Buffer.from(curriculumTemplateXlsx(places, per)), { headers: { ...common, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="curriculum-import-template.xlsx"' } });
  }
  const idx = await loadCurriculumIndex(repo, actor);
  if (format === "xlsx") {
    return new NextResponse(Buffer.from(templateXlsx(idx)), { headers: { ...common, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="question-import-template.xlsx"' } });
  }
  if (format === "csv" || format === "curriculum") {
    const body = format === "csv" ? templateCsv(idx) : curriculumCsv(idx);
    const name = format === "csv" ? "question-import-template.csv" : "curriculum-skills-standards.csv";
    return new NextResponse(body, { headers: { ...common, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
  }
  return new NextResponse("Unknown format. Use xlsx, csv, curriculum, map-xlsx or map-csv.", { status: 400 });
}
