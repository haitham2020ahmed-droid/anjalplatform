import type { TFn } from "@/i18n";
import Link from "next/link";
import { Section } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { BTN_MAIN, BTN_SOFT, PlanBuilder, WhoPicker } from "@/components/plans/plan-builder";
import { PendingButton } from "@/components/pending-button";
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
import { endOfSchoolWeek, starredSkills } from "@/server/assign/star";
import { dismissMapDraftAction, sendAllMapDraftsAction, sendMapDraftAction, sendMapPlanAction } from "./actions";

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
  const carry: [string, string][] = [["tab", "plan"], ["mode", "group"], ["classId", klass.id], ["subject", subject], ["who", form.who], ...form.studentIds.map((id) => ["sid", id] as [string, string])];
  // ⚡ r79: only the view on screen is computed — the individual drafts, or the group suggestion (before: the group
  // suggestion was made on every open, also when the individual plans were shown)
  let drafts: MapDraft[] = [];
  if (sp.mode !== "group") {
    try { drafts = await mapDraftsForClass(repo, actor, klass.id); }
    catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  }
  const subjDrafts = drafts.filter((d) => d.subject === subject);
  const mode = sp.mode === "group" || sp.mode === "individual" ? sp.mode : (subjDrafts.length ? "individual" : "group");
  const needsStudents = form.who !== "class" && !form.studentIds.length;
  let sug: MapSuggestion | null = null;
  let error: string | null = null;
  if (mode === "group" && !needsStudents) {
    try { sug = await suggestMapPlan(repo, actor, { classId: klass.id, studentIds: form.studentIds, subject }); }
    catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; error = e.message; }
  }
  const [added, results] = await Promise.all([
    form.add.length && mode === "group" ? skillsByIds(repo, actor, form.add) : Promise.resolve([]),
    form.q && sug ? searchSkillsAnyGrade(repo, actor, form.q) : Promise.resolve([]),
  ]);
  const plan = sug ? applyEdits(sug.skills, form.keep, added, sug.students.map((s) => s.id)) : [];
  // ☆ quick assign beside each suggested skill (the class teacher): which are already assigned to the class
  const star = sug && actor.role === "TEACHER" && form.step !== "preview" ? { classId: klass.id, assigned: Object.fromEntries(await starredSkills(repo, klass.id, sug.skills.map((k) => k.id))), defaultDue: endOfSchoolWeek(new Date()), track: "MAP" } : null;
  const picks = readQuestionPicks(get, plan.map((k) => k.id));
  const subjectChip = (v: Subject, label: string) => (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 font-semibold ring-1 ring-slate-300 has-[:checked]:bg-brand-navy has-[:checked]:text-white">
      <input type="radio" name="subject" value={v} defaultChecked={subject === v} className="sr-only" />{label}
    </label>
  );
  const modeHref = (m: string) => `/teacher/map-center?${new URLSearchParams({ tab: "plan", mode: m, classId: klass.id, subject })}`;
  const modeBtn = (m: string, icon: string, label: string, hint: string) => (
    <Link href={modeHref(m)} aria-current={mode === m ? "page" : undefined} className={`flex flex-1 items-start gap-3 rounded-2xl p-4 ring-2 ${mode === m ? "bg-emerald-50 ring-emerald-500" : "bg-white ring-slate-200 hover:ring-brand-teal"}`}>
      <span className="text-3xl" aria-hidden="true">{icon}</span>
      <span><b className="block text-lg text-brand-navy">{label}</b><span className="text-sm text-slate-600">{hint}</span></span>
    </Link>
  );
  return (
    <div className="space-y-5">
    <ol className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600" aria-label={t("Steps")}><li className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">1 · {t("Choose")}</li><li className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">2 · {t("Check (Preview)")}</li><li className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">3 · {t("Send")}</li></ol>
    <div className="flex flex-col gap-3 sm:flex-row">
      {modeBtn("individual", "🧑‍🎓", t("Individual plans"), t("One plan per student, made by the platform from each student's own MAP score. You check, then send."))}
      {modeBtn("group", "👥", t("Group plans"), t("One plan for a group or the whole class, from the lowest sub-areas. You check, then send."))}
    </div>
    {mode === "individual" ? (
      <IndividualPlans t={t} drafts={subjDrafts} classId={klass.id} className={klass.name} subject={subject} />
    ) : (
    <form method="get" action="/teacher/map-center" className="space-y-5">
      <input type="hidden" name="mode" value="group" />
      <input type="hidden" name="tab" value="plan" />
      <input type="hidden" name="classId" value={klass.id} />
      <WhoPicker t={t} classes={ctx.classes.map((c) => ({ id: c.id, name: c.name }))} classId={klass.id} classHref={(id) => `/teacher/map-center?${new URLSearchParams({ tab: "plan", mode: "group", classId: id, subject })}`}
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
            empty={{ title: "Nothing to suggest yet", text: "Search below and tick the skills you want." }} star={star} />
        </>
      )}
    </form>
    )}
    </div>
  );
}

