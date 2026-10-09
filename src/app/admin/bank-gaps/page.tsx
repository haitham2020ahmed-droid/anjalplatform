import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { bankGaps } from "@/server/map/bank-gaps";

export const metadata = { title: "Question bank gaps" };
const STATUS = { GAP: ["🔴 No questions", "bg-red-100 text-red-900"], LOW: ["🟠 Too few", "bg-amber-100 text-amber-900"], OK: ["🟢 OK", "bg-emerald-100 text-emerald-900"] } as const;

/** 🕳 Where to write questions first: questions per MAP goal area against the students who need it. */
export default async function BankGapsPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const rows = await bankGaps(repo, actor);
  const grades = [...new Set(rows.map((r) => r.grade))];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="🕳" title="Question Bank Gaps"
        subtitle="For each grade and MAP goal area: the published questions on its skills, and how many students have it as their weakest area. 🔴 and 🟠 first: that is where new questions help most (aim for 5+ questions per student who needs the area).">
        <Link href="/admin/questions/new" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">➕ New question</Link>
        <Link href="/admin/questions/import?to=curriculum" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">📥 Import questions</Link>
        <Link href="/admin/item-quality" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">🔬 Question quality</Link>
      </PageHeader>
      {grades.map((g) => (
        <section key={g} className="mb-6 overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <h2 className="border-b px-4 py-3 text-lg font-bold text-brand-navy">Grade {g}</h2>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="p-3">MAP goal area</th><th className="p-3">Subject</th><th className="p-3">Skills</th><th className="p-3">Questions</th><th className="p-3">Students (weakest area)</th><th className="p-3">Per student</th><th className="p-3">Status</th></tr></thead>
            <tbody>{rows.filter((r) => r.grade === g).map((r) => (
              <tr key={r.area} className="border-b last:border-0"><td className="p-3 font-medium">{r.area}</td><td className="p-3">{r.subject}</td><td className="p-3 tabular-nums">{r.skills}</td><td className="p-3 tabular-nums">{r.questions}</td><td className="p-3 tabular-nums">{r.studentsWeakest}</td><td className="p-3 tabular-nums">{r.perStudent ?? "—"}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td></tr>
            ))}</tbody>
          </table>
        </section>
      ))}
    </AppShell>
  );
}
