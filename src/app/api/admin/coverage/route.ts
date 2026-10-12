import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { coverageSheets, mapCoverage } from "@/server/map/coverage";
import { workbookXlsx } from "@/imports/questions/template-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ⬇️ The Coverage Report as Excel (admin only): All skills · 0 questions · Under 25 · Missing skills · Not linked to MAP. */
export async function GET() {
  const actor = await apiActor();
  if (!actor || (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN")) return new NextResponse("Forbidden", { status: 403 });
  const r = await mapCoverage(repo, actor);
  return new NextResponse(Buffer.from(workbookXlsx(coverageSheets(r))), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="coverage-report.xlsx"`, "Cache-Control": "no-store" } });
}
