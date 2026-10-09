import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { isReportShared } from "@/server/insights/parent-report";
import { shareManyAction } from "./actions";

export const metadata = { title: "Reports" };

/** 📄 Reports: parent reports (share when ready) and class exports. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const ids = klass ? await classMembers(repo, String(klass.id)) : [];
  const names = await studentNames(repo, ids);
  const rows = await Promise.all(ids.map(async (id) => ({ id, name: names.get(id)?.name ?? "Student", shared: await isReportShared(repo, String(actor.schoolId), id) })));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="📄" title="Reports" subtitle="Parent reports in simple English. Open one to check it, then share it when you are ready. Exports for the class are below." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/reports?classId=${c.id}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === klass?.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}</nav>
      {klass && (
        <>
          <form action={shareManyAction} className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <input type="hidden" name="classId" value={String(klass.id)} />
            <h2 className="text-lg font-bold text-brand-navy">👪 Parent reports · {String(klass.name)}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200">
                <label className="flex items-center gap-2"><input type="checkbox" name="student" value={r.id} /><span className="font-medium">{r.name}</span></label>
                <span className="flex items-center gap-2 text-sm">{r.shared ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Shared</span> : <span className="text-xs text-slate-500">Not shared</span>}<Link href={`/teacher/progress/${r.id}/report`} className="font-semibold text-brand-teal underline">Open</Link></span>
              </li>
            ))}</ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button name="op" value="all" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">👪 Share the whole class</button>
              <button name="op" value="share" className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">Share ticked reports</button>
              <button name="op" value="stop" className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300">Stop sharing ticked</button>
            </div>
          </form>
          <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-brand-navy">⬇️ Exports</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/api/progress-export?classId=${klass.id}&subject=READING`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📊 Students (Reading) · Excel</a>
              <a href={`/api/progress-export?classId=${klass.id}&subject=LANGUAGE`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📊 Students (Language) · Excel</a>
              <Link href={`/teacher/progress?classId=${klass.id}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🖨 Students dashboard · PDF</Link>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
