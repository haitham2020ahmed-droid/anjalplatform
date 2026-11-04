import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { assertClassAccess } from "@/server/teacher/assignments";
import { accessibleClasses } from "@/server/teacher/assign";
import { AssignmentForm } from "./assignment-form";
import { skillPickerList } from "@/server/skills/picker";

export default async function NewAssignmentPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const { classId } = await searchParams;
  const me = (await getActor())!.user;
  const klass = await assertClassAccess(repo, actor, String(classId ?? ""));
  // r91: every class this teacher can write to, so they can assign to several at once in one go
  const classes = (await accessibleClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) }));
  const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
  const units = (await repo.findMany("Unit", { curriculumId: cur.id })).sort((a, b) => Number(a.number) - Number(b.number));
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const skills = await skillPickerList(repo, actor, { preferGrade: grade });   // 🧩 the one picker list (every skill)
  return (
    <AppShell name={String(me.displayName)}>
      <Link href={`/teacher/classes/${String(klass.id)}`} className="text-sm font-medium text-brand-teal hover:underline">Back to class</Link>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">New assignment for {String(klass.name)}</h1>
      <AssignmentForm classId={String(klass.id)} classes={classes} units={units.map((u) => ({ id: String(u.id), label: `Unit ${String(u.number)}` }))} skills={skills.map((k) => ({ id: k.id, name: k.name, names: k.names, tab: k.tab, questions: k.questions }))} />
    </AppShell>
  );
}
