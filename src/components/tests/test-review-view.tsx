"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { EmptyState, SourceTag } from "@/components/ui-kit";
import type { TestReview } from "@/server/tests/assessments";
import { RichInline } from "@/components/rich-inline";

/** A completed test, question by question: the student's answer, the correct answer and why. */
export function TestReviewView({ r, backHref, backLabel }: { r: TestReview; backHref: string; backLabel: string }) {
  const t = useT();
  return (
    <div>
      <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-medium text-slate-500 hover:text-brand-teal"><span aria-hidden="true" className="me-1 inline-block rtl:rotate-180">‹</span>{t(backLabel)}</Link>
      <header className="mt-1 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <p><SourceTag source={r.tag} /></p>
        <h1 className="text-2xl font-semibold text-brand-navy">{r.title}</h1>
        <p className="mt-1 text-lg text-slate-700">{r.student} · <strong>{r.pct}%</strong> ({t("{n} of {total} correct", { n: r.correct, total: r.total })}){r.completedAt ? ` · ${new Date(r.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
      </header>
      {r.items.length === 0 && <EmptyState compact icon="📝" title="Nothing to show yet" className="mt-4" />}
      <ol className="mt-4 grid gap-3">
        {r.items.map((x) => (
          <li key={x.questionId} className={`rounded-2xl bg-white p-5 ring-1 ${x.correct ? "ring-emerald-200" : "ring-rose-200"}`}>
            <p className="text-xs font-semibold text-slate-500">{t("Question {n}", { n: x.n })} · <bdi>{x.skill}</bdi>{x.passageTitle ? <> · <bdi>{x.passageTitle}</bdi></> : null}</p>
            <p className="mt-1 text-lg text-slate-900" data-content lang="en"><RichInline text={x.stem} /></p>
            <p className={`mt-2 ${x.correct ? "text-emerald-700" : "text-rose-700"}`}>{x.correct ? "✓" : "✗"} {t("Your answer:")} {x.answered ? <bdi lang="en"><RichInline text={x.yourAnswer || "—"} /></bdi> : t("Not answered")}</p>
            {!x.correct && <p className="mt-1 text-slate-800">{t("Correct answer:")} <strong><bdi lang="en"><RichInline text={x.correctAnswer} /></bdi></strong></p>}
            {x.why && <p className="mt-1 text-sm text-slate-600" data-content lang="en"><RichInline text={x.why} /></p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
