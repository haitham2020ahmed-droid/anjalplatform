import Link from "next/link";
import type { TFn } from "@/i18n";
import { RichInline } from "@/components/rich-inline";
import type { MissedQuestion } from "@/server/insights/missed-questions";
import { BAND_LABEL, type Band } from "@/server/skills/difficulty";
import { InsightActions } from "./insight-actions";

const BAND_TONE: Record<Band, string> = { EASY: "bg-emerald-100 text-emerald-900", MEDIUM: "bg-sky-100 text-sky-900", HARD: "bg-violet-100 text-violet-900" };

/** The difficulty band of a question, as a small pill (Easy / Medium / Hard). */
export function BandPill({ band, t }: { band: Band; t: TFn }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_TONE[band]}`} data-band={band}>{t(BAND_LABEL[band])}</span>;
}

/**
 * ❓ One real question the class missed (Mistakes and root causes, Nov 2026): the question with its choices (the right
 * one marked), the wrong answer most of them chose, who missed it, and the buttons — show it big on the screen to go
 * over it with the class, or make a group of the students who missed it.
 */
export function MissedQuestionCard({ q, t, classId, size, compact = false }: { q: MissedQuestion; t: TFn; classId: string; size: number; compact?: boolean }) {
  const show = `/teacher/reports/question-show?${new URLSearchParams({ q: q.questionId, classId })}`;
  return (
    <div className={`rounded-2xl bg-white p-4 ring-1 ring-slate-200 ${compact ? "mt-3" : ""}`} data-missed-question={q.questionId}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="font-semibold text-brand-navy">{q.skill}</span>
        <BandPill band={q.band} t={t} />
        <b className="ms-auto rounded-full bg-rose-100 px-2 py-0.5 tabular-nums text-rose-900">{t("{n} of {m} missed", { n: q.missedBy.length, m: q.tried })}</b>
      </div>
      {q.passageTitle && <p className="mt-2 text-xs text-slate-500">📖 <span data-content lang="en">{q.passageTitle}</span></p>}
      <p className="mt-2 font-medium text-slate-900" data-content lang="en"><RichInline text={q.stem} /></p>
      {q.options ? (
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{q.options.map((o) => (
          <li key={o.label} className={`rounded-lg px-2 py-1 ring-1 ${o.correct ? "bg-emerald-50 font-semibold text-emerald-900 ring-emerald-300" : "bg-slate-50 text-slate-700 ring-slate-200"}`}>
            <span className="me-1">{o.label}.</span><span data-content lang="en"><RichInline text={o.text} /></span>{o.correct && <span className="ms-1" aria-label={t("Right answer")}>✓</span>}
          </li>
        ))}</ul>
      ) : <p className="mt-2 text-sm"><span className="text-slate-500">{t("Right answer")}:</span> <b className="text-emerald-800" data-content lang="en">{q.correctAnswer}</b></p>}
      {q.commonWrong && <p className="mt-2 text-sm text-rose-900">⚠️ {t("Most chose")}: <b data-content lang="en">{q.commonWrong.text}</b> <span className="tabular-nums">({t("{n} students", { n: q.commonWrong.n })})</span></p>}
      {!compact && <p className="mt-1 text-sm text-slate-700">{t("Missed by")}: <bdi>{q.missedBy.map((x) => x.name).join(", ")}</bdi></p>}
      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <Link prefetch={false} href={show} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white hover:bg-brand-teal" data-show-on-screen>📺 {t("Show on screen")}</Link>
        {q.missedBy.length < size && <InsightActions t={t} target={{ classId, studentIds: q.missedBy.map((x) => x.id), skillId: q.skillId }} only={["group"]} />}
      </div>
    </div>
  );
}
