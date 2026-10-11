import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolTierSummary } from "@/server/tiers/views";

export const metadata = { title: "Support tiers" };

/** 🧭 School view of the support tiers: per grade, against the usual 80 / 15 / 5. */
export default async function AdminTiersPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sum = await schoolTierSummary(repo, actor);
  const pct = (n: number, t: number) => (t ? Math.round((100 * n) / t) : 0);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🧭" title="Support tiers"
        subtitle={`Tier 1 core · Tier 2 targeted · Tier 3 intensive, set every day by the rules (teachers can override). A healthy school has about ${sum.expected[1]}% / ${sum.expected[2]}% / ${sum.expected[3]}%: far more in Tiers 2–3 points to core teaching, not single students.`} />
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Support tiers per grade</caption>
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th scope="col" className="p-3">Grade</th><th scope="col" className="p-3">Students</th><th scope="col" className="p-3">Tier 1</th><th scope="col" className="p-3">Tier 2</th><th scope="col" className="p-3">Tier 3</th><th scope="col" className="p-3">Set by teachers</th><th scope="col" className="p-3">Overdue checks</th><th scope="col" className="p-3">Referrals</th></tr></thead>
          <tbody>{sum.grades.map((g) => (
            <tr key={g.grade} className="border-t border-slate-100 tabular-nums">
              <th scope="row" className="p-3 text-left">Grade {g.grade}</th><td className="p-3">{g.students}</td>
              {([1, 2, 3] as const).map((t) => <td key={t} className={`p-3 ${t > 1 && pct(g.counts[t], g.students) > sum.expected[t] + 5 ? "font-bold text-red-700" : ""}`}>{g.counts[t]} ({pct(g.counts[t], g.students)}%)</td>)}
              <td className="p-3">{g.locked}</td><td className={`p-3 ${g.overdue ? "text-red-700" : ""}`}>{g.overdue}</td><td className="p-3">{g.refer}</td>
            </tr>
          ))}
          {!sum.grades.length && <tr><td colSpan={8} className="p-4 text-slate-600">No students yet.</td></tr>}</tbody>
        </table>
      </div>
    </AppShell>
  );
}
