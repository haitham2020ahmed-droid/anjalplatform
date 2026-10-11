import { AppShell } from "@/components/app-shell";
import { BandBar, Callout, ReportHeader, ReportSection, ReportTable } from "@/components/report-kit";
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
      <ReportHeader back={{ href: "/admin", label: "Home" }} icon="🧭" title="Support tiers" who="Whole school"
        subtitle={`Tier 1 core · Tier 2 targeted · Tier 3 intensive, set every day by the rules (teachers can override). A healthy school has about ${sum.expected[1]}% / ${sum.expected[2]}% / ${sum.expected[3]}%: far more in Tiers 2–3 points to core teaching, not single students.`} />
      {sum.grades.length > 0 && (
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <ReportSection title="Tiers by grade" icon="🪜" className="mb-0">
            <div className="space-y-4">{sum.grades.map((g) => <BandBar key={g.grade} label={`Grade ${g.grade}`} parts={[{ key: "T1", value: g.counts[1] }, { key: "T2", value: g.counts[2] }, { key: "T3", value: g.counts[3] }]} />)}</div>
          </ReportSection>
          <Callout kind="meaning" items={[
            `Expected: about ${sum.expected[1]}% Tier 1 · ${sum.expected[2]}% Tier 2 · ${sum.expected[3]}% Tier 3.`,
            ...sum.grades.filter((g) => pct(g.counts[2] + g.counts[3], g.students) > sum.expected[2] + sum.expected[3] + 10).map((g) => `Grade ${g.grade}: ${pct(g.counts[2] + g.counts[3], g.students)}% in Tiers 2–3 — strengthen core teaching for the whole grade.`),
            ...sum.grades.filter((g) => g.overdue).map((g) => `Grade ${g.grade}: ${g.overdue} progress checks overdue.`),
          ]} />
        </div>
      )}
      <ReportTable label="Support tiers per grade" empty="No students yet."
        cols={[{ key: "g", label: "Grade" }, { key: "s", label: "Students", num: true }, { key: "t1", label: "Tier 1", num: true }, { key: "t2", label: "Tier 2", num: true }, { key: "t3", label: "Tier 3", num: true }, { key: "l", label: "Set by teachers", num: true }, { key: "o", label: "Overdue checks", num: true }, { key: "r", label: "Referrals", num: true }]}
        rows={sum.grades.map((g) => ({
          id: String(g.grade), flag: g.overdue ? "warn" : undefined, sort: { g: g.grade, t1: g.counts[1], t2: g.counts[2], t3: g.counts[3] },
          cells: { g: `Grade ${g.grade}`, s: g.students,
            ...Object.fromEntries(([1, 2, 3] as const).map((t) => { const over = t > 1 && pct(g.counts[t], g.students) > sum.expected[t] + 5; return [`t${t}`, <span key={t} className={over ? "font-bold text-red-700" : ""}>{over ? "! " : ""}{g.counts[t]} ({pct(g.counts[t], g.students)}%)</span>]; })),
            l: g.locked, o: <span className={g.overdue ? "text-red-700" : ""}>{g.overdue}</span>, r: g.refer },
        }))} />
    </AppShell>
  );
}
