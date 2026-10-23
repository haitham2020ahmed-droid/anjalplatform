import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { weakSkillOverlap } from "@/server/admin/skill-overlap";

export const metadata = { title: "Skill Overlap" };

/**
 * 👥 School-wide weak-skill-overlap report (admin only): skills that are weak in two or more classes at once — a
 * pattern worth a dean/supervisor coordinating a shared intervention for, rather than each teacher reteaching it
 * separately. "Weak for a class" is the Skills Grid's own rule: fewer than half the class has mastered it.
 */
export default async function SkillOverlapPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "analytics:school" });
  const me = (await getActor())!.user;
  const rows = await weakSkillOverlap(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Administration" }} icon="🔗" title="Skill Overlap Across Classes"
        subtitle="Skills weak in two or more classes at once (fewer than half the class has mastered it — the same rule as the Skills Grid). A pattern worth coordinating one shared intervention for, rather than each teacher reteaching it on their own." />
      {!rows.length ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No skill is weak in 2 or more classes right now.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="font-semibold text-brand-navy">{r.name} <span className="text-sm font-normal text-slate-500">· {r.classes.length} classes affected</span></p>
              <div className="mt-2 overflow-x-auto rounded-xl ring-1 ring-slate-100">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="p-2">Class</th>
                      <th className="p-2">Teacher</th>
                      <th className="p-2">Students weak</th>
                      <th className="p-2">Of</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.classes.map((c) => (
                      <tr key={c.classId} className="border-b last:border-0">
                        <td className="p-2">{c.className}</td>
                        <td className="p-2">{c.teacherName}</td>
                        <td className="p-2 tabular-nums font-semibold text-red-800">{c.weakStudents}</td>
                        <td className="p-2 tabular-nums">{c.totalStudents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
