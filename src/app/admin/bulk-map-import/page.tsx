import fs from "node:fs";
import path from "node:path";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";
import { runBulkMapImportAction } from "./actions";
import { MapUploadBox } from "./map-upload-box";

export const metadata = { title: "Bulk MAP import" };

/**
 * 🧰 Nov 2026 — one-time admin tool (owner request). Built because this environment (an AI assistant working the
 * site through a remote browser) had no way to drive the site's native "Choose File" dialog itself — that dialog is
 * a real operating-system window, not part of the web page, so nothing short of a human click (or the Claude-in-
 * Chrome browser extension, which was offline) can select a file from it. This page sidesteps that: a developer
 * drops NWEA PDFs straight into the repo (assets/pending-map-imports/, never served publicly — see Dockerfile) and
 * this button runs them through the EXACT SAME import pipeline (`importMapFile`) the normal upload form uses — same
 * parsing, same duplicate/ambiguous-name handling, same MAP plans. Nothing about the regular upload page changes;
 * this is an extra door into the same room. Each file is deleted right after a successful import so re-running this
 * page (or redeploying) can never import the same file twice.
 */
export default async function BulkMapImportPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const dir = path.join(process.cwd(), "assets", "pending-map-imports");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort() : [];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="📥" title="Bulk MAP import (one-time tool)"
        subtitle="Imports every PDF sitting in assets/pending-map-imports/ using the exact same pipeline as the normal MAP upload page." />
      {sp.msg && <pre role="status" className="mb-4 whitespace-pre-wrap rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">{sp.msg}</pre>}
      {/* 🧰 Nov 2026 (owner request): upload PDFs straight from the browser — no repo/git step needed. */}
      <MapUploadBox />
      {files.length ? (
        <form action={runBulkMapImportAction} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="mb-3 text-sm text-slate-600">{files.length} file(s) waiting: {files.join(", ")}</p>
          <input type="hidden" name="year" value={2026} />
          <button className="rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white hover:bg-brand-purple">Import all {files.length} file(s)</button>
        </form>
      ) : <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No pending files in assets/pending-map-imports/.</p>}
    </AppShell>
  );
}
