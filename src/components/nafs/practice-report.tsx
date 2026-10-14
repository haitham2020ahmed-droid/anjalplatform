import Link from "next/link";
import type { TFn } from "@/i18n";
import type { PracticeReport } from "@/server/nafs/practice";
import { DIFFICULTY_NAME } from "@/server/nafs/framework";
import { CodeHead } from "./code-name";

const mmss = (sec: number) => { const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; };
const STATUS: Record<PracticeReport["students"][number]["status"], string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", DONE: "Finished" };

/**
 * 🇸🇦 Adaptive-practice results (teacher-facing): per student and chosen skill / standard — the difficulty reached
 * (the hardest one answered right), accuracy, secure (✓) or not, time spent. Used by the Adaptive practice tab and
 * Reports.
 */
export function PracticeReportView({ r, t, closeHref }: { r: PracticeReport; t: TFn; closeHref?: string }) {
  return (
    <section className="rounded-2xl bg-surface p-5 shadow-card ring-2 ring-teal-300 print:shadow-none" aria-labelledby="pr-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pr-h" className="text-lg font-semibold text-ink">🎯 {r.title} <span className="text-sm font-normal text-muted">· {r.className} · {t("{n} questions per student", { n: r.maxQuestions })}{r.minutes ? ` · ${t("{n} minutes", { n: r.minutes })}` : ""}</span></h2>
        {closeHref && <Link href={closeHref} className="text-sm font-semibold text-muted">✕ {t("Close")}</Link>}
      </div>
      <p className="mt-1 text-xs text-muted">{t("Each cell: the hardest difficulty answered right · accuracy · ✓ = mastered (4 of the last 5 right, at least 2 at Medium or Hard).")}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-start text-xs text-muted">
              <th className="py-2 pe-3 text-start">{t("Student")}</th>
              <th className="py-2 pe-3 text-start">{t("Status")}</th>
              <th className="py-2 pe-3 text-end">{t("Accuracy")}</th>
              <th className="py-2 pe-3 text-end">{t("Time spent")}</th>
              {r.targets.map((x) => <th key={x.code} className="py-2 pe-3 align-bottom"><CodeHead code={x.code} t={t} /></th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.students.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pe-3 font-semibold text-ink">{s.name}</td>
                <td className="py-2 pe-3 text-ink-2">{t(STATUS[s.status])}{s.asked ? <span className="ms-1 text-xs text-muted">({s.asked})</span> : null}</td>
                <td className="py-2 pe-3 text-end tabular-nums">{s.pct === null ? "—" : `${s.pct}%`}</td>
                <td className="py-2 pe-3 text-end tabular-nums" dir="ltr">{s.seconds ? mmss(s.seconds) : "—"}</td>
                {r.targets.map((x) => {
                  const c = s.cells[x.code];
                  return (
                    <td key={x.code} className="py-2 pe-3">
                      {c && c.n ? (
                        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs ring-1 ${c.mastered ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-surface-2 text-ink-2 ring-line"}`}>
                          {c.mastered && <b aria-label={t("Mastered")}>✓</b>}{c.reached ? t(DIFFICULTY_NAME[c.reached]) : "—"} · <span className="tabular-nums">{c.pct}%</span> <span className="text-muted">({c.n})</span>
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
