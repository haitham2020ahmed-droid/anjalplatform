import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import { withCappedBody, BodyTooLargeError } from "@/server/lib/capped-body";
import { importMapFile, importMessage } from "@/server/map/map-files";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 🧰 Nov 2026 fix ("صندوق رفع MAP هيفشل مع ملفات حقيقية"): the owner's "Upload PDF(s) to import now" box
 * (admin/bulk-map-import) was first built as a Server Action, which shares the app's one GLOBAL body-size cap
 * (next.config.ts's experimental.serverActions.bodySizeLimit = 4 MB — sized for the logo and roster uploads, never
 * re-checked when this feature was added). Real NWEA PDFs (Achievement Status and Growth, Class Profile) are
 * multi-page, chart-heavy exports that routinely exceed 4 MB on their own, let alone a few picked at once — so the
 * very feature this box exists for would fail before `runUploadMapImportAction` ever ran, with a raw/cryptic error
 * instead of the friendly message built for it. Moved to a plain API route (same pattern as question-imports and
 * roster uploads) with its own, much higher cap and a proper 413 message, exactly like those routes already do.
 */
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB: comfortably above any single NWEA PDF or a small batch of them
// 🐛 Nov 2026 fix: a big batch (a whole grade's worth of PDFs, one with several ambiguous-name errors) could build a
// result message thousands of characters long — fine to compute, but ugly dumped whole into the page's <pre>. Cap it
// and say plainly how many lines were cut, rather than truncating silently mid-sentence.
const MAX_MESSAGE_LINES = 60;
function capMessage(lines: string[]): string {
  if (lines.length <= MAX_MESSAGE_LINES) return lines.join("\n");
  return [...lines.slice(0, MAX_MESSAGE_LINES), `… and ${lines.length - MAX_MESSAGE_LINES} more file(s). Check the MAP tab to confirm every score landed.`].join("\n");
}

export async function POST(req: Request) {
  const h = await headers();
  try { assertSameOrigin({ origin: h.get("origin"), referer: h.get("referer") }, env.APP_URL); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const actor = await apiActor();
  if (!actor) return NextResponse.json({ error: "Your session has ended. Sign in again, then upload the file(s)." }, { status: 401 });
  if ((actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") || !can(actor, "assignments:create")) return NextResponse.json({ error: "Only school admins can import MAP scores here." }, { status: 403 });

  const declared = Number(req.headers.get("content-length") ?? h.get("content-length") ?? 0);
  if (declared > MAX_BYTES + 64_000) return NextResponse.json({ error: "These files are larger than 20 MB combined. Upload fewer files at a time." }, { status: 413 });

  let form: FormData;
  try { form = await withCappedBody(req, MAX_BYTES + 64_000).formData(); }
  catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ error: "These files are larger than 20 MB combined. Upload fewer files at a time." }, { status: 413 });
    return NextResponse.json({ error: "The upload was interrupted. Choose the file(s) again and retry." }, { status: 400 });
  }
  const year = Number(form.get("year")) || new Date().getFullYear();
  const uploads = form.getAll("files").filter((v): v is File => v instanceof File && v.size > 0);
  if (!uploads.length) return NextResponse.json({ error: "Choose at least one PDF file first." }, { status: 400 });

  const lines: string[] = [];
  try {
    for (const file of uploads) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const r = await importMapFile(repo, actor, file.name, bytes, year);
        lines.push(`✅ ${file.name} — ${importMessage(r)}`);
      } catch (e) {
        lines.push(`❌ ${file.name} — FAILED: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    if (isNextControl(e)) throw e;
    return NextResponse.json({ error: await failureMessage(e, "map", "runUploadMapImport", "/admin/bulk-map-import") }, { status: 500 });
  }
  return NextResponse.json({ message: capMessage(lines) });
}
