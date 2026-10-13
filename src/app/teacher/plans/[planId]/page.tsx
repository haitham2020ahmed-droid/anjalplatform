import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { AutoPrint } from "@/components/plans/auto-print";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { curriculumPlanGrid } from "@/server/curriculum-map/curriculum-plan";
import { CurriculumGrid } from "@/components/plans/curriculum-grid";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import { planEditorView, type PlanEditorView } from "@/server/plans/editor";
import { candidates, fullQuestion, mapLessonQuestions, mapLessons, questionLines, typeChoices, isPlanLevel, type QuestionLine } from "@/server/plans/question-pick";
import { searchSkillsAnyGrade } from "@/server/plans/wizard";
import { accessibleClasses } from "@/server/teacher/assign";
import {
  AddPanel, ChangesBox, DetailsForm, PlanStepper, PreviewStep, QuestionPanel, SectionCard, SendStep, StatusBanner, StudentsForm, WhyBox, type EditorStep,
} from "@/components/plans/editor-ui";

export const metadata = { title: "Plan" };

type SP = { msg?: string; print?: string; step?: string; add?: string; open?: string; q?: string; as?: string; level?: string; type?: string; text?: string };

/**
 * ✏️ One plan, fully editable before and after sending: 1 Who → 2 What (every part and every question: open, add,
 * remove, replace, reorder, count, level, lesson, students; goals, dates, note, name) → 3 Preview as student → 4 Send
 * (then Pause, Withdraw, Duplicate). The full curriculum plan keeps its own grid.
 */
export default async function PlanPage({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const planId = (await params).planId;
  const sp = await searchParams;
  const row = await repo.findUnique("SkillPlan", { id: planId });
  if (row && String(row.kind) === "CURRICULUM") {
    const g = await curriculumPlanGrid(repo, actor, planId);
    return (
      <AppShell name={String(me.displayName)}>
        <PageHeader back={{ href: "/teacher/plans", label: "Plans" }} icon="📘" title={g.title} subtitle={`${g.className} · ${t("{n} part(s)", { n: g.items.length })} · ${t("{n} student(s)", { n: g.students.length })} · ${t("{n} correct answers finish a part", { n: g.target })}`}><PrintButton /></PageHeader>
        {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">✅ {sp.msg}</p>}
        <CurriculumGrid g={g} canEdit />
      </AppShell>
    );
  }
  let v: PlanEditorView;
  try { v = await planEditorView(repo, actor, planId); }
  catch (e) {
    if (!(e instanceof ForbiddenError || e instanceof ValidationError)) throw e;
    return <AppShell name={String(me.displayName)}><EmptyState icon="🗂️" title="Plan not found" text={(e as Error).message} action={{ href: "/teacher/plans", label: "Plans" }} /></AppShell>;
  }
  const step: EditorStep = sp.step === "preview" || sp.step === "send" ? sp.step : "what";
  const canSend = can(actor, "assignments:create");
  const readOnly = !canSend || v.status === "WITHDRAWN";
  const schoolId = String(actor.schoolId ?? "");
  const section = sp.add ? v.sections.find((x) => x.key === sp.add && !x.auto) ?? null : null;
  const filters = { level: isPlanLevel(sp.level) ? sp.level : "", type: String(sp.type ?? ""), text: String(sp.text ?? "").trim().slice(0, 80) };
  const inPlan = v.sections.flatMap((x) => x.questionIds);
  const [types, open, results, lessons, bank, lines] = await Promise.all([
    step === "what" && !readOnly ? typeChoices(repo) : Promise.resolve([]),
    sp.open ? fullQuestion(repo, schoolId, sp.open) : Promise.resolve(null),
    step === "what" && sp.q && !readOnly ? searchSkillsAnyGrade(repo, actor, sp.q) : Promise.resolve([]),
    step === "what" && !readOnly ? mapLessons(repo, schoolId, v.grade) : Promise.resolve([]),
    section && !readOnly ? (async (): Promise<QuestionLine[]> => {
      const pool = section.placeCode ? mapLessonQuestions(repo, schoolId, section.placeCode).then((m) => m.questionIds) : Promise.resolve(undefined);
      const list = await candidates(repo, schoolId, section.placeCode ? null : section.skillId, { level: filters.level ? (filters.level as "ON") : null, strictLevel: Boolean(filters.level), type: filters.type || null, studentIds: section.students.map((s) => s.id), exclude: inPlan, pool: await pool });
      const ln = await questionLines(repo, list.slice(0, 300).map((q) => q.id));
      return list.slice(0, 300).map((q) => ln.get(q.id)!).filter((q) => q && (!filters.text || q.stem.toLowerCase().includes(filters.text.toLowerCase()))).slice(0, 30);
    })() : Promise.resolve([] as QuestionLine[]),
    step === "preview" ? questionLines(repo, inPlan) : Promise.resolve(new Map<string, QuestionLine>()),
  ]);
  const classes = step === "send" ? (await accessibleClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const closeHref = `/teacher/plans/${v.id}?${new URLSearchParams([...(sp.add ? [["add", sp.add]] : []), ...(step !== "what" ? [["step", step]] : [])] as [string, string][])}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/plans", label: "Plans" }} icon="🗂️" title={v.title}
        subtitle={`${v.className} · ${t("Grade {n}", { n: v.grade })} · ${t("{n} student(s)", { n: v.planStudentIds.length })} · ${t("{n} part(s)", { n: v.sections.length })}${v.goals ? ` · 🎯 ${v.goals}` : ""}`}><PrintButton /></PageHeader>
      {sp.print === "1" && <AutoPrint />}
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg.startsWith("⚠️") ? "" : "✅ "}{sp.msg}</p>}
      <PlanStepper t={t} planId={v.id} step={step} />
      <StatusBanner t={t} v={v} />
      {open && <QuestionPanel t={t} q={open} closeHref={closeHref} />}
      {step === "what" && (
        <div className="space-y-5">
          <WhyBox t={t} v={v} />
          <StudentsForm t={t} v={v} readOnly={readOnly} />
          <section aria-label={t("2 · What")} className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200/70 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-navy"><span aria-hidden="true">✅</span>{t("2 · What")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("Every part of the plan and every question. Open a question to see it in full with its passage.")}</p>
            {v.sections.length === 0 ? <EmptyState compact icon="🔎" title="Nothing in the plan yet" text="Add a skill or a lesson of the Curriculum Map below." className="mt-3" /> : (
              <ol className="mt-4 space-y-4">
                {v.sections.map((x, i) => <SectionCard key={x.key} t={t} v={v} x={x} i={i} n={v.sections.length} readOnly={readOnly} addOpen={section?.key === x.key} bank={section?.key === x.key ? bank : undefined} types={types} filters={filters} />)}
              </ol>
            )}
          </section>
          {!readOnly && <AddPanel t={t} v={v} q={String(sp.q ?? "")} results={results.map((k) => ({ id: k.id, name: k.name, questions: k.questions }))} lessons={lessons} />}
          <ChangesBox t={t} v={v} />
          <div id="details"><DetailsForm t={t} v={v} readOnly={readOnly} /></div>
          <div className="flex justify-end"><a href={`/teacher/plans/${v.id}?step=preview`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-navy px-8 text-lg font-semibold text-white hover:bg-brand-purple">{t("Next: Preview")}</a></div>
        </div>
      )}
      {step === "preview" && <PreviewStep t={t} v={v} as={sp.as ?? null} lines={lines} />}
      {step === "send" && <SendStep t={t} v={v} canSend={canSend} classes={classes} />}
    </AppShell>
  );
}
