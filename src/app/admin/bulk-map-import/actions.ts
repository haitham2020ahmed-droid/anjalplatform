"use server";
import fs from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import { importMapFile, importMessage } from "@/server/map/map-files";

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
    msg = lines.length ? lines.join("\n") : "No pending files.";
  } catch (e) {
    if (isNextControl(e)) throw e;
    msg = await failureMessage(e, "map", "runBulkMapImport", "/admin/bulk-map-import");
  }
  redirect(`/admin/bulk-map-import?${new URLSearchParams({ msg })}`);
}

/** 🧰 Nov 2026 (owner request, "ضيف صندوق رفع ملفات"): a normal browser "Choose File" upload, so the owner can run a
 * MAP import himself from here any time, without needing a developer to drop files into the repo and ship a patch
 * first (see bulk-map-import/page.tsx for why that git-based path exists at all). Uploaded files are read straight
 * into memory and run through the exact same `importMapFile` pipeline — nothing is written to disk, so there is
 * nothing to clean up and no risk of a file being re-imported by a later deploy. */
export async function runUploadMapImportAction(f: FormData): Promise<void> {
  const year = Number(f.get("year")) || new Date().getFullYear();
  let msg = "";
  try {
    const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
    const uploads = f.getAll("files").filter((v): v is File => v instanceof File && v.size > 0);
    if (!uploads.length) {
      redirect(`/admin/bulk-map-import?${new URLSearchParams({ msg: "Choose at least one PDF file first." })}`);
    }
    const lines: string[] = [];
    for (const file of uploads) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const r = await importMapFile(repo, actor, file.name, bytes, year);
        lines.push(`✅ ${file.name} — ${importMessage(r)}`);
      } catch (e) {
        lines.push(`❌ ${file.name} — FAILED: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    msg = lines.join("\n");
  } catch (e) {
    if (isNextControl(e)) throw e;
    msg = await failureMessage(e, "map", "runUploadMapImport", "/admin/bulk-map-import");
  }
  redirect(`/admin/bulk-map-import?${new URLSearchParams({ msg })}`);
}
