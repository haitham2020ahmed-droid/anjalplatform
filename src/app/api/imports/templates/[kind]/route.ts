import { NextResponse } from "next/server";
import { toCsv } from "@/imports/csv";
import { TEMPLATES } from "@/imports/specs";
import { apiActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const actor = await apiActor();
  if (!actor || !can(actor, "imports:run")) return new NextResponse("Forbidden", { status: 403 });
  const { kind } = await params;
  const t = TEMPLATES[kind as keyof typeof TEMPLATES];
  if (!t) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(toCsv(t), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind.toLowerCase()}-template.csv"`, "X-Content-Type-Options": "nosniff" } });
}
