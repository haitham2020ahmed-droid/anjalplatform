import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StudentList } from "@/components/teacher/student-list";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { myStudentsList } from "@/server/insights/student-file";
import { teacherClasses } from "@/server/teacher/queries";
import { needsHelpCounts } from "@/server/teacher/repeated-mistakes";

export const metadata = { title: "My Students" };

/**
 * 👥 My Students (Find a Student and My Classes merged): every student of the teacher's classes (admin: the school),
 * grouped by class, ready without typing; the box filters instantly. A name opens the student's file. Each class keeps
 * its class page, dashboard and levels; Who Needs Help, Alerts and Class Insights are one tap away.
 * Access: myStudentsList checks it on the server (own classes only for teachers).
 */
export default async function MyStudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const q = String((await searchParams).q ?? "").slice(0, 80);
  const [list, meta, help] = await Promise.all([myStudentsList(repo, actor), teacherClasses(repo, actor).catch(() => []), needsHelpCounts(repo, actor).catch(() => ({}))]);
  const alerts = new Map(meta.map((c) => [c.classId, c.openAlerts]));
  const classes = list.map((c) => ({ ...c, alerts: alerts.get(c.classId) ?? 0 }));
  const more = "inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader icon="👥" title="My Students"
        subtitle={actor.role === "TEACHER" ? t("Every student of your classes. Type to find one; tap a name to open the file.") : t("Every student of the school. Type to find one; tap a name to open the file.")}>
        <Link prefetch={false} href="/teacher/intervention" className={more}>{t("Who Needs Help")}</Link>
        <Link prefetch={false} href="/teacher/reports#needs-help" className={more}>🧡 {t("Needs help")}</Link>
        <Link prefetch={false} href="/teacher/alerts" className={more}>{t("Alerts")}</Link>
        <Link prefetch={false} href="/teacher/ai" className={more}>{t("Class Insights")}</Link>
      </PageHeader>
      <StudentList classes={classes} initialQuery={q} manage help={help} />
    </AppShell>
  );
}
