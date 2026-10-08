import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { interventionBoard, type Flag } from "@/server/teacher/intervention";

export const metadata = { title: "Intervention" };
const META: Record<Flag, { icon: string; label: string; tone: string; what: string }> = {
  URGENT: { icon: "🔴", label: "Urgent support", tone: "bg-red-100 text-red-900 ring-red-200", what: "MAP 10th percentile or below" },
  RETEST: { icon: "⚠️", label: "Retest", tone: "bg-orange-100 text-orange-900 ring-orange-200", what: "MAP rapid guessing 30%+: the score may be too low" },
  BEGINNER: { icon: "📖", label: "Beginning reader", tone: "bg-amber-100 text-amber-900 ring-amber-200", what: "Lexile BR" },
  GUESSING: { icon: "🎲", label: "Guessing here", tone: "bg-violet-100 text-violet-900 ring-violet-200", what: "30%+ rapid answers on the platform (30 days)" },
  NOT_TESTED: { icon: "📝", label: "Not tested", tone: "bg-sky-100 text-sky-900 ring-sky-200", what: "No MAP score in the latest term" },
  INACTIVE: { icon: "💤", label: "Inactive", tone: "bg-slate-100 text-slate-700 ring-slate-200", what: "No practice for 10 days" },
};

/** 🚨 Every student who needs attention now — from MAP and from the platform itself. */
export default async function InterventionPage({ searchParams }: { searchParams: Promise<{ flag?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const b = await interventionBoard(repo, actor);
  const flag = (Object.keys(META) as Flag[]).includes(sp.flag as Flag) ? (sp.flag as Flag) : null;
  const rows = flag ? b.rows.filter((r) => r.flags.some((f) => f.flag === flag)) : b.rows;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="🚨" title="Intervention"
        subtitle={`Students who need attention now${b.term ? ` (MAP ${b.term})` : ""}, most urgent first. Act on them with the personalized plan, MAP recommendations or a skill assignment.`}>
        <Link href="/teacher/personal-plan" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">📋 Personalized plan</Link>
        <Link href="/teacher/map-recommendations" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">💡 Recommendations</Link>
      </PageHeader>
      <nav aria-label="Filter" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(META) as Flag[]).map((f) => (
          <Link key={f} href={flag === f ? "/teacher/intervention" : `/teacher/intervention?flag=${f}`} aria-current={flag === f ? "true" : undefined} title={META[f].what}
            className={`lift rounded-2xl p-3 ring-1 ${flag === f ? "ring-2 ring-brand-navy" : ""} ${META[f].tone}`}>
            <span className="block text-2xl font-extrabold">{META[f].icon} {b.counts[f]}</span><span className="text-xs font-bold">{META[f].label}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? <p className="rounded-2xl bg-emerald-50 p-5 text-emerald-900 ring-1 ring-emerald-200">✅ Nobody here right now.</p> : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3">Why</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.studentId} className="border-b align-top last:border-0">
                <td className="p-3 font-semibold text-slate-900">{r.name}</td><td className="p-3"><span className="block">{r.className}</span><Link href={`/teacher/personal-plan?classId=${r.classId}`} className="text-xs font-semibold text-brand-teal hover:underline">📋 class plan</Link></td>
                <td className="p-3"><div className="flex flex-wrap gap-1.5">{r.flags.map((f, i) => <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${META[f.flag].tone}`}>{META[f.flag].icon} {f.detail}</span>)}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
