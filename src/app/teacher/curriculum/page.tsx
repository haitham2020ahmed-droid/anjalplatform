import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherCurriculum } from "@/server/teacher/assign";
import { AssignDialog } from "../assign-dialog";

/** Teacher's organized view: Grade → Unit → Skill → Standard for one class, with ⭐ Assign on every skill. */
export default async function TeacherCurriculumPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const view = await teacherCurriculum(repo, actor, (await searchParams).classId);
  const canAssign = actor.role === "TEACHER";
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/teacher" className="text-brand-teal hover:underline">← My classes</Link></p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-navy">Curriculum{view ? `: ${view.grade.name}` : ""}</h1>
        <Link href="/teacher/assignments" className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Weekly assignments</Link>
      </div>
      {!view ? <p className="mt-4 text-slate-600">You do not teach any class yet.</p> : (
        <>
          <nav aria-label="Classes" className="mt-4 flex flex-wrap gap-2">
            {view.classes.map((c) => (
              <Link key={c.id} href={`/teacher/curriculum?classId=${c.id}`} aria-current={c.id === view.classId ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === view.classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{c.name} · G{c.grade}</Link>
            ))}
          </nav>
          <p className="mt-2 text-sm text-slate-600">{view.students.length} students. Assigned skills appear on each student's home page.</p>
          {view.units.length === 0 && <p className="mt-4 text-slate-600">This grade has no units yet.</p>}
          {view.units.map((u) => (
            <section key={u.id} className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200" aria-labelledby={`u-${u.id}`}>
              <h2 id={`u-${u.id}`} className="text-lg font-bold text-brand-navy">Unit {u.number}: {u.title}</h2>
              {u.skills.length === 0 ? <p className="mt-2 text-sm text-slate-600">No skills in this unit.</p> : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {u.skills.map((k) => (
                    <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <div>
                        <p className="font-medium text-slate-900">{k.name}</p>
                        <p className="text-xs text-slate-500">{k.standards.join(", ") || "No standard"}{k.lessons.length ? ` · Lessons ${k.lessons.join(", ")}` : ""}{k.openAssignments ? ` · assigned (${k.openAssignments} open)` : ""}</p>
                      </div>
                      {canAssign && <AssignDialog classId={view.classId} className={view.classes.find((c) => c.id === view.classId)!.name} skill={k} students={view.students} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </AppShell>
  );
}
