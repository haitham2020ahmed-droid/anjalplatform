import { NextResponse } from "next/server";
import { toCsv } from "@/imports/csv";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { bridges } from "@/server/curriculum-map/bridge";

export const runtime = "nodejs";

/** The current Cross-Grade Bridge as CSV (also the import template). */
export async function GET() {
  const actor = await apiActor();
  if (!actor || !can(actor, "curriculum:read") || actor.role === "STUDENT" || actor.role === "PARENT") return new NextResponse("Forbidden", { status: 403 });
  const rows = await bridges(repo, actor.schoolId!);
  const csv = "\ufeff" + toCsv([["From", "Challenge", "Support", "From (place)", "Challenge (place)", "Support (place)", "Source"], ...rows.map((r) => [r.from, r.challenge ?? "", r.support ?? "", r.fromLabel, r.challengeLabel ?? "", r.supportLabel ?? "", r.source])]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="cross-grade-bridge.csv"', "Cache-Control": "no-store" } });
}
