import Link from "next/link";
import { ReportProblem } from "@/components/questions/report-problem";
import { PrintToggle } from "@/components/print/print-toggle";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { ForbiddenError } from "@/server/auth/rbac";
import { LEVELS, previewWork, type PreviewView } from "@/server/teacher/preview";
import { getT } from "@/i18n/server";
import { StudentTestPreview } from "@/components/tests/student-test-preview";
import { assignedTestPreview, type AssignedTestPreview } from "@/server/student/preview-as";

export const metadata = { title: "Preview" };
const NAME = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" } as const;

/** 👀 What each level will see — switch Below / On / Above; print or save as PDF. */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ code?: string; skillId?: string; level?: string; key?: string; msg?: string; test?: string; assigned?: string; as?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  if (sp.assigned) {
    // 👀 an assigned test, exactly as the chosen student gets it (their version, order and choice order)
    let a: AssignedTestPreview | null = null, err: string | null = null;
    try { a = await assignedTestPreview(repo, actor, sp.assigned, sp.as); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) err = e.message; else throw e; }
    return (
      <AppShell name={String(me.displayName)}>
        <PageHeader back={{ href: `/teacher/assessments/${encodeURIComponent(sp.assigned)}`, label: "Test results" }} icon="👀" title={a ? t("Preview as student: {name}", { name: a.studentName }) : "Preview"} subtitle={a ? a.title : null}>{a && <PrintButton />}</PageHeader>
        {err && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{t(err)}</p>}
        {a && (
          <>
            <p role="status" className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200 print:hidden">{t("This is exactly what the student sees. Read only: nothing is answered, sent or saved.")}</p>
            {a.students.length > 1 && (
              <nav aria-label={t("See as")} className="mb-4 flex flex-wrap items-center gap-2 text-sm print:hidden">
                <span className="font-semibold text-slate-700">{t("See as")}</span>
                {a.students.slice(0, 60).map((st) => <Link key={st.id} href={`/teacher/preview?assigned=${encodeURIComponent(a!.testId)}&as=${st.id}`} aria-current={st.id === a!.studentId ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${st.id === a!.studentId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}><bdi>{st.name}</bdi></Link>)}
              </nav>
            )}
            <StudentTestPreview title={a.title} questions={a.questions} timeLimitMin={a.timeLimitMin} />
          </>
        )}
      </AppShell>
    );
  }
  let v: PreviewView | null = null, error: string | null = null;
  try { v = await previewWork(repo, actor, sp); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) error = e.message; else throw e; }
  const showKey = sp.key === "1";
  const q = (o: Record<string, string | undefined>) => `/teacher/preview?${new URLSearchParams(Object.entries({ code: sp.code, skillId: sp.skillId, test: sp.test, level: sp.level, key: sp.key, ...o }).filter(([, x]) => x) as [string, string][])}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: sp.test ? "/teacher/assessments/new" : actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="👀" title={v?.test ? t("Preview as student: {name}", { name: v.title }) : v ? `Preview: ${v.title}` : "Preview"} subtitle={v?.test ? t(v.subtitle) : v ? `${v.subtitle} · what students see, level by level` : null}>
        {v && <PrintButton />}
        {v?.assignHref && actor.role === "TEACHER" && <Link href={v.assignHref} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple print:hidden">⭐ Assign</Link>}
      </PageHeader>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}
      {sp.msg && <p role="status" className="mb-3 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{String(sp.msg).slice(0, 200)}</p>}
      {v?.test && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">✓ {t("This is the test as your students will see it. Go back to the test builder tab: Assign is now active.")}</p>}
      {v && (
        <>
          <nav aria-label="Level" className="flex flex-wrap items-center gap-2 print:hidden">
            {LEVELS.map((l) => <Link key={l} href={q({ level: l })} aria-current={v!.level === l ? "page" : undefined} className={`rounded-2xl px-5 py-2.5 font-bold ${v!.level === l ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}>{l === "BELOW" ? "🟠" : l === "ON" ? "🔵" : "🟢"} {NAME[l]} <span className="text-xs font-normal opacity-80">({v!.counts[l]})</span></Link>)}
            <Link href={q({ key: showKey ? "" : "1" })} className="ms-auto rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300">{showKey ? "🙈 Hide answers" : "🔑 Show answers"}</Link>
          </nav>
          {v.test && v.student && !showKey ? <div className="mt-5"><StudentTestPreview title={v.title} questions={v.student} /></div> : <>
          <h2 className="mt-5 hidden text-xl font-bold print:block">{NAME[v.level]}</h2>
          {!v.questions.length ? <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No questions at {NAME[v.level]} yet. Students placed here get the nearest level that has questions.</p> : (
            <ol className="mt-5 space-y-4">
              {v.questions.map((x, i) => (
                <li key={x.id} className="break-inside-avoid rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                  {x.passageText && <details className="mb-3 rounded-xl bg-slate-50 p-3 text-sm" open><summary className="cursor-pointer font-semibold text-brand-navy">📖 {x.passageTitle ?? "Passage"}</summary><p className="mt-2 whitespace-pre-line text-slate-700">{x.passageText}</p></details>}
                  <div className="flex items-start justify-between gap-2"><p className="text-lg font-medium text-slate-900"><span className="me-2 font-bold text-brand-navy">{i + 1}.</span>{x.stem}</p><PrintToggle id={x.id} stem={x.stem} /></div>
                  {x.options.length > 0 && <ul className="mt-2 grid gap-1 sm:grid-cols-2">{x.options.map((o) => <li key={o.label} className={`rounded-lg px-3 py-1.5 ring-1 ${showKey && o.correct ? "bg-emerald-50 font-semibold text-emerald-900 ring-emerald-300" : "ring-slate-200"}`}>{o.label}. {o.text}</li>)}</ul>}
                  {showKey && !x.options.length && x.answer && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900">Answer: {x.answer}</p>}
                  {/* 📝 Review & Send: change a question (it waits for the admin) or report a problem */}
                  <div className="mt-3 flex flex-wrap items-start gap-4 print:hidden">
                    <Link href={`/admin/questions/${x.id}`} prefetch={false} className="text-sm font-semibold text-brand-navy underline">✏️ Edit</Link>
                    <ReportProblem questionId={x.id} back={q({})} />
                  </div>
                </li>
              ))}
            </ol>
          )}
          {v.counts[v.level] > v.shown && <p className="mt-3 text-sm text-slate-500">Showing the first {v.shown} of {v.counts[v.level]}.</p>}
          </>}
        </>
      )}
    </AppShell>
  );
}
