import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { respondOverview } from "@/server/curriculum-map/respond";
import { respondTemplateDocx, respondTemplateXlsx } from "@/server/curriculum-map/respond-doc";

export const runtime = "nodejs";

/** ✍️ Respond to Reading template for a grade: Word (?format=docx, default) or Excel (?format=xlsx). */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "questions:publish")) return new NextResponse("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const all = await respondOverview(repo, actor);
  const g = all.find((x) => x.grade === Number(sp.get("grade"))) ?? all[0];
  if (!g) return new NextResponse("No grade has Respond to Reading.", { status: 404 });
  const sets = g.units.flatMap((u) => u.sets.map((x) => ({ code: x.setCode, heading: `${u.unit} · ${x.heading}` })));
  const xlsx = sp.get("format") === "xlsx";
  const bytes = xlsx ? respondTemplateXlsx(sets) : respondTemplateDocx(g.grade, sets);
  return new NextResponse(Buffer.from(bytes), { headers: {
    "Content-Type": xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename="respond-to-reading-grade-${g.grade}.${xlsx ? "xlsx" : "docx"}"`, "Cache-Control": "no-store" } });
}
