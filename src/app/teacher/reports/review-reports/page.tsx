import { AppShell } from "@/components/app-shell";
import { ClassChips, Empty } from "@/components/reports/report-ui";
import { AtAGlance, ReportHeader, ReportIntro, ReportSection, ReportTable, type Glance, type Col, type RRow } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { reviewReports, type ReviewReportRow } from "@/server/skills/review-reports";

export const metadata = { title: "Review Reports" };

const day = (v: string | null) => (v ? v.slice(0, 10) : "—");
const STATUS_LABEL: Record<string, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETED: "Completed", OVERDUE: "Overdue" };

/**
 * 🆕 feature (Oct 2026): Reports → Review Reports — every Review the teacher has sent to the chosen class (Review
 * Builder / per-Text-Set Review ⭐ Assign sends; never a MAP/NAFS/adaptive-skill assignment, a Curriculum Map plan
 * place or a My Tests test): its sent/due dates, how many students are Not started / In progress / Completed /
 * Overdue, each student's accuracy and how many of the Review's questions they have answered so far (even while
 * still in progress), and that one Review's own per-skill breakdown. Deliberately separate from the Student Skills
 * report (skills-grid.ts), which excludes multi-skill assignments like a Review by design — see review-reports.ts.
 */
export default async function ReviewReportsPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const data = await reviewReports(repo, actor, sp.classId ?? null);
  const url = (classId: string) => `/teacher/reports/review-reports?classId=${classId}`;

  const countsGlance = (r: ReviewReportRow): Glance[] => [
    { icon: "🆕", label: "Not started", value: r.counts.NOT_STARTED },
    { icon: "✍️", label: "In progress", value: r.counts.IN_PROGRESS },
    { icon: "✅", label: "Completed", value: r.counts.COMPLETED, tone: r.counts.COMPLETED > 0 ? "good" : "neutral" },
    { icon: "⏰", label: "Overdue", value: r.counts.OVERDUE, tone: r.counts.OVERDUE > 0 ? "warn" : "neutral" },
  ];

  const studentCols: Col[] = [
    { key: "name", label: "Student" },
    { key: "status", label: "Status" },
    { key: "answered", label: "Answered", num: true },
    { key: "accuracy", label: "Accuracy", num: true },
  ];
  const studentRows = (r: ReviewReportRow): RRow[] => r.students.map((st) => ({
    id: st.studentId,
    cells: {
      name: <bdi>{st.name}</bdi>,
      status: t(STATUS_LABEL[st.status] ?? st.status),
      answered: <span dir="ltr">{st.answered} / {r.questions}</span>,
      accuracy: st.accuracy === null ? "—" : <span dir="ltr">{st.accuracy}%</span>,
    },
    sort: { status: st.status, answered: st.answered, accuracy: st.accuracy ?? -1 },
    flag: st.status === "OVERDUE" ? "warn" : undefined,
  }));

  const skillCols: Col[] = [
    { key: "name", label: "Skill" },
    { key: "questions", label: "Questions", num: true },
    { key: "answered", label: "Answered", num: true },
    { key: "accuracy", label: "Accuracy", num: true },
  ];
  const skillRows = (r: ReviewReportRow): RRow[] => r.skills.map((k) => ({
    id: k.skillId,
    cells: {
      name: <bdi>{k.name}</bdi>,
      questions: k.questions,
      answered: k.answered,
      accuracy: k.accuracy === null ? "—" : <span dir="ltr">{k.accuracy}%</span>,
    },
    sort: { accuracy: k.accuracy ?? -1 },
  }));

  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="📝" title="Review Reports"
        subtitle="Every Review you have sent to this class: who finished, who is overdue, each student's accuracy, and a per-skill breakdown of that one Review."
        who={data.className ? <bdi>{data.className}</bdi> : undefined}
        filters={<ClassChips classes={data.classes} current={data.classId} href={url} />} />
      <ReportIntro text="Reviews built from chosen questions (the Review Builder or a Text Set's Review), sent to this class — separate from the Student Skills grid, which only counts single-skill work." />
      {!data.classId ? <Empty>{t("You have no classes yet.")}</Empty> : !data.reviews.length ? <Empty>{t("No Review has been sent to this class yet.")}</Empty> : (
        <div className="space-y-5">
          {data.reviews.map((r) => (
            <ReportSection key={r.assignmentId} title={r.title} icon="📝"
              hint={t("Sent {sent} · Due {due} · {n} question(s)", { sent: day(r.createdAt), due: day(r.dueAt), n: r.questions })}>
              <AtAGlance items={countsGlance(r)} title={null} className="mb-4" />
              <ReportTable label={t("Students")} cols={studentCols} rows={studentRows(r)} empty="No student on this Review yet." />
              {r.skills.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("By skill (this Review only)")}</h3>
                  <ReportTable label={t("By skill")} cols={skillCols} rows={skillRows(r)} empty="No skill on these questions." />
                </div>
              )}
            </ReportSection>
          ))}
        </div>
      )}
    </AppShell>
  );
}
