import type { TFn } from "@/i18n";
import Link from "next/link";
import { Section } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { BTN_MAIN, BTN_SOFT, PlanBuilder, WhoPicker } from "@/components/plans/plan-builder";
import { StudentPlanPreview } from "@/components/plans/student-preview";
import { repo } from "@/server/auth/next";
import { can, ForbiddenError, type Actor } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { plansWizardContext, searchSkillsAnyGrade, skillsByIds, type WizardContext } from "@/server/plans/wizard";
import { suggestMapPlan, type MapSuggestion } from "@/server/plans/map-suggest";
import { fromSearchParams, readPlanForm, readQuestionPicks } from "@/server/plans/plan-form";
import { applyEdits } from "@/server/plans/send";
import type { Subject } from "@/server/map/map-plan";
import { mapDraftsForClass, type MapDraft } from "@/server/plans/map-drafts";
import { dismissMapDraftAction, sendMapDraftAction, sendMapPlanAction } from "./actions";

type SP = Record<string, string | string[] | undefined>;

/**
 * Make a MAP plan: who (student / group / class) and the subject → the platform suggests skills from each
 * student's LOWEST sub-areas → the teacher removes / adds skills → Preview as the student sees it → Send (MAP).
 */
export async function PlanTab({ actor, t, sp, classId, subject }: { actor: Actor; t: TFn; sp: SP; classId: string; subject: Subject }) {
  // own classes only (a coordinator who only reads this class gets the empty state)
  let ctx: WizardContext | null = null;
  try { ctx = await plansWizardContext(repo, actor, classId || null); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; try { ctx = await plansWizardContext(repo, actor); } catch (e2) { if (!(e2 instanceof ForbiddenError)) throw e2; } }
  const klass = ctx?.klass ?? null;
  if (!ctx || !klass) return <EmptyState icon="👥" title="Only the class teacher can make plans" text="You can see this class's results and reports." />;
  const { get, getAll } = fromSearchParams({ ...sp, classId: klass.id });
  const form = readPlanForm(get, getAll, [subject]);
  const carry: [string, string][] = [["tab", "plan"], ["classId", klass.id], ["subject", subject], ["who", form.who], ...form.studentIds.map((id) => ["sid", id] as [string, string])];
  const needsStudents = form.who !== "class" && !form.studentIds.length;
  let sug: MapSuggestion | null = null;
  let error: string | null = null;
  if (!needsStudents) {
    try { sug = await suggestMapPlan(repo, actor, { classId: klass.id, studentIds: form.studentIds, subject }); }
    catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; error = e.message; }
  }
  const [added, results] = await Promise.all([
    form.add.length ? skillsByIds(repo, actor, form.add) : Promise.resolve([]),
    form.q && sug ? searchSkillsAnyGrade(repo, actor, form.q) : Promise.resolve([]),
  ]);
  const plan = sug ? applyEdits(sug.skills, form.keep, added, sug.students.map((s) => s.id)) : [];
  const picks = readQuestionPicks(get, plan.map((k) => k.id));
  const subjectChip = (v: Subject, label: string) => (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 font-semibold ring-1 ring-slate-300 has-[:checked]:bg-brand-navy has-[:checked]:text-white">
      <input type="radio" name="subject" value={v} defaultChecked={subject === v} className="sr-only" />{label}
    </label>
  );
  let drafts: MapDraft[] = [];
  try { drafts = await mapDraftsForClass(repo, actor, klass.id); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  const draftId = typeof sp.draft === "string" ? sp.draft : "";
  return (
    <div className="space-y-5">
    {drafts.length > 0 && <DraftsReview t={t} drafts={drafts} classId={klass.id} className={klass.name} subject={subject} open={draftId} />}
    <form method="get" action="/teacher/map-center" className="space-y-5">
      <input type="hidden" name="tab" value="plan" />
      <input type="hidden" name="classId" value={klass.id} />
      <WhoPicker t={t} classes={ctx.classes.map((c) => ({ id: c.id, name: c.name }))} classId={klass.id} classHref={(id) => `/teacher/map-center?${new URLSearchParams({ tab: "plan", classId: id, subject })}`}
        students={klass.students} form={form} suggested={Boolean(sug)}>
        <fieldset><legend className="mb-2 text-sm font-semibold text-slate-700">{t("MAP test")}</legend>
          <div className="flex flex-wrap gap-2">{subjectChip("READING", t("Reading"))}{subjectChip("LANGUAGE", t("Language Usage"))}</div>
        </fieldset>
      </WhoPicker>
      {needsStudents && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(form.who === "student" ? "Tick the student in step 1." : "Tick the students of the group in step 1.")}</p>}
      {error && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(error)}</p>}
      {sug && sug.rows.length === 0 && !added.length ? (
        <EmptyState icon="🗺️" title="No MAP scores yet" text="Enter the MAP scores first: the plan is suggested from each student's lowest sub-areas." action={{ href: "/teacher/map-rit", label: "Enter scores" }} />
      ) : sug && (
        <>
          {form.step === "edit" && sug.rows.length > 0 && (
            <Section title="Lowest sub-areas" icon="🎯" hint={t("The suggested skills come from these sub-areas.")}>
              <ul className="grid gap-2 md:grid-cols-2">
                {sug.rows.slice(0, 40).map((r) => <li key={r.studentId} className="rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200"><b className="text-brand-navy"><bdi>{r.name}</bdi></b> <span className="text-slate-500">· RIT {r.rit ?? "—"}</span><br />{r.areas.map((a) => `${a.name}${a.rit !== null ? ` (${a.rit})` : ""}`).join(" · ") || "—"}</li>)}
              </ul>
            </Section>
          )}
          <PlanBuilder t={t} path="/teacher/map-center" carry={carry} form={form} program="MAP" className={klass.name} students={sug.students}
            suggested={sug.skills} plan={plan} picks={picks} results={results} defaultTitle={`${t("MAP Plan")} · ${klass.name}`}
            notes={sug.noScores.length ? [t("No MAP scores yet for: {names}.", { names: sug.noScores.join(", ") })] : []}
            send={sendMapPlanAction} canSend={can(actor, "assignments:create")}
            empty={{ title: "Nothing to suggest yet", text: "Search below and tick the skills you want." }} />
        </>
      )}
    </form>
    </div>
  );
}

