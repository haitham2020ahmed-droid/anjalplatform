import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { importArticleFile, previewArticleFile } from "@/server/readrise/import";

export const runtime = "nodejs";
const MAX_FILE = 5 * 1024 * 1024;

/**
 * 🚀 ReadRise import over HTTP (multipart "file": the Excel template or a JSON article).
 *   POST /api/readrise/import            preview only: { errors, warnings, checks, article } — nothing saved
 *   POST /api/readrise/import?commit=1   import as a DRAFT for the caller's school (&publish=1 with questions:publish)
 */
export async function POST(req: Request) {
  const h = await headers();
  try { assertSameOrigin({ origin: h.get("origin"), referer: h.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(actor.role) || !can(actor, "questions:edit")) return NextResponse.json({ error: "Only teachers and admins can import ReadRise articles." }, { status: 403 });
  if (Number(h.get("content-length") ?? 0) > MAX_FILE + 64_000) return NextResponse.json({ error: "The file is too large (5 MB at most)." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Send the file in the field “file”." }, { status: 400 });
  if (file.size > MAX_FILE) return NextResponse.json({ error: "The file is too large (5 MB at most)." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const q = new URL(req.url).searchParams;
  if (q.get("commit") !== "1") {
    const v = previewArticleFile(file.name, buf);
    return NextResponse.json({ ok: !v.errors.length, errors: v.errors, warnings: v.warnings, checks: v.checks, article: v.article ? { code: v.article.code, title: v.article.title, topic: v.article.topic } : null });
  }
  try {
    const r = await importArticleFile(repo, actor, file.name, buf, { publish: q.get("publish") === "1" });
    return NextResponse.json({ ok: r.ok, articleId: r.articleId, created: r.created, status: r.status, errors: r.errors, warnings: r.warnings, checks: r.checks }, { status: r.ok ? 200 : 422 });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
