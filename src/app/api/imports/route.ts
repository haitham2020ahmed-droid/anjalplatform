import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { stageImport, type ImportKind } from "@/server/imports/pipeline";

/** Upload a CSV/XLSX file for validation. Returns the staged job; nothing is saved to results yet. */
export async function POST(req: Request) {
  const h = await headers();
  try { assertSameOrigin({ origin: h.get("origin"), referer: h.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!can(actor, "imports:run")) return NextResponse.json({ error: "Only school admins can import." }, { status: 403 });
  const len = Number(h.get("content-length") ?? 0);
  if (len > env.MAX_UPLOAD_MB * 1024 * 1024 + 64_000) return NextResponse.json({ error: `Files must be under ${env.MAX_UPLOAD_MB} MB.` }, { status: 413 });
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind")) as ImportKind;
  if (!(file instanceof File) || !["MAP_RESULTS", "EXTERNAL_RESULTS"].includes(kind)) return NextResponse.json({ error: "Choose a file and an import type." }, { status: 400 });
  try {
    const r = await stageImport(repo, actor, {
      kind, fileName: file.name, bytes: Buffer.from(await file.arrayBuffer()),
      dateOrder: form.get("dateOrder") === "DMY" ? "DMY" : "MDY", source: String(form.get("source") ?? "") || undefined,
    });
    return NextResponse.json({ jobId: r.jobId, status: r.status });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