/**
 * Individual plans: one per student, made automatically from the student's own MAP score (the drafts made when the
 * scores were imported). Each row: Send · Dismiss are always visible (no need to open Preview first); Preview opens
 * the full detail, with an "Example question" link per skill so the teacher can check the content before sending.
 * "Send all" sends every one. Nothing is sent until the teacher presses Send.
 */
function IndividualPlans({ t, drafts, classId, className, subject }: { t: TFn; drafts: MapDraft[]; classId: string; className: string; subject: Subject }) {
  const subjectName = (v: Subject) => t(v === "LANGUAGE" ? "Language Usage" : "Reading");
  const hidden = (id?: string) => <>{id && <input type="hidden" name="planId" value={id} />}<input type="hidden" name="classId" value={classId} /><input type="hidden" name="subject" value={subject} /></>;
  if (!drafts.length) return <EmptyState icon="🗺️" title="No individual plans to check" text="They are made automatically when MAP scores are entered or imported. You can also make a Group plan." action={{ href: "/teacher/map-rit", label: "Enter scores" }} />;
  return (
    <Section title="Individual plans" icon="🧑‍🎓" hint={t("{n} plan(s) ready, one per student. Send sends it now — open Preview first if you want to check what the student will get.", { n: drafts.length })}>
      <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200" data-testid="map-drafts">
        {drafts.map((d) => {
          const labels = d.areas.map((a) => (a.skills.length ? `${a.name}: ${a.skills.map((k) => k.name).join(", ")}` : a.name));
          const skillIds = d.areas.map((a) => a.skills[0]?.id ?? null);
          return (
            <li key={d.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-brand-navy"><bdi>{d.studentName}</bdi></span>
                <span className="flex flex-wrap gap-1">{d.areas.slice(0, 4).map((a) => <span key={a.name} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">{a.icon} {a.name}</span>)}</span>
                <div className="ms-auto flex flex-wrap items-center gap-2">
                  <form action={dismissMapDraftAction}>{hidden(d.id)}<button className="text-xs font-semibold text-slate-500 underline">{t("Dismiss")}</button></form>
                  <form action={sendMapDraftAction}>{hidden(d.id)}<PendingButton className={BTN_MAIN} label="Send to {name}" vars={{ name: d.studentName }} pendingLabel="Sending…" /></form>
                </div>
              </div>
              <details className="mt-2">
                <summary className={`${BTN_SOFT} inline-flex min-h-9 w-fit cursor-pointer list-none items-center`}>{t("Preview")}</summary>
                <div className="mt-4">
                  <StudentPlanPreview title={`${t("MAP Plan")} · ${subjectName(d.subject)}`} studentName={d.studentName} className={className} program="MAP"
                    skills={labels} skillIds={skillIds} note={d.note} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <form action={sendAllMapDraftsAction} className="mt-4 flex justify-end">{hidden()}<PendingButton className={`${BTN_MAIN} px-8 text-lg`} label="Send all {n} plans" vars={{ n: drafts.length }} pendingLabel="Sending…" /></form>
    </Section>
  );
}
