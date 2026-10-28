import { AppShell } from "@/components/app-shell";
import { AtAGlance, ReportHeader, ReportIntro, EmptyState, type Glance } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { teacherHomeSummary } from "@/server/teacher/needs-attention";
import { accessibleClasses } from "@/server/teacher/assign";
import { NeedsAttentionList } from "@/components/teacher/needs-attention-list";

export const metadata = { title: "Needs attention" };

type SP = { classId?: string };

/**
 * 🆕 r94 (needs-attention/class-snapshot fix follow-up, Oct 2026): a real, dedicated "Needs attention" report —
 * this used to exist ONLY embedded in the teacher Home page, so every cross-page link to it (report-bar.tsx, the
 * Reports hub, Class snapshot, favourited reports) sent teachers to Home instead of a report they could filter and
 * switch class on. Reuses teacherHomeSummary() exactly as Home does (no duplicated logic) and filters its `.list`
 * by classId here, so the shared class switcher (report-bar.tsx, via this page's ReportDef) actually filters
 * something. Teacher: their own classes. Admin: every class in the school (teacherHomeSummary/accessibleClasses
 * already allow both roles).
 */
export default async function NeedsAttentionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;

  const [sum, classes] = await Promise.all([teacherHomeSummary(repo, actor), accessibleClasses(repo, actor)]);
  const classId = sp.classId && classes.some((c) => c.id === sp.classId) ? sp.classId : null;
  const klass = classId ? classes.find((c) => c.id === classId) : null;
  const list = classId ? sum.list.filter((r) => r.classId === classId) : sum.list;
  const gradeOf = new Map<string, number>(); // class names are shown as-is here; Home's grade labels need class metadata not fetched for every school class

  const glance: Glance[] = [
    { label: "Needs attention", value: list.length, icon: "🔴", tone: list.length ? "warn" : "good", meaning: t("No practice for 7 days or more · stuck on a skill (15+ questions and a score under 50).") },
  ];

  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🔴" title="Needs attention"
        who={klass ? <bdi>{String(klass.name)}</bdi> : classes.length > 1 ? t("All classes") : undefined}
        subtitle="No practice for 7 days or more, stuck on a skill, or flagged by ReadRise / Learn — who needs you now." />
      <ReportIntro text="No practice for 7 days or more · stuck on a skill · ◐ no progress for 7 days · 50 questions without mastery · new 🔄." />
      <AtAGlance items={glance} title={null} />
      {list.length === 0 ? (
        <EmptyState icon="✅" title="Everyone is on track." />
      ) : (
        <div className="mt-4 rounded-xl bg-surface shadow-card ring-1 ring-line">
          <NeedsAttentionList list={list} gradeOf={gradeOf} />
        </div>
      )}
    </AppShell>
  );
}
