import { AppShell } from "@/components/app-shell";
import { ReportHeader, ReportSection } from "@/components/report-kit";
import { RepeatedMistakes } from "@/components/teacher/repeated-mistakes";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { repeatedMistakes } from "@/server/teacher/repeated-mistakes";
import { AssignSkillHost } from "../../assign-dialog";

export const metadata = { title: "Needs help" };

/**
 * 🧡 Needs help (Reports · Skills): the skills where a student of the class answered the same question wrong twice,
 * with Assign for the teacher. The class comes from the report bar's class switcher. Own / readable classes only.
 */
export default async function NeedsHelpReport({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const teacher = actor.role === "TEACHER";
  const rows = klass ? await repeatedMistakes(repo, actor, { classId: klass.id }).catch(() => []) : [];
  const ids = teacher && klass && rows.length ? await classMembers(repo, klass.id) : [];
  const names = ids.length ? await studentNames(repo, ids) : new Map<string, { name: string }>();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} title="Needs help" who={klass ? <bdi>{klass.name}</bdi> : undefined}
        subtitle="Skills where a student answered the same question wrong twice." />
      <ReportSection title="Needs help">
        <RepeatedMistakes rows={rows} canAssign={teacher} />
      </ReportSection>
      {teacher && klass && rows.length > 0 && <AssignSkillHost classId={klass.id} className={klass.name} students={ids.map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name))} />}
    </AppShell>
  );
}
