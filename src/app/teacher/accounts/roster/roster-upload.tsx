"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState } from "@/components/ui-kit";
import { previewRosterAction, saveRosterAction, type RosterState } from "../../home-actions";

/** 📤 Upload Roster: choose the file → preview (with row errors) → Save. The file is kept here between the two steps. */
export function RosterUpload({ classId, className }: { classId: string; className: string }) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<RosterState>({});
  const [pending, start] = useTransition();
  const send = (step: "preview" | "save") => {
    if (!file) { setState({ error: t("Choose the roster file (.xlsx or .csv).") }); return; }
    const f = new FormData();
    f.set("classId", classId); f.set("file", file);
    if (step === "save" && state.plan) f.set("sha256", state.plan.sha256);
    start(async () => setState(step === "preview" ? await previewRosterAction(f) : { ...(await saveRosterAction(f)), plan: undefined }));
  };
  const plan = state.plan;
  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-brand-navy">1 · {t("Download the template")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("Two columns: Student Name and Username. Each student’s password will be their username.")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/api/class-roster-template" className={BTN_SECONDARY}><span aria-hidden="true">📄</span> {t("Template (Excel)")}</a>
          <a href="/api/class-roster-template?format=csv" className={BTN_SECONDARY}><span aria-hidden="true">📄</span> {t("Template (CSV)")}</a>
        </div>
      </section>
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-brand-navy">2 · {t("Upload the file and check the preview")}</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="file" accept=".xlsx,.csv" aria-label={t("Roster file")} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setState({}); }} className="min-h-11 text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:font-semibold" />
          <button type="button" onClick={() => send("preview")} disabled={pending || !file} className={BTN_PRIMARY}>{t(pending ? "Loading…" : "Preview")}</button>
        </div>
        {state.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
        {state.saved && (
          <div role="status" className="mt-3 rounded-xl bg-teal-50 p-4 text-teal-950 ring-1 ring-teal-200">
            <p className="font-semibold">✓ {t("{n} students added to {class}", { n: state.saved.created, class: state.saved.className })}</p>
            <p className="mt-2"><Link href={`/teacher/accounts?classId=${classId}`} className={BTN_PRIMARY}>{t("Download Accounts")}</Link></p>
          </div>
        )}
      </section>
      {plan && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200" aria-labelledby="preview-h">
          <h2 id="preview-h" className="text-lg font-semibold text-brand-navy">3 · {t("Preview")} · <bdi>{className}</bdi></h2>
          <p className="mt-1 text-sm text-slate-600">{t("{n} students ready", { n: plan.lines.length })} · {t("{n} rows with errors", { n: plan.problems.length })}</p>
          {plan.problems.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-red-200">
              <table className="w-full min-w-[420px] text-sm"><caption className="bg-red-50 p-2 text-start font-semibold text-red-900">{t("Rows with errors (nothing is saved until they are fixed)")}</caption>
                <thead className="text-slate-600"><tr><th className="p-2 text-start">{t("Row")}</th><th className="p-2 text-start">{t("Column")}</th><th className="p-2 text-start">{t("Problem")}</th></tr></thead>
                <tbody className="divide-y divide-red-100">{plan.problems.map((p, i) => <tr key={i}><td className="p-2 tabular-nums">{p.line}</td><td className="p-2">{p.column}</td><td className="p-2">{p.message}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {plan.lines.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-start">{t("Row")}</th><th className="p-2 text-start">{t("Student Name")}</th><th className="p-2 text-start">{t("Username")}</th><th className="p-2 text-start">{t("Password")}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{plan.lines.map((l) => <tr key={l.line}><td className="p-2 tabular-nums">{l.line}</td><td className="p-2"><bdi>{l.name}</bdi></td><td className="p-2 font-mono" dir="ltr">{l.username}</td><td className="p-2 font-mono" dir="ltr">{l.password}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <div className="mt-3"><EmptyState compact icon="📄" title="Nothing to show yet" /></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => send("save")} disabled={pending || plan.problems.length > 0 || plan.lines.length === 0} className={BTN_PRIMARY}>{t("Save {n} students", { n: plan.lines.length })}</button>
          </div>
        </section>
      )}
    </div>
  );
}
