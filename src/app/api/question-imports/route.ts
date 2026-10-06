import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { aiProvider } from "@/server/ai/runtime";
import { analyzeImport } from "@/server/admin/question-import";
import { MAX_IMPORT_BYTES } from "@/imports/questions/extract";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Upload a question-bank file (CSV, XLSX, DOCX, PDF, JSON, TXT) for analysis. Nothing is added to the bank yet. */
export async function POST(req: Request) {
  const h = await headers();
  try { assertSameOrigin({ origin: h.get("origin"), referer: h.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!can(actor, "questions:edit")) return NextResponse.json({ error: "You do not have permission to import questions." }, { status: 403 });
  if (Number(h.get("content-length") ?? 0) > MAX_IMPORT_BYTES + 64_000) return NextResponse.json({ error: "Files must be under 10 MB." }, { status: 413 });
  const form = await req.formData();
  const file = form.get("file");
  const gradeLevel = Number(form.get("gradeLevel"));
  if (!(file instanceof File) || ![4, 5, 6].includes(gradeLevel)) return NextResponse.json({ error: "Choose a file and a grade." }, { status: 400 });
  const wantsAi = form.get("useAi") === "1";
  let provider = null;
  if (wantsAi) {
    try { provider = aiProvider(); } catch (e) { if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 }); throw e; }
  }
  try {
    const jobId = await analyzeImport(repo, actor, {
      fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), useAi: wantsAi,
      defaults: { gradeLevel, skillId: String(form.get("skillId") ?? "") || null, level: Number(form.get("level")) || null },
    }, provider);
    return NextResponse.json({ jobId });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
