import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolTeachers } from "@/server/teacher/support";
import { transferClassAction } from "./actions";

export const metadata = { title: "Class Transfer" };

/** 🔁 Move a class to another teacher (a teacher leaves, a substitute comes): every piece of data stays with the class. */
export default async function ClassTransfer({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "classes:manage" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [classes, teachers] = await Promise.all([repo.findMany("Class", { schoolId: actor.schoolId, deletedAt: null }), schoolTeachers(repo, actor)]);
  const links = classes.length ? await repo.findMany("ClassTeacher", { classId: { in: classes.map((c) => c.id) } }) : [];
  const nameOf = (id: unknown) => teachers.find((t) => t.id === String(id))?.name ?? "—";
  const box = "rounded-lg border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🔁" title="Class Transfer" subtitle="Give a class to another teacher. Its students, assignments, plans, reports and history stay with the class; the new teacher is notified. Keep the old teacher as a co-teacher if you like." />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500"><th className="px-4 py-2.5">Class</th><th className="px-3">Teacher now</th><th className="px-3">Move to</th></tr></thead>
          <tbody>
            {classes.sort((a, b) => String(a.name).localeCompare(String(b.name))).map((c) => {
              const now = links.filter((l) => l.classId === c.id);
              return (
                <tr key={String(c.id)} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-semibold text-brand-navy">{String(c.name)}</td>
                  <td className="px-3 text-slate-700">{now.length ? now.map((l) => `${nameOf(l.teacherId)}${l.isLead ? "" : " (co)"}`).join(", ") : <span className="text-red-700">No teacher</span>}</td>
                  <td className="px-3 py-2">
                    <form action={transferClassAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="classId" value={String(c.id)} /><input type="hidden" name="className" value={String(c.name)} />
                      <select name="teacherId" required defaultValue="" className={box} aria-label={`New teacher of ${String(c.name)}`}><option value="" disabled>Choose a teacher…</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                      <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" name="keep" value="1" /> keep the old teacher</label>
                      <button className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-purple">Move</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
