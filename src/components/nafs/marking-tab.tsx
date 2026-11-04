import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { listNafsTests, markingQueue } from "@/server/nafs/tests";
import { markWrittenAction } from "@/app/teacher/nafs/actions";
import { SheetsTab } from "./sheets-tab";
import { Combo } from "@/components/ui/combo";
import { RichInline } from "@/components/rich-inline";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line";

/**
 * 🇸🇦 Marking: the short written answers of NAFS tests (online, on paper or typed) waiting for the teacher's rubric
 * score 0 / 1 / 2 — never scored automatically. Each card shows the question, the model answer, the rubric and the
 * student's text (or "answered on paper"); a score is saved at once and the result is graded again (→ Reports).
 * Below: the bubble sheets (print, grade by photo) and the typed answers of paper tests.
 */
export async function MarkingTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const all = sp.all === "1";
  const [q, tests] = await Promise.all([markingQueue(repo, actor, { testId: sp.test || null, all }), listNafsTests(repo, actor)]);
  const here = `/teacher/nafs?${new URLSearchParams({ tab: "marking", ...(sp.test ? { test: sp.test } : {}), ...(all ? { all: "1" } : {}) })}`;
  return (
    <div className="grid gap-4">
      <form method="get" action="/teacher/nafs" className={`${CARD} flex flex-wrap items-end gap-3`}>
        <input type="hidden" name="tab" value="marking" />
        <div className="grid min-w-60 gap-1 text-xs font-semibold text-ink-2"><span>{t("Test")}</span><Combo name="test" label={t("Test")} defaultValue={sp.test ?? ""} options={[{ value: "", label: t("All tests") }, ...tests.map((x) => ({ value: x.id, label: x.title, hint: t("{n} questions", { n: x.questions }) }))]} /></div>
        <label className="flex min-h-10 items-center gap-2 text-sm text-ink"><input type="checkbox" name="all" value="1" defaultChecked={all} className="h-4 w-4" /> {t("Show marked answers too")}</label>
        <button className="min-h-10 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white">{t("Show")}</button>
        <p className="ms-auto text-sm text-ink-2" role="status"><b className="tabular-nums text-ink">{q.waiting}</b> {t("written answer(s) waiting for marking")}</p>
      </form>
      <p className="text-sm text-muted">{t("Short written answers are never scored automatically. Score each with the rubric: 2 = full, 1 = half, 0 = none. Results and Reports update at once.")}</p>
      {!q.items.length ? <p className={`${CARD} text-center text-sm text-muted`}>{t(all ? "No written answers yet." : "Nothing to mark. Every written answer has a score.")}</p> : (
        <ul className="grid gap-3">
          {q.items.map((x) => (
            <li key={`${x.resultId}:${x.index}`} className={CARD}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="text-ink"><b>{x.studentName}</b> <span className="text-muted">· {x.className} · {x.testTitle} · {t("Question {n}", { n: x.n })}</span></p>
                {x.score !== null && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">{t("Score")}: {x.score} / 2</span>}
              </div>
              <p className="mt-2 font-semibold text-ink" lang="en" dir="ltr"><RichInline text={x.stem} /></p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Student's answer")}</p>
                  {x.text ? <p className="mt-1 whitespace-pre-wrap text-ink" lang="en" dir="ltr">{x.text}</p> : <p className="mt-1 text-sm text-muted">{t(x.source === "ONLINE" ? "No answer written." : "Answered on paper: read the booklet, then score it here.")}</p>}
                </div>
                <div className="rounded-xl bg-surface-2 p-3 text-sm ring-1 ring-line" lang="en" dir="ltr">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Model answer and rubric")}</p>
                  <p className="mt-1 text-ink">{x.model}</p>
                  <ul className="mt-1 text-ink-2">{x.rubric.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("Score")}>
                {[2, 1, 0].map((sc) => (
                  <form key={sc} action={markWrittenAction}>
                    <input type="hidden" name="resultId" value={x.resultId} /><input type="hidden" name="index" value={x.index} /><input type="hidden" name="score" value={sc} /><input type="hidden" name="back" value={here} />
                    <button className={`min-h-11 rounded-xl px-5 font-semibold ring-1 ${x.score === sc ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-ink ring-line"}`}>{sc} {sc === 2 ? `· ${t("Full")}` : sc === 1 ? `· ${t("Half")}` : `· ${t("None")}`}</button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm"><Link href="/teacher/nafs?tab=reports" className="font-semibold text-teal-ink underline">{t("Reports")}</Link></p>
      {/* paper tests: bubble sheets (print, grade by photo) and typed answers live here, with the written answers */}
      <div id="sheets" className="mt-2 border-t border-line pt-4"><SheetsTab actor={actor} t={t} /></div>
    </div>
  );
}
