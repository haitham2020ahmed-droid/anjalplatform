"use server";
import fs from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import { importMapFile, importMessage } from "@/server/map/map-files";

// 🐛 Nov 2026 fix: a big batch (e.g. a whole grade's PDFs with several ambiguous-name errors) could build a result
// message thousands of characters long, dumped whole into the page's <pre>. Cap it and say how many lines were cut.
const MAX_MESSAGE_LINES = 60;
function capMessage(lines: string[]): string {
  if (lines.length <= MAX_MESSAGE_LINES) return lines.join("\n");
  return [...lines.slice(0, MAX_MESSAGE_LINES), `… and ${lines.length - MAX_MESSAGE_LINES} more file(s). Check the MAP tab to confirm every score landed.`].join("\n");
}

/** 🧰 Nov 2026 — runs every PDF in assets/pending-map-imports/ through the same `importMapFile` pipeline the
 * normal upload form (teacher/map-rit-actions.ts → importMapScoresAction) uses, one file at a time, then deletes
 * each file it successfully processed (a file that throws is left in place so it can be inspected and retried).
 * See bulk-map-import/page.tsx for why this page exists. */
export async function runBulkMapImportAction(f: FormData): Promise<void> {
  const year = Number(f.get("year")) || new Date().getFullYear();
  let msg = "";
  try {
    const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
    const dir = path.join(process.cwd(), "assets", "pending-map-imports");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f2) => f2.toLowerCase().endsWith(".pdf")).sort() : [];
    const lines: string[] = [];
    for (const name of files) {
      const full = path.join(dir, name);
      try {
        const bytes = new Uint8Array(fs.readFileSync(full));
        const r = await importMapFile(repo, actor, name, bytes, year);
        lines.push(`✅ ${name} — ${importMessage(r)}`);
        fs.unlinkSync(full); // done — never import the same file twice by re-running this tool or redeploying
      } catch (e) {
        lines.push(`❌ ${name} — FAILED: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    msg = lines.length ? capMessage(lines) : "No pending files.";
  } catch (e) {
    if (isNextControl(e)) throw e;
    msg = await failureMessage(e, "map", "runBulkMapImport", "/admin/bulk-map-import");
  }
  redirect(`/admin/bulk-map-import?${new URLSearchParams({ msg })}`);
}

// 🧰 Nov 2026 fix: the browser "Upload PDF(s)" box used to post here as a Server Action, which shares the app's
// global 4 MB Server Action body cap (next.config.ts) — too small for real multi-page NWEA PDFs. It now posts to
// /api/admin/bulk-map-import instead (a plain route with its own 20 MB cap), so this action was removed; see that
// route for the up-to-date version of this same importMapFile loop.
