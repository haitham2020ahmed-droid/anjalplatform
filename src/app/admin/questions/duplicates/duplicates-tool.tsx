"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/i18n/client";
import type { RemovedRow } from "@/server/questions/dedupe";
import { fillHashesAction, findDuplicatesAction, missingHashesAction, removeDuplicatesAction, type ClientPlan } from "./actions";

/** questions per remove call (the server accepts 500) */
const MAX_IDS = 400;

function csvOf(rows: RemovedRow[]): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + [["Removed question", "Kept question", "Grade", "Skill", "Status of removed", "Student answers moved", "Question"], ...rows.map((r) => [r.removedId, r.keptId, r.grade, r.skill, r.status, r.answersMoved, r.stem])].map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Find → preview → Remove (batches with a progress bar) → report + CSV; plus the “similar but not identical” list. */
export function DuplicatesTool() {
  const t = useT();
  const [step, setStep] = useState<"idle" | "hashing" | "finding" | "found" | "removing" | "done">("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [plan, setPlan] = useState<ClientPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ removed: number; moved: number; rows: RemovedRow[] } | null>(null);

  async function find() {
    setError(null); setReport(null); setPlan(null);
    try {
      // 1. fingerprints of questions saved before this tool existed (1,000 per request)
      let { missing } = await missingHashesAction();
      if (missing > 0) {
        setStep("hashing");
        const total = missing;
        setProgress({ done: 0, total });
        while (missing > 0) {
          const r = await fillHashesAction();
          missing = r.missing;
          setProgress({ done: total - missing, total });
          if (!r.filled) break;
        }
      }
      // 2. the groups
      setStep("finding"); setProgress(null);
      const r = await findDuplicatesAction();
      if (r.error || !r.plan) { setError(r.error ?? t("Something went wrong. Try again.")); setStep("idle"); return; }
      setPlan(r.plan);
      setStep("found");
    } catch {
      setError(t("The server did not answer. Try again.")); setStep("idle");
    }
  }

  async function remove() {
    if (!plan?.groups.length) return;
    if (!window.confirm(t("Remove {n} duplicate questions? Students' answers move to the copy that is kept. This cannot be undone without a backup.", { n: plan.toRemove }))) return;
    const batches: string[][][] = [];
    let cur: string[][] = [], n = 0;
    for (const g of plan.groups) {
      if (n + g.ids.length > MAX_IDS && cur.length) { batches.push(cur); cur = []; n = 0; }
      cur.push(g.ids); n += g.ids.length;
    }
    if (cur.length) batches.push(cur);
    setStep("removing"); setError(null);
    const total = plan.toRemove;
    let removed = 0, moved = 0;
    const rows: RemovedRow[] = [];
    setProgress({ done: 0, total });
    for (const b of batches) {
      let r: Awaited<ReturnType<typeof removeDuplicatesAction>>;
      try { r = await removeDuplicatesAction(b); } catch { r = { error: t("The server did not answer. Try again.") }; }
      if (r.error) { setError(`${r.error} ${t("{n} removed before the error.", { n: removed })}`); break; }
      removed += r.removed ?? 0; moved += r.movedAnswers ?? 0; rows.push(...(r.rows ?? []));
      setProgress({ done: Math.min(total, removed), total });
    }
    setReport({ removed, moved, rows });
    setStep("done"); setProgress(null);
  }

  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([csvOf(report.rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "removed-duplicate-questions.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const bySkill = report ? Object.entries(report.rows.reduce<Record<string, number>>((m, r) => { const k = `G${r.grade} · ${r.skill}`; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]) : [];
  const busy = step === "hashing" || step === "finding" || step === "removing";
  const btn = "min-h-11 rounded-xl px-5 py-2.5 font-semibold disabled:opacity-50";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void find()} disabled={busy} className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`}>🔎 {t("Find duplicates")}</button>
        {plan && plan.toRemove > 0 && step !== "done" && <button type="button" onClick={() => void remove()} disabled={busy} className={`${btn} bg-red-700 text-white hover:bg-red-800`}>🗑 {t("Remove {n} duplicates", { n: plan.toRemove.toLocaleString("en") })}</button>}
        {step === "finding" && <span role="status" className="text-slate-600">{t("Checking every question…")}</span>}
      </div>
      {progress && (
        <div role="status">
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><div className="h-full bg-brand-teal transition-all" style={{ width: `${Math.round((100 * progress.done) / Math.max(1, progress.total))}%` }} /></div>
          <p className="mt-1 text-sm text-slate-600">{step === "hashing" ? t("Preparing the questions: {n} of {m}", { n: progress.done, m: progress.total }) : t("Removing: {n} of {m}", { n: progress.done, m: progress.total })}</p>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{error}</p>}

      {report && (
        <section className="rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-200" aria-labelledby="dup-report">
          <h2 id="dup-report" className="text-lg font-semibold text-teal-950">✅ {t("Removed {n} duplicate questions, moved {m} student answers.", { n: report.removed.toLocaleString("en"), m: report.moved.toLocaleString("en") })}</h2>
          {bySkill.length > 0 && <ul className="mt-2 grid gap-1 text-sm text-teal-950 sm:grid-cols-2">{bySkill.slice(0, 40).map(([k, n]) => <li key={k}>{k}: <b>{n}</b></li>)}</ul>}
          {report.rows.length > 0 && <button type="button" onClick={download} className="mt-3 rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">⬇ {t("Download the report (CSV)")}</button>}
        </section>
      )}

      {plan && step !== "done" && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="dup-preview">
          <h2 id="dup-preview" className="text-lg font-semibold text-brand-navy">{t("Preview")}</h2>
          <dl className="mt-2 grid gap-3 sm:grid-cols-4">
            {[[t("Questions checked"), plan.scanned], [t("Duplicate groups"), plan.groups.length], [t("Questions to remove"), plan.toRemove], [t("Student answers to move"), plan.answersToMove]].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{k}</dt><dd className="text-2xl font-bold tabular-nums text-brand-navy">{Number(v).toLocaleString("en")}</dd></div>
            ))}
          </dl>
          {plan.toRemove === 0 && <p className="mt-3 text-slate-700">{t("No exact duplicates. ✅")}</p>}
          {plan.bySkill.length > 0 && (
            <details className="mt-3" open>
              <summary className="cursor-pointer font-semibold text-slate-700">{t("By skill")}</summary>
              <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">{plan.bySkill.slice(0, 60).map((b) => <li key={`${b.grade}${b.skill}`}>G{b.grade} · {b.skill}: <b>{b.n}</b></li>)}</ul>
            </details>
          )}
          {plan.groups.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold text-slate-700">{t("The groups (first 100)")}</summary>
              <ul className="mt-2 space-y-1 text-sm">{plan.groups.slice(0, 100).map((g) => (
                <li key={g.keep} className="rounded-lg bg-slate-50 px-3 py-1.5"><Link href={`/admin/questions/${g.keep}`} className="font-medium text-brand-navy underline">{g.stem}</Link> <span className="text-slate-600">· G{g.grade} · {g.skill} · {t("keep 1 ({s}), remove {n}", { s: g.keepStatus.toLowerCase(), n: g.remove })}{g.answers ? ` · ${t("{n} answers move", { n: g.answers })}` : ""}</span></li>
              ))}</ul>
            </details>
          )}
        </section>
      )}

      {plan && plan.review.length > 0 && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="dup-review">
          <h2 id="dup-review" className="text-lg font-semibold text-brand-navy">{t("Similar but not identical")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("These are NOT removed. Same wording with other choices or another answer, or the same question under different skills. Open them and decide.")}</p>
          <ul className="mt-3 space-y-2">{plan.review.map((g, i) => (
            <li key={i} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-sm"><span className={`me-2 rounded-full px-2 py-0.5 text-xs font-semibold ${g.reason === "OTHER_FAMILY" ? "bg-violet-100 text-violet-900" : "bg-amber-100 text-amber-900"}`}>{g.reason === "OTHER_FAMILY" ? t("Different skills") : t("Similar")}</span><span className="font-medium text-slate-900">{g.stem}</span></p>
              <p className="mt-1 flex flex-wrap gap-2 text-sm">{g.questions.map((q) => <Link key={q.id} href={`/admin/questions/${q.id}`} className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-300 hover:ring-brand-teal">G{q.grade} · {q.skill} · {q.status.toLowerCase()}</Link>)}</p>
            </li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
