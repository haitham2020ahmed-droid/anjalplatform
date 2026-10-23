"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import type { SortReviewItem } from "@/server/questions/link-bank-run";
import { sortBatchAction } from "./actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Phase = "idle" | "checking" | "preview" | "running" | "done";
interface Tally { total: number; processed: number; linked: number; review: number }
const ZERO: Tally = { total: 0, processed: 0, linked: 0, review: 0 };
const SHOW_REVIEW = 300;

/**
 * “Sort questions under their skills”: 1) preview the counts (nothing written), 2) Run in batches of ~200 with a progress
 * bar (one server call per batch, so the server never holds the bank), 3) the questions that could not be matched.
 * Never deletes and never publishes a question.
 */
export function SortQuestions() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [tally, setTally] = useState<Tally>(ZERO);
  const [preview, setPreview] = useState<Tally>(ZERO);
  const [review, setReview] = useState<SortReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function loop(apply: boolean): Promise<Tally | null> {
    let after: string | null = null;
    let sum: Tally = { ...ZERO };
    const items: SortReviewItem[] = [];
    for (let guard = 0; guard < 1000; guard++) {
      const r = await sortBatchAction(after, apply);
      if (r.error || !r.result) { setError(r.error ?? t("Something went wrong. Try again.")); return null; }
      const b = r.result;
      // 🛑 fix (Oct 2026): the server pauses a batch (same cursor, nothing done) when it is low on memory, instead
      // of doing more work on top of an already-busy instance — wait it out here, same as bulk-review.tsx.
      if (b.waitMs > 0) { setNote(t("Waiting a moment for the server…")); await sleep(b.waitMs); setNote(null); continue; }
      sum = { total: after === null ? b.total : sum.total, processed: sum.processed + b.processed, linked: sum.linked + b.linked, review: sum.review + b.review };
      if (apply && items.length < SHOW_REVIEW) items.push(...b.reviewItems.slice(0, SHOW_REVIEW - items.length));
      setTally(sum);
      if (b.done || !b.next) break;
      after = b.next;
    }
    if (apply) setReview(items);
    return sum;
  }

  async function check() {
    setError(null); setTally(ZERO); setNote(null); setPhase("checking");
    const sum = await loop(false);
    if (!sum) return setPhase("idle");
    setPreview(sum); setPhase("preview");
  }
  async function run() {
    setError(null); setTally({ ...ZERO, total: preview.total }); setNote(null); setPhase("running");
    const sum = await loop(true);
    if (!sum) return setPhase("preview");
    setPhase("done");
    router.refresh();
  }

  const busy = phase === "checking" || phase === "running";
  const pct = tally.total ? Math.min(100, Math.round((tally.processed / tally.total) * 100)) : 0;
  return (
    <section id="sort" className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-brand-navy">{t("Sort questions under their skills")}</h2>
          <p className="text-sm text-slate-600">{t("Questions without a skill are linked when the platform is sure. The rest is listed here for you. Nothing is deleted or published.")}</p>
        </div>
        {phase === "idle" && <button type="button" onClick={check} className={BTN_PRIMARY}>{t("Sort questions under their skills")}</button>}
      </div>

      {busy && (
        <div className="mt-4" role="status">
          <p className="text-sm text-slate-700">{phase === "checking" ? t("Checking…") : t("Sorting…")} {t("{n} of {m}", { n: tally.processed, m: tally.total })}</p>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {note && <p role="status" className="mt-2 text-sm text-slate-600">{t(note)}</p>}

      {phase === "preview" && (
        preview.total === 0 ? (
          <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">✓ {t("Every question is already under a skill.")}</p>
        ) : (
          <div className="mt-4">
            <ul className="grid gap-3 sm:grid-cols-3">
              <li className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-2xl font-bold text-brand-navy">{preview.total}</p><p className="text-sm text-slate-600">{t("questions without a skill")}</p></li>
              <li className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200"><p className="text-2xl font-bold text-emerald-800">{preview.linked}</p><p className="text-sm text-slate-600">{t("will be linked")}</p></li>
              <li className="rounded-xl bg-orange-50 p-4 ring-1 ring-orange-200"><p className="text-2xl font-bold text-orange-800">{preview.review}</p><p className="text-sm text-slate-600">{t("need your review")}</p></li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={run} disabled={!preview.linked && !preview.review} className={`${BTN_PRIMARY} disabled:opacity-60`}>{t("Run")}</button>
              <button type="button" onClick={() => setPhase("idle")} className={BTN_SECONDARY}>{t("Cancel")}</button>
            </div>
          </div>
        )
      )}

      {phase === "done" && (
        <div className="mt-4">
          <p role="status" className="rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">✓ {t("{n} question(s) linked to their skill. {m} need your review.", { n: tally.linked, m: tally.review })}</p>
          {review.length > 0 && (
            <>
              <h3 className="mt-4 font-semibold text-brand-navy">{t("Could not be matched")}</h3>
              <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto">
                {review.map((r) => (
                  <li key={r.questionId} className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                    <span className="me-2 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200">{t("Grade {n}", { n: r.grade })}</span>
                    <span data-content lang="en">{r.excerpt}</span>
                    <p className="mt-1 text-slate-600">{r.guess ? <>{t("Best guess:")} <b>{r.guess}</b> — </> : null}{r.reason}</p>
                  </li>
                ))}
              </ul>
              <Link href="/admin/skill-links?kind=QUESTION" className={`${BTN_SECONDARY} mt-3`}>{t("Choose their skills")}</Link>
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-red-800 ring-1 ring-red-200">{t(error)}</p>}
    </section>
  );
}
