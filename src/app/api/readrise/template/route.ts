import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { templateJson, templateWorkbook } from "@/server/readrise/import";

export const runtime = "nodejs";

/**
 * 🚀 ReadRise article template (one article per file):
 *   ?format=xlsx (default)  Excel: Instructions, Article, Versions, KeyWords, Questions, Prompts
 *   ?format=json            the same article as an empty JSON file (data/readrise/FORMAT.md)
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor || !(actor.role === "TEACHER" || actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") || !can(actor, "questions:edit")) return new NextResponse("Forbidden", { status: 403 });
  const format = new URL(req.url).searchParams.get("format") ?? "xlsx";
  const common = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
  if (format === "json") {
    return new NextResponse(JSON.stringify(templateJson(), null, 2), { headers: { ...common, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="readrise-article-template.json"' } });
  }
  if (format !== "xlsx") return new NextResponse("Unknown format. Use xlsx or json.", { status: 400 });
  return new NextResponse(Buffer.from(templateWorkbook()), { headers: { ...common, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="readrise-article-template.xlsx"' } });
}
