import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherClasses } from "@/server/teacher/queries";

export default async function TeacherHome() {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const classes = await teacherClasses(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-navy">My classes</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <a href="/teacher/curriculum" className="rounded-lg px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-amber-300 hover:bg-amber-50">⭐ Curriculum &amp; assign skills</a>
          <a href="/admin/questions?status=PUBLISHED" className="rounded-lg px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-amber-300 hover:bg-amber-50">⭐ Questions: search &amp; assign</a>
          <a href="/teacher/assignments" className="rounded-lg px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Weekly assignments</a>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/admin/questions?status=DRAFT&ai=1" className="rounded-xl bg-amber-100 px-4 py-2 font-semibold text-amber-900">Review AI questions</a>
          <a href="/admin/questions?status=DRAFT&mine=1" className="rounded-xl px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">My questions</a>
        </div>
      </div>
      {classes.length === 0 ? <p className="mt-4 text-slate-600">You are not assigned to any classes yet. Ask your school admin to add you to a class.</p> : (
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {classes.map((c) => (
            <li key={c.classId}>
              <a href={`/teacher/classes/${c.classId}`} className="block rounded-2xl bg-white p-5 ring-1 ring-slate-200 hover:ring-brand-teal">
                <span className="text-sm text-slate-500">Grade {c.grade}</span>
                <span className="block text-2xl font-bold text-brand-navy">{c.name}</span>
                <span className="mt-2 block text-slate-700">{c.students} students</span>
                {c.openAlerts > 0 && <span className="mt-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-900">{c.openAlerts} {c.openAlerts === 1 ? "student alert" : "student alerts"}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
