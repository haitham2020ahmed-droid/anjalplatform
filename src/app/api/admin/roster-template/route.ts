import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { rosterTemplateCsv } from "@/server/admin/roster-import";

export async function GET() {
  const actor = await apiActor();
  if (!actor || !can(actor, "students:manage")) return new NextResponse("Not found.", { status: 404 });
  return new NextResponse(rosterTemplateCsv(), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="user-import-template.csv"', "Cache-Control": "no-store" },
  });
}
