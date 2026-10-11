import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { articleDetail, articleToJson } from "@/server/readrise/library";

export const runtime = "nodejs";

/** 🚀 One ReadRise article as a JSON file in the import format (download, edit, import again under your own code). */
export async function GET(_req: Request, { params }: { params: Promise<{ articleId: string }> }) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(actor, "questions:read")) return new NextResponse("Forbidden", { status: 403 });
  const { articleId } = await params;
  try {
    const d = await articleDetail(repo, actor, articleId);
    const file = `${d.code.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
    return new NextResponse(JSON.stringify(articleToJson(d), null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse("Not found", { status: 404 });
    if (e instanceof ForbiddenError) return new NextResponse("Forbidden", { status: 403 });
    throw e;
  }
}
