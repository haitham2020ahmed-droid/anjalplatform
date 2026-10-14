import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { BankTabs } from "../questions/bank-tabs";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { bankGaps, levelGaps, MIN_PER_LEVEL, practiceGaps } from "@/server/map/bank-gaps";
import { LineIcon } from "@/components/ui/line-icon";

/** the displayed level words (the counts keep their Below / On / Above keys) */
const LEVEL_WORD = { Below: "Approaching", On: "Meeting", Above: "Exceeding" } as const;

export const metadata = { title: "Question bank gaps" };
const STATUS = { GAP: ["No questions", "bg-red-100 text-red-900"], LOW: ["Too few", "bg-amber-100 text-amber-900"], OK: ["OK", "bg-emerald-100 text-emerald-900"] } as const;

/** 🕳 Where to write questions first: questions per MAP goal area against the students who need it. */
export default async function BankGapsPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const [rows, gaps, lv] = await Promise.all([bankGaps(repo, actor), practiceGaps(repo, actor), levelGaps(repo, actor)]);
  const grades = [...new Set(rows.map((r) => r.grade))];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="grid" title="Question Bank Gaps"
        subtitle="For each grade and MAP goal area: the published questions on its skills, and how many students have it as their weakest area. “No questions” and “Too few” first: that is where new questions help most (aim for 5+ questions per student who needs the area).">
        <Link href="/admin/questions/new" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple"><LineIcon name="plus" className="me-1 inline-block h-4 w-4 align-[-3px]" />New question</Link>
        <Link href="/admin/questions/import?to=curriculum" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="inbox" className="me-1 inline-block h-4 w-4 align-[-3px]" />Import questions</Link>
        {can(actor, "questions:generate") && <Link href="/admin/question-bank/generate" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="sparkle" className="me-1 inline-block h-4 w-4 align-[-3px]" />Generate with AI</Link>}
        <Link href="/admin/item-quality" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="search" className="me-1 inline-block h-4 w-4 align-[-3px]" />Question quality</Link>
        {actor.role !== "TEACHER" && <Link href="/admin/coverage" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="chart" className="me-1 inline-block h-4 w-4 align-[-3px]" />Coverage Report</Link>}
      </PageHeader>
      {actor.role !== "TEACHER" && <BankTabs />}
      {gaps.length > 0 && (
        <section className="mb-6 overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-amber-300">
          <h2 className="border-b px-4 py-3 text-lg font-bold text-brand-navy">Practice gaps (last 30 days)</h2>
          <p className="px-4 pt-2 text-sm text-slate-600">Skills where practice found no question within 2 levels of a student, so the session ended early. Add easier questions to these skills first.</p>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="p-3">Skill</th><th className="p-3">Times</th><th className="p-3">Students</th><th className="p-3">Lowest ability (θ)</th></tr></thead>
            <tbody>{gaps.map((x) => <tr key={x.skillId} className="border-b last:border-0"><td className="p-3 font-medium">{x.skill}</td><td className="p-3 tabular-nums">{x.times}</td><td className="p-3 tabular-nums">{x.students}</td><td className="p-3 tabular-nums">{x.lowestAbility ?? "—"}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      {lv.length > 0 && (
        <details className="mb-6 rounded-3xl bg-white shadow-sm ring-1 ring-amber-300" open={lv.some((x) => x.missing.includes("Below"))}>
          <summary className="min-h-10 cursor-pointer px-4 py-3 text-lg font-bold text-brand-navy">Levels lacking questions · {lv.length} skill(s)</summary>
          <p className="px-4 text-sm text-slate-600">Published questions per skill at each level (difficulty 1–3 Approaching, 4 Meeting, 5–7 Exceeding). A level with fewer than {MIN_PER_LEVEL} questions makes adaptive practice run out of items for students at that level — easier (Approaching) questions first.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="p-3">Grade</th><th className="p-3">Skill</th><th className="p-3">Approaching</th><th className="p-3">Meeting</th><th className="p-3">Exceeding</th><th className="p-3">Needs</th></tr></thead>
            <tbody>{lv.slice(0, 120).map((x) => {
              const cell = (n: number) => <td className={`p-3 tabular-nums ${n < MIN_PER_LEVEL ? "font-semibold text-red-700" : ""}`}>{n}</td>;
              return <tr key={x.skillId} className="border-b last:border-0"><td className="p-3">{x.grade}</td><td className="p-3 font-medium">{x.skill}</td>{cell(x.below)}{cell(x.on)}{cell(x.above)}<td className="p-3">{x.missing.map((m) => LEVEL_WORD[m]).join(", ")}</td></tr>;
            })}</tbody>
          </table></div>
        </details>
      )}
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
