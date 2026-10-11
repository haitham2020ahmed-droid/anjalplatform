import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { PlanBuilder, WhoPicker } from "@/components/plans/plan-builder";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { plansWizardContext, proposePlan, searchSkillsAnyGrade, skillsByIds, type WizardContext } from "@/server/plans/wizard";
import { fromSearchParams, readPlanForm, readQuestionPicks } from "@/server/plans/plan-form";
import { applyEdits, type PlanSkill } from "@/server/plans/send";
import { sendRtiPlanAction } from "./actions";

export const metadata = { title: "RTI plan" };

type SP = Record<string, string | string[] | undefined>;

/**
 * 🛟 RTI plan — the RTI plan only: the platform suggests each Tier 2 / Tier 3 student's focus skill (or weakest
 * skill) → the teacher decides (untick / add) → Preview as the student sees it → Send (RTI work).
 * The weekly groups sheet (lessons, minutes, checks, decisions) is one link away.
 */
export default async function RtiPlanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const { get, getAll } = fromSearchParams(sp);
  let ctx: WizardContext | null = null;
  try { ctx = await plansWizardContext(repo, actor, get("classId") || null); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; try { ctx = await plansWizardContext(repo, actor); } catch (e2) { if (!(e2 instanceof ForbiddenError)) throw e2; } }
  const klass = ctx?.klass ?? null;
  const form = readPlanForm((k) => (k === "classId" ? klass?.id ?? null : get(k)), getAll);
  const needsStudents = form.who !== "class" && !form.studentIds.length;
  let suggested: PlanSkill[] = [], students: { id: string; name: string }[] = [], notes: string[] = [];
  let error: string | null = null;
  if (klass && !needsStudents) {
    try {
      const p = await proposePlan(repo, actor, { classId: klass.id, studentIds: form.studentIds, type: "RTI" });
      suggested = p.skills.map((k) => ({ id: k.id, name: k.name, reason: k.reason, studentIds: k.studentIds, grade: k.grade, questions: k.questions }));
      students = p.students; notes = p.notes.filter((n) => form.who !== "class" || !n.startsWith("Not in RTI"));
    } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; error = e.message; }
  }
  const [added, results] = await Promise.all([
    klass && form.add.length ? skillsByIds(repo, actor, form.add) : Promise.resolve([]),
    klass && form.q ? searchSkillsAnyGrade(repo, actor, form.q) : Promise.resolve([]),
  ]);
  // students in RTI (Tier 2 / 3) are the plan's students; added skills go to them
  const inRti = students.filter((s) => suggested.some((k) => k.studentIds.includes(s.id)));
  const plan = applyEdits(suggested, form.keep, added, (inRti.length ? inRti : students).map((s) => s.id));
  const carry: [string, string][] = klass ? [["classId", klass.id], ["who", form.who], ...form.studentIds.map((id) => ["sid", id] as [string, string])] : [];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="🛟" title="RTI plan"
        subtitle={t("Practice for the students in RTI (Tier 2 and Tier 3): the platform suggests their focus skills, you decide, preview and send.")} />
      {get("msg") && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{get("msg")}</p>}
      {!ctx || !klass ? <EmptyState icon="👥" title="No classes yet" text="When the admin adds you to a class, you can make RTI plans here." /> : (
        <form method="get" action="/teacher/rti-plan" className="space-y-5">
          <input type="hidden" name="classId" value={klass.id} />
          <WhoPicker t={t} classes={ctx.classes.map((c) => ({ id: c.id, name: c.name }))} classId={klass.id} classHref={(id) => `/teacher/rti-plan?classId=${id}`} students={klass.students} form={form} suggested={!needsStudents} />
          {needsStudents && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(form.who === "student" ? "Tick the student in step 1." : "Tick the students of the group in step 1.")}</p>}
          {error && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(error)}</p>}
          {!needsStudents && !error && (
            <PlanBuilder t={t} path="/teacher/rti-plan" carry={carry} form={form} program="RTI" className={klass.name} students={inRti.length ? inRti : students}
              suggested={suggested} plan={plan} picks={readQuestionPicks(get, plan.map((k) => k.id))} results={results} notes={notes} defaultTitle={`${t("RTI Plan")} · ${klass.name}`}
              send={sendRtiPlanAction} canSend={can(actor, "assignments:create")}
              empty={{ title: "No student is in RTI right now", text: "Students in Tier 2 or Tier 3 appear here with their focus skill. You can still add skills below." }} />
          )}
          <p className="text-sm text-slate-600">{t("Weekly groups, lessons and progress checks:")} <Link href={`/teacher/rti-plan/weekly?classId=${klass.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-teal underline">{t("RTI weekly plan")}</Link> · <Link href="/teacher/tiers" className="inline-flex min-h-11 items-center font-semibold text-brand-teal underline">{t("Support Tiers")}</Link></p>
        </form>
      )}
    </AppShell>
  );
}