/**
 * The MAP plan drafts made when the scores were imported, so nothing is lost: each one → Preview (as the student
 * will see it) → Send, or Dismiss. Nothing is sent until the teacher presses Send.
 */
function DraftsReview({ t, drafts, classId, className, subject, open }: { t: TFn; drafts: MapDraft[]; classId: string; className: string; subject: Subject; open: string }) {
  const href = (id: string) => `/teacher/map-center?${new URLSearchParams({ tab: "plan", classId, subject, ...(id ? { draft: id } : {}) })}`;
  const subjectName = (v: Subject) => t(v === "LANGUAGE" ? "Language Usage" : "Reading");
  const hidden = (d: MapDraft) => <><input type="hidden" name="planId" value={d.id} /><input type="hidden" name="classId" value={classId} /><input type="hidden" name="subject" value={subject} /></>;
  return (
    <Section title="Drafts ready to review" icon="📝" hint={t("MAP plan drafts made when the scores were imported. Nothing is sent until you press Send.")}>
      <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200" data-testid="map-drafts">
        {drafts.map((d) => (
          <li key={d.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-brand-navy"><bdi>{d.studentName}</bdi></span>
              <span className="text-sm text-slate-600">{subjectName(d.subject)} · {d.term} · {d.areas.map((a) => a.name).join(", ") || "—"}</span>
              <span className="ms-auto flex flex-wrap gap-2">
                {open === d.id ? <Link href={href("")} className={BTN_SOFT}>{t("Close")}</Link> : <Link href={href(d.id)} className={BTN_SOFT}>{t("Preview")}</Link>}
                <form action={dismissMapDraftAction}>{hidden(d)}<button className={BTN_SOFT}>{t("Dismiss")}</button></form>
              </span>
            </div>
            {open === d.id && (
              <div className="mt-4 space-y-4">
                <StudentPlanPreview title={`${t("MAP Plan")} · ${subjectName(d.subject)}`} studentName={d.studentName} className={className} program="MAP"
                  skills={d.areas.map((a) => (a.skills.length ? `${a.name}: ${a.skills.join(", ")}` : a.name))} note={d.note} />
                <form action={sendMapDraftAction} className="flex justify-end">{hidden(d)}<button className={`${BTN_MAIN} px-8 text-lg`}>{t("Send")}</button></form>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
