import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RichInline } from "@/components/rich-inline";
import { BandPill } from "@/components/teacher/missed-question";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { questionForScreen } from "@/server/insights/missed-questions";

export const metadata = { title: "Show on screen" };

/**
 * 📺 One question, big, for the class screen (from Mistakes and root causes, Nov 2026): the passage, the question and
 * its choices in large type; "Show the answer" opens the right answer and why (no script: a <details>).
 */
export default async function QuestionShowPage({ searchParams }: { searchParams: Promise<{ q?: string; classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  let q;
  try { q = await questionForScreen(repo, actor, String(sp.q ?? "")); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const back = `/teacher/reports/errors${sp.classId ? `?${new URLSearchParams({ classId: sp.classId })}` : ""}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="mx-auto max-w-5xl" data-question-screen={q.questionId}>
        <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
          <Link prefetch={false} href={back} className="text-sm font-semibold text-brand-teal underline">← {t("Mistakes and root causes")}</Link>
          <span className="ms-auto flex items-center gap-2 text-sm text-slate-600">{q.skill} <BandPill band={q.band} t={t} /></span>
        </div>
        {q.passage && (
          <section className="mb-5 rounded-3xl bg-amber-50/60 p-6 ring-1 ring-amber-200">
            {q.passage.title && <h2 className="mb-2 text-2xl font-bold text-brand-navy" data-content lang="en">{q.passage.title}</h2>}
            <div className="whitespace-pre-line text-xl leading-relaxed text-slate-900" data-content lang="en"><RichInline text={q.passage.text} /></div>
          </section>
        )}
        <p className="text-3xl font-bold leading-snug text-slate-900 sm:text-4xl" data-content lang="en"><RichInline text={q.stem} /></p>
        {q.options && (
          <ol className="mt-6 grid gap-3 sm:grid-cols-2">{q.options.map((o) => (
            <li key={o.label} className="flex items-start gap-3 rounded-2xl bg-white p-5 text-2xl ring-2 ring-slate-200">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-navy text-xl font-bold text-white">{o.label}</span>
              <span data-content lang="en"><RichInline text={o.text} /></span>
            </li>
          ))}</ol>
        )}
        <details className="mt-8 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
          <summary className="cursor-pointer text-xl font-semibold text-emerald-900">{t("Show the answer")}</summary>
          <p className="mt-3 text-2xl font-bold text-emerald-900" data-content lang="en">{q.correctAnswer}</p>
          {q.why && <p className="mt-2 text-lg text-slate-800" data-content lang="en"><RichInline text={q.why} /></p>}
        </details>
      </div>
    </AppShell>
  );
}
