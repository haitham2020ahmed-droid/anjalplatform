import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AutoPrint } from "@/components/plans/auto-print";
import { FamilyView } from "@/components/map/family-view";
import { FamilyNoteEditor } from "@/components/map/family-note-editor";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { familyNextSkills, familyReport } from "@/server/map/map-reports";
import { ReportIntro } from "@/components/report-kit";
import { mapFamilySummary } from "@/lib/report-summaries";

export const metadata = { title: "Family Report" };

/** 👪 One student's Family Report (staff, the student, their parent once shared). Staff may edit a note for the
 *  family before sending it (the Reports hub's "Send to family" shares it with the parent, per student or by class). */
export default async function FamilyReportPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ print?: string; msg?: string }> }) {
  const actor = await requireActor();
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const sp = await searchParams;
  let d;
  try { d = await familyReport(repo, actor, studentId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  // 🧭 the print-visible "What to practise next" list (never fails the page: an empty list shows a fallback line)
  const highlights = await familyNextSkills(repo, actor, studentId, d.subjects.map((x) => x.subject), { student: d.student }).catch(() => []);
  const back =actor.role === "STUDENT" ? { href: "/student/map", label: "My MAP" } : actor.role === "PARENT" ? { href: "/parent", label: "Back" } : { href: d.student.classId ? `/teacher/map-reports?classId=${d.student.classId}` : "/teacher/map-reports", label: "MAP Reports" };
  const canEdit = actor.role === "TEACHER" || actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={back} base={`/map-report/family/${studentId}`} />
      <div className="mx-auto max-w-4xl"><ReportIntro text="How your child is doing in English: the MAP Growth scores and the practice on the platform." /></div>
      {canEdit && <FamilyNoteEditor studentId={studentId} name={d.student.first} note={d.note} msg={sp.msg} />}
      <FamilyView d={d} summary={mapFamilySummary(d)} highlights={highlights} />
      {sp.print === "1" && <AutoPrint />}
    </AppShell>
  );
}
