import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { MAX_IMPORT_BYTES } from "@/imports/questions/extract";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { analyzeImport, ImportFileError, shortDbMessage } from "@/server/admin/question-import";
import { ensureGrammarSkills, ensureSimpleGrammarSkills, grammarSimpleTable, grammarTable, readGrammarWorkbook } from "@/server/grammar/grammar";
import { log } from "@/server/monitoring/log";

export const runtime = "nodejs";
export const maxDuration = 300;

type Reply = { jobId?: string; error?: string; details?: string[]; stage?: string };
const reply = (body: Reply, status = 200) => NextResponse.json(body, { status });

/**
 * Upload a question-bank file (official CSV or Excel template) for checking. Nothing is added to the
 * bank yet: the reply is the id of the preview. EVERY outcome is JSON with a specific message, so the
 * page never shows a generic "Import failed".
 */
export async function POST(req: Request) {
  const h = await headers();
  try {
    assertSameOrigin({ origin: h.get("origin"), referer: h.get("referer") }, env.APP_URL);
  } catch {
    return reply({ error: `This upload came from a different web address than the server expects. Open the platform at ${new URL(env.APP_URL).origin} and try again.`, stage: "security" }, 403);
  }
  const actor = await apiActor();
  if (!actor) return reply({ error: "Your session has ended. Sign in again, then upload the file.", stage: "session" }, 401);
  if (!can(actor, "questions:edit")) return reply({ error: "You do not have permission to import questions.", stage: "permission" }, 403);
  // the size must be declared up front (a body without Content-Length could be any size); the form overhead is allowed
  const declared = req.headers.get("content-length") ?? h.get("content-length");
  if (declared === null || !/^\d+$/.test(declared.trim())) return reply({ error: "The upload did not say how large the file is. Choose the file again and retry.", stage: "upload" }, 411);
  if (Number(declared) > MAX_IMPORT_BYTES + 64_000) return reply({ error: "The file is larger than 50 MB. Split it into smaller files.", stage: "upload" }, 413);

  let file: FormDataEntryValue | null;
  let target: "BANK" | "CURRICULUM" = "BANK";
  let defaultMapCode: string | undefined;
  let grammarGrade = 0;
  try {
    const form = await req.formData();
    file = form.get("file");
    grammarGrade = [4, 5, 6].includes(Number(form.get("grammarGrade"))) ? Number(form.get("grammarGrade")) : 0;
    if (form.get("target") === "CURRICULUM") target = "CURRICULUM";
    const place = String(form.get("place") ?? "").trim().toUpperCase();
    if (/^G\d+\.[A-Z0-9.]+$/.test(place)) { defaultMapCode = place; target = "CURRICULUM"; }
  } catch {
    return reply({ error: "The upload was interrupted or is not a file. Choose the file again and retry.", stage: "upload" }, 400);
  }
  if (!(file instanceof File) || !file.size) return reply({ error: "Choose a CSV or Excel (.xlsx) file to upload.", stage: "upload" }, 400);
  if (file.size > MAX_IMPORT_BYTES) return reply({ error: "The file is larger than 50 MB. Split it into smaller files.", stage: "upload" }, 413);

  const started = Date.now();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let jobId: string;
    if (grammarGrade) {
      // 🔤 the Grammar bank: the strict format's skills first (created or updated, placed on the Curriculum Map);
      // the simple format matches the grade's EXISTING skills by name, creating a plain one (no map placement)
      // only for a name that has none yet — so a grade starting from zero (Grade 5, Grade 6…) still gets one.
      const wb = readGrammarWorkbook(bytes);
      let table: string[][];
      if (wb.format === "simple") { await ensureSimpleGrammarSkills(repo, actor, wb, grammarGrade); table = grammarSimpleTable(wb, grammarGrade); }
      else { await ensureGrammarSkills(repo, actor, wb, grammarGrade); table = grammarTable(wb, grammarGrade); }
      if (table.length < 2) return reply({ error: `The Grammar file has no Grade ${grammarGrade} questions.`, stage: "file" }, 422);
      jobId = await analyzeImport(repo, actor, { fileName: `Grammar Grade ${grammarGrade} - ${file.name}`, bytes, target: "BANK", table });
    } else jobId = await analyzeImport(repo, actor, { fileName: file.name, bytes, target, defaultMapCode });
    log("info", "question_import.analyzed", { jobId, kind: file.name.split(".").pop(), bytes: file.size, ms: Date.now() - started, user: actor.userId });
    return reply({ jobId });
  } catch (e) {
    if (e instanceof ImportFileError) {
      log("info", "question_import.rejected", { jobId: e.jobId, reason: e.message, user: actor.userId });
      return reply({ error: e.message, details: e.details, jobId: e.jobId ?? undefined, stage: "file" }, 422);
    }
    if (e instanceof ValidationError || e instanceof ForbiddenError) return reply({ error: e.message, stage: "check" }, e instanceof ForbiddenError ? 403 : 422);
    log("error", "question_import.error", { error: e as Error, user: actor.userId, file: file.name, bytes: file.size });
    return reply({ error: `The file could not be checked because of a server error: ${shortDbMessage(e)}`, stage: "server" }, 500);
  }
}
