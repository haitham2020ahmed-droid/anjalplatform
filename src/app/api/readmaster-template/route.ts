import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { rmTemplateCsv, rmTemplateXlsx } from "@/server/readmaster/import";

export const runtime = "nodejs";

/** ⭐ ReadMaster import template (with a complete Solar System example in three levels). */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "questions:edit")) return new NextResponse("Forbidden", { status: 403 });
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  return csv
    ? new NextResponse(rmTemplateCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="readmaster-template.csv"' } })
    : new NextResponse(Buffer.from(rmTemplateXlsx()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="readmaster-template.xlsx"' } });
}
