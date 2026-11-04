"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { LineIcon } from "@/components/ui/line-icon";
import { FixReportView } from "@/components/admin/fix-report";
import type { Cursor, FixReport, StuckCounts } from "@/server/admin/stuck-questions";
import { fixStuckStepAction } from "./fix-actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PHASE: Record<Cursor["phase"], string> = { passages: "Removing questions that need a missing passage…", classify: "Putting questions under their skills…", repair: "Repairing and publishing…", done: "Done" };

/**
 * 🛠 Fix stuck questions (Question Bank, admins): one button; batches with a progress view; the final report with what
 * is left (plain reason + open in the editor).
 */
export function FixStuck({ counts, last }: { counts: StuckCounts; last: FixReport | null }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<{ phase: Cursor["phase"]; processed: number } | null>(null);
  const [report, setReport] = useState<FixReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const stuck = counts.unclassified + counts.drafts + counts.waiting;

  async function start() {
    if (!window.confirm(t("Fix stuck questions now? Questions that need a passage or picture that is not attached are hidden (students' answers are kept), questions get their skill, what can be repaired is repaired, and every question that passes the publish checks is published."))) return;
    setError(null); setReport(null); setNote(null);
    let cursor: Cursor | null = null, processed = 0;
    setBusy({ phase: "passages", processed });
    for (let guard = 0; guard < 5000; guard++) {
      const r: Awaited<ReturnType<typeof fixStuckStepAction>> = await fixStuckStepAction(cursor).catch(() => ({ error: t("The server did not answer. Try again.") }));
      if (r.error || !r.cursor) { setBusy(null); setError(r.error ?? t("The server did not answer. Try again.")); router.refresh(); return; }
      // 🛑 fix (Oct 2026): the server pauses a batch (same cursor, nothing done) when it is low on memory, instead
      // of doing more work on top of an already-busy instance — wait it out here, same as bulk-review.tsx.
      if (r.waitMs && r.waitMs > 0) { setNote(t("Waiting a moment for the server…")); await sleep(r.waitMs); setNote(null); continue; }
      processed += r.processed ?? 0;
      setBusy({ phase: r.cursor.phase, processed });
      if (r.cursor.phase === "done") { setBusy(null); setReport(r.report ?? null); router.refresh(); return; }
      cursor = r.cursor;
    }
  }

  return (
    <section className="rounded-2xl bg-gradient-to-br from-teal-50 to-white p-4 ring-1 ring-teal-200" aria-labelledby="fix-stuck-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="fix-stuck-title" className="flex items-center gap-2 text-lg font-bold text-brand-navy"><LineIcon name="tools" className="h-5 w-5 text-teal-700" />{t("Stuck questions")}</h2>
          <p className="mt-0.5 text-sm text-slate-700">
            {stuck === 0 ? t("Nothing is stuck: every question is under a skill and published.")
              : t("{u} not under a skill · {d} drafts · {w} waiting for review", { u: counts.unclassified.toLocaleString("en"), d: counts.drafts.toLocaleString("en"), w: counts.waiting.toLocaleString("en") })}
          </p>
        </div>
        <button type="button" onClick={() => void start()} disabled={!!busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-teal px-5 py-2.5 font-semibold text-white hover:bg-teal-800 disabled:opacity-60" data-testid="fix-stuck">
          <LineIcon name="tools" className="h-5 w-5" />{busy ? t("Fixing…") : t("Fix stuck questions")}
        </button>
      </div>
      {busy && (
        <div role="status" className="mt-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-teal-100"><div className="h-full animate-pulse bg-brand-teal" style={{ width: `${busy.phase === "passages" ? 20 : busy.phase === "classify" ? 50 : 80}%` }} /></div>
          <p className="mt-1 text-sm text-slate-700">{t(PHASE[busy.phase])} {t("{n} checked", { n: busy.processed.toLocaleString("en") })}</p>
        </div>
      )}
      {note && <p role="status" className="mt-2 text-sm text-slate-600">{t(note)}</p>}
      <p className="mt-2 text-sm"><Link href="/admin/questions/missing-passage" className="font-semibold text-brand-navy underline" data-testid="missing-passage-link">{t("Remove questions that need a missing passage")}</Link></p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {(report ?? last) && !busy && (
        <details className="mt-3" open={!!report}>
          <summary className="cursor-pointer text-sm font-semibold text-brand-navy">{report ? t("Report of this run") : t("Report of the last run")}</summary>
          <div className="mt-2"><FixReportView report={(report ?? last)!} t={t} /></div>
        </details>
      )}
    </section>
  );
}
