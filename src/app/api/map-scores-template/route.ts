import { NextResponse } from "next/server";
import { toCsv } from "@/imports/csv";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { mapTemplateRows } from "@/server/map/student-map";

export const runtime = "nodejs";

/** MAP scores template (CSV): the actor's students (or one class) with empty Fall RIT / Spring Projection. */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !can(actor, "assignments:create")) return new NextResponse("Forbidden", { status: 403 });
  const classId = new URL(req.url).searchParams.get("classId") || undefined;
  const csv = "\ufeff" + toCsv(await mapTemplateRows(repo, actor, classId));
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="map-scores-template.csv"', "Cache-Control": "no-store" } });
}
