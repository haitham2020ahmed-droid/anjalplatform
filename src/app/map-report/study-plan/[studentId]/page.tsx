import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AutoPrint } from "@/components/plans/auto-print";
import { StudyPlanView, type PlanStarAssign } from "@/components/map/study-plan-view";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { StudentStarsPanel } from "@/components/skills/student-stars-panel";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studyPlan } from "@/server/map/map-reports";
import { endOfSchoolWeek, starredSkills } from "@/server/assign/star";
import { studentStarsSummary } from "@/server/skills/student-stars";
import { safeIfBehind } from "@/server/db/schema-errors";
import { planStarCount } from "@/lib/plan-groups";
import { getT } from "@/i18n/server";
import { ReportIntro, ReportSummary } from "@/components/report-kit";
import { studyPlanSummary } from "@/lib/report-summaries";

export const metadata = { title: "Personal Study Plan" };

/**
 * 🧭 One student's Personal Study Plan (staff, the student, their parent once shared), grouped by skill with the ONE
 * skill status (⭐). The student also sees "8 of 20 skills mastered", their weekly goal and a new star's celebration;
 * the class teacher keeps the ☆ quick-assign beside each skill.
 */
export default async function StudyPlanPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ subject?: string; full?: string; print?: string }> }) {
  const actor = await requireActor();
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const sp = await searchParams;
  const subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const { t } = await getT();
  let d;
  try { d = await studyPlan(repo, actor, studentId, subject, { full: sp.full === "1" }); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const back = actor.role === "STUDENT" ? { href: "/student/map", label: "My MAP" } : actor.role === "PARENT" ? { href: "/parent", label: "Back" } : { href: d.student.classId ? `/teacher/map-reports?classId=${d.student.classId}` : "/teacher/map-reports", label: "MAP Reports" };
  // ☆ quick-assign for the class teacher: the skills already assigned to the class (one read)
  let star: PlanStarAssign | undefined;
  if (actor.role === "TEACHER" && d.student.classId) {
    const ids = [...new Set(d.areas.flatMap((a) => a.stages.flatMap((st) => st.topics.flatMap((x) => x.statements.flatMap((y) => y.skills.map((k) => k.id))))))];
    star = { classId: d.student.classId, assigned: Object.fromEntries(await starredSkills(repo, d.student.classId, ids)), defaultDue: endOfSchoolWeek(new Date()), track: "MAP" };
  }
  const mine = actor.role === "STUDENT" ? await safeIfBehind("plan.stars", () => studentStarsSummary(repo, studentId), null) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={back} base={`/map-report/study-plan/${studentId}`} subject={subject} full={d.full} />
      {mine && <div className="mx-auto max-w-4xl print:hidden"><StudentStarsPanel s={mine} t={t} back={`/map-report/study-plan/${studentId}`} count={d.counts ?? planStarCount(d.areas)} /></div>}
      <div className="mx-auto max-w-4xl"><ReportIntro text="The skills to practise next, by goal area, and how many are already mastered." /></div>
      <StudyPlanView d={d} link={actor.role === "STUDENT"} hub={["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(actor.role)} t={t} star={star} />
      <div className="mx-auto max-w-4xl"><ReportSummary summary={studyPlanSummary({ ...d, counts: d.counts ?? planStarCount(d.areas) }, actor.role === "STUDENT" ? "student" : actor.role === "PARENT" ? "parent" : "staff")} /></div>
      {sp.print === "1" && <AutoPrint />}
    </AppShell>
  );
}
