import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherClasses } from "@/server/teacher/queries";

export const metadata = { title: "My classes" };

/** 👥 My classes: click a class to open its students. */
export default async function MyClassesPage() {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const classes = await teacherClasses(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="👥" title="My Classes" subtitle="Open a class to see its students, or go straight to the students dashboard." />
      {classes.length === 0 ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">You are not assigned to any classes yet. Ask your school admin to add you to a class.</p> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <li key={c.classId} className="lift rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">Grade {c.grade}</p>
              <p className="text-3xl font-extrabold text-brand-navy">{c.name}</p>
              <p className="mt-1 text-slate-700">{c.students} students{c.openAlerts > 0 ? ` · ${c.openAlerts} alert${c.openAlerts === 1 ? "" : "s"}` : ""}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
                <Link href={`/teacher/classes/${c.classId}`} className="rounded-xl bg-brand-navy px-3 py-2 text-white hover:bg-brand-purple">👥 Students</Link>
                <Link href={`/teacher/progress?classId=${c.classId}`} className="rounded-xl bg-white px-3 py-2 text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📈 Dashboard</Link>
                <Link href={`/teacher/levels?classId=${c.classId}`} className="rounded-xl bg-white px-3 py-2 text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🎯 Levels</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
