import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { assertClassAccess } from "@/server/teacher/assignments";
import { AssignmentForm } from "./assignment-form";
import { masterSkills } from "@/server/skills/master";

export default async function NewAssignmentPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const { classId } = await searchParams;
  const me = (await getActor())!.user;
  const klass = await assertClassAccess(repo, actor, String(classId ?? ""));
  const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
  const units = (await repo.findMany("Unit", { curriculumId: cur.id })).sort((a, b) => Number(a.number) - Number(b.number));
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const skills = await masterSkills(repo, String(actor.schoolId), { grade });   // 🧩 the master skills list
  return (
    <AppShell name={String(me.displayName)}>
      <Link href={`/teacher/classes/${String(klass.id)}`} className="text-sm font-medium text-brand-teal hover:underline">Back to class</Link>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">New assignment for {String(klass.name)}</h1>
      <AssignmentForm classId={String(klass.id)} units={units.map((u) => ({ id: String(u.id), label: `Unit ${String(u.number)}` }))} skills={skills.map((k) => ({ id: String(k.id), name: String(k.name) }))} />
    </AppShell>
  );
}
