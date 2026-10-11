import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { classMatrix } from "@/server/map/map-more";
import { mapMatrixWorkbook } from "@/server/reports/workbooks";

export const runtime = "nodejs";

/** 🗺️ The MAP class matrix (bands, descriptors, statuses per goal area) as an Excel file. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "reports:export")) return new NextResponse("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const subject = sp.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING";
  try {
    const v = await classMatrix(repo, actor, String(sp.get("classId") ?? ""), subject);
    const bytes = mapMatrixWorkbook(v, subject);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="map-${v.className.replace(/[^\w-]+/g, "")}-${subject.toLowerCase()}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
