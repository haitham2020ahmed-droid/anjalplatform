import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { classMatrix } from "@/server/map/map-more";
import { GROUPS } from "@/server/map/map-plan";
import { workbookXlsx } from "@/imports/questions/template-files";

export const runtime = "nodejs";

/** 🗺️ The MAP class matrix (bands, descriptors, statuses per goal area) as an Excel file. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "reports:export")) return new NextResponse("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const subject = sp.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING";
  try {
    const v = await classMatrix(repo, actor, String(sp.get("classId") ?? ""), subject);
    const groups = GROUPS.filter((g) => g.subject === subject);
    const head = ["Student", "Student ID", "Term", "RIT", "Band", "Percentile", "Descriptor", "Fall RIT", "Spring goal", "Now (estimate)", "Rapid guessing %", "Retest?", ...groups.flatMap((g) => [`${g.name} RIT`, `${g.name} band`, `${g.name} descriptor`, `${g.name} status`]), "Plan"];
    const rows = v.rows.map((r) => { const o = r.profile.overall; return [r.name, r.number, r.profile.term ?? "", String(o?.rit ?? ""), o?.band ?? "", String(o?.percentile ?? ""), o?.descriptor ?? "", String(r.profile.fall?.rit ?? ""), String(r.profile.fall?.projection ?? ""), String(r.estimate ?? ""), String(o?.rapidGuessPct ?? ""), r.retest ? "yes" : "", ...groups.flatMap((g) => { const a = r.profile.areas.find((x) => x.group === g.key); return [String(a?.rit ?? ""), a?.band ?? "", a?.descriptor ?? "", a?.status ?? ""]; }), r.plan ?? ""]; });
    const bytes = workbookXlsx([{ name: `${v.className}`.slice(0, 30) || "Class", rows: [head, ...rows], widths: head.map((h, i) => (i === 0 ? 30 : Math.max(10, h.length + 2))), headerStyle: true, freeze: true }]);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="map-${v.className.replace(/[^\w-]+/g, "")}-${subject.toLowerCase()}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
