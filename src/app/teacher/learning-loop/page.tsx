import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { learningLoop, type StageKey } from "@/server/insights/learning-loop";
import { LoopWheel } from "@/components/insights/loop-wheel";
import { groupMisconceptions } from "@/server/insights/misconception-tags";
import { profilesOf } from "@/server/insights/student-profile";
import { recommendationStats } from "@/server/insights/recommendation-log";

export const metadata = { title: "Learning Intelligence Loop" };
const HEALTH = { GOOD: "bg-emerald-50 ring-emerald-300", WARN: "bg-amber-50 ring-amber-300", TODO: "bg-red-50 ring-red-200" } as const;
const DOT = { GOOD: "bg-emerald-500", WARN: "bg-amber-400", TODO: "bg-red-500" } as const;
const STAGE_NAME: Record<StageKey, string> = { MEASURE: "📏 Measure", ANALYZE: "🔍 Analyze", PLAN: "🗺️ Plan", PRACTICE: "🎯 Practice", CHECK: "✅ Check", REPORT: "👪 Report" };

/**
 * 🔄 Learning Intelligence Loop: Measure → Analyze → Plan → Practice → Check → Report → Measure again.
 * The whole class (or school) on one wheel, each stage with its numbers and next action, and every student's
 * place in the loop with the one step that moves them on.
 */
export default async function LearningLoopPage({ searchParams }: { searchParams: Promise<{ classId?: string; stage?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const admin = actor.role !== "TEACHER";
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : admin ? null : classes[0] ? String(classes[0].id) : null;
  const loop = await learningLoop(repo, actor, classId);
  const counts = Object.fromEntries(loop.stages.map((st) => [st.key, loop.students.filter((x) => x.stage === st.key).length]));
  const stage = loop.stages.find((st) => st.key === sp.stage)?.key;
  const shown = stage ? loop.students.filter((x) => x.stage === stage) : loop.students;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const q = (p: Record<string, string | undefined>) => `/teacher/learning-loop?${new URLSearchParams(Object.entries({ classId: classId ?? undefined, stage, ...p }).filter(([, v]) => v) as [string, string][])}`;
  const ids = loop.students.map((x) => x.id);
  const [mis, profiles, advice] = await Promise.all([groupMisconceptions(repo, ids, 30), profilesOf(repo, ids), recommendationStats(repo, ids)]);
  const nameOf = new Map(loop.students.map((x) => [x.id, x.name]));
  const risk = loop.students.map((x) => ({ x, p: profiles.get(x.id) })).filter((r) => r.p && r.p.goalChance !== null && r.p.goalChance < 50).sort((a, b) => (a.p!.goalChance ?? 0) - (b.p!.goalChance ?? 0)).slice(0, 8);
  const maxNeed = Math.max(1, ...loop.areaNeeds.map((a) => a.students));
  const maxPrac = Math.max(1, ...loop.areaNeeds.map((a) => a.practice));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: admin ? "/admin" : "/teacher", label: "Home" }} icon="🔄" title="Learning Intelligence Loop"
        subtitle="Measure → Analyze → Plan → Practice → Check → Report → Measure again. MAP, the Diagnostic and the Weekly Check find each student's weakest NWEA area; the plan and the practice target exactly that area at the student's level; the Weekly Check shows if the RIT moves; the family is told. Every student, every stage, the next step." />
      <nav aria-label="Classes" className="flex flex-wrap items-center gap-2 print:hidden">
        {admin && <Link href="/teacher/learning-loop" className={chip(!classId)}>🏫 Whole school</Link>}
        {classes.map((c) => <Link key={String(c.id)} href={`/teacher/learning-loop?classId=${c.id}`} className={chip(c.id === classId)}>{String(c.name)}</Link>)}
        <span className="ms-auto"><PrintButton /></span>
      </nav>

      <section className="mt-5 grid items-center gap-6 rounded-3xl bg-gradient-to-br from-slate-50 to-white p-6 ring-1 ring-slate-200 lg:grid-cols-5">
        <div className="lg:col-span-2"><LoopWheel stages={loop.stages} score={loop.score} counts={counts} /></div>
        <div className="lg:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-teal">{loop.scope} · {loop.students.length} students</p>
          <h2 className="mt-1 text-2xl font-extrabold text-brand-navy">Where every student is in the loop</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {loop.stages.map((st) => (
              <Link key={st.key} href={q({ stage: stage === st.key ? undefined : st.key })} className={`rounded-2xl px-3 py-2 ring-1 transition hover:ring-brand-teal ${stage === st.key ? "bg-brand-navy text-white ring-brand-navy" : "bg-white ring-slate-200"}`}>
                <span className="flex items-center justify-between text-sm font-bold">{st.icon} {st.title}<span className={`h-2.5 w-2.5 rounded-full ${DOT[st.health]}`} /></span>
                <span className="block text-2xl font-extrabold tabular-nums">{counts[st.key]}</span>
                <span className={`block text-xs ${stage === st.key ? "text-white/70" : "text-slate-500"}`}>student(s) at this step</span>
              </Link>
            ))}
          </div>
          <h3 className="mt-5 font-bold text-brand-navy">🧭 Need vs practice, by NWEA instructional area</h3>
          <p className="text-xs text-slate-500">Bars: students whose weakest area it is (navy) and answers practised in it this week (teal). The loop is aligned when practice follows need.</p>
          <ul className="mt-2 space-y-1.5">{loop.areaNeeds.map((a) => (
            <li key={a.key} className="grid grid-cols-[9rem_1fr] items-center gap-2 text-sm">
              <span className="truncate" title={a.name}>{a.name.replace(/^Language: Understand, Edit for /, "")}</span>
              <span className="space-y-0.5">
                <span className="flex items-center gap-2"><span className="h-2.5 rounded-full bg-brand-navy" style={{ width: `${Math.max(2, (a.students / maxNeed) * 100)}%` }} /><span className="text-xs tabular-nums text-slate-600">{a.students}</span></span>
                <span className="flex items-center gap-2"><span className="h-2.5 rounded-full bg-teal-500" style={{ width: `${Math.max(2, (a.practice / maxPrac) * 100)}%` }} /><span className="text-xs tabular-nums text-slate-600">{a.practice}</span></span>
              </span>
            </li>
          ))}</ul>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loop.stages.map((st) => (
          <article key={st.key} className={`flex flex-col rounded-3xl p-5 ring-1 ${HEALTH[st.health]}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-extrabold text-brand-navy"><span className="me-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">{st.n}</span> {st.icon} {st.title}</h3>
              <span className="text-2xl font-extrabold tabular-nums text-brand-navy">{st.score}%</span>
            </div>
            <p className="mt-1 text-sm text-slate-700">{st.headline}</p>
            <dl className="mt-3 grid flex-1 grid-cols-2 gap-2 text-sm">{st.metrics.map((m) => <div key={m.label} className="rounded-xl bg-white/80 px-3 py-1.5 ring-1 ring-white"><dt className="text-[11px] text-slate-500">{m.label}</dt><dd className="font-bold tabular-nums text-brand-navy">{m.value}</dd></div>)}</dl>
            {st.next && <Link href={st.next.href} className="mt-3 inline-block self-start rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple print:hidden">{st.next.label} →</Link>}
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3" data-testid="loop-intelligence">
        <article className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">🔍 Why students miss</h2>
          <p className="text-xs text-slate-500">The most common misconceptions behind wrong answers (last 30 days), with a teaching move.</p>
          {mis.length ? <ul className="mt-3 space-y-3">{mis.map((m) => (
            <li key={m.code} className="rounded-2xl bg-orange-50 p-3 ring-1 ring-orange-200">
              <p className="text-sm font-bold text-orange-900">{m.label}</p>
              <p className="text-xs text-orange-800">{m.students.length} student(s) · {m.answers} wrong answers{m.skills.length ? ` · ${m.skills.join(", ")}` : ""}</p>
              <p className="mt-1 text-xs text-slate-700">💡 {m.fix}</p>
              <p className="mt-1 text-xs text-slate-600"><bdi>{m.students.slice(0, 6).map((st) => nameOf.get(st.id) ?? "").filter(Boolean).join(", ")}</bdi>{m.students.length > 6 ? ` +${m.students.length - 6}` : ""}</p>
              {classId && <Link href={`/teacher/intervention/groups?class=${classId}&students=${m.students.map((st) => st.id).join(",")}`} className="mt-1 inline-block text-xs font-semibold text-brand-teal underline print:hidden">Start a small group →</Link>}
            </li>
          ))}</ul> : <p className="mt-3 text-sm text-slate-500">Not enough wrong answers with a misconception yet.</p>}
        </article>
        <article className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">🔮 Next MAP: who may miss the goal</h2>
          <p className="text-xs text-slate-500">Predicted Reading RIT at the next MAP term and the chance of reaching the goal (latest MAP + expected growth + Weekly Checks + practice).</p>
          {risk.length ? <ul className="mt-3 divide-y text-sm">{risk.map(({ x, p }) => (
            <li key={x.id} className="flex items-center justify-between gap-2 py-1.5" title={p!.predictionWhy ?? ""}>
              <Link href={`/teacher/students/${x.id}`} className="font-semibold text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link>
              <span className="text-xs tabular-nums text-slate-600">{p!.predictedTerm} ≈ {p!.predictedReading} (goal {p!.goalReading}) · <b className={p!.goalChance! < 25 ? "text-red-700" : "text-amber-700"}>{p!.goalChance}%</b></span>
            </li>
          ))}</ul> : <p className="mt-3 text-sm text-slate-500">{profiles.size ? "Every student with a MAP goal is on track (50%+ chance)." : "Predictions appear after the daily update (MAP scores needed)."}</p>}
        </article>
        <article className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">✅ Does the platform's advice work?</h2>
          <p className="text-xs text-slate-500">Every “My Next Step” recommendation is saved and checked 7 days later (last 60 days).</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[11px] text-slate-500">Recommendations</dt><dd className="text-xl font-extrabold tabular-nums text-brand-navy">{advice.made}</dd></div>
            <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[11px] text-slate-500">Followed</dt><dd className="text-xl font-extrabold tabular-nums text-brand-navy">{advice.followedPct ?? "—"}{advice.followedPct !== null ? "%" : ""}</dd></div>
            <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[11px] text-slate-500">Improved (all)</dt><dd className="text-xl font-extrabold tabular-nums text-brand-navy">{advice.improvedPct ?? "—"}{advice.improvedPct !== null ? "%" : ""}</dd></div>
            <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[11px] text-slate-500">Improved when followed</dt><dd className="text-xl font-extrabold tabular-nums text-emerald-700">{advice.improvedWhenFollowedPct ?? "—"}{advice.improvedWhenFollowedPct !== null ? "%" : ""}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">{advice.evaluated} checked so far. “Improved” = mastery +5 or more after a week.</p>
          {classId && <Link href={`/teacher/intervention/groups?class=${classId}`} className="mt-3 inline-block rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple print:hidden">🎯 Interventions and their results →</Link>}
        </article>
      </section>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-brand-navy">🧑‍🎓 Students {stage ? `· ${STAGE_NAME[stage]}` : ""} <span className="text-sm font-normal text-slate-500">({shown.length})</span></h2>
          {stage && <Link href={q({ stage: undefined })} className="text-sm font-semibold text-brand-teal underline">Show everyone</Link>}
        </div>
        <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pe-2">Student</th>{!classId && <th>Class</th>}<th>RIT · %ile</th><th>Weakest area</th><th>Plan</th><th>Practice (7 days)</th><th>Weekly Check</th><th>Next MAP</th><th>Family</th><th>Step</th><th>Next step</th></tr></thead>
          <tbody>{shown.map((x) => (
            <tr key={x.id} className="border-b align-top last:border-0">
              <td className="py-2 pe-2 font-semibold"><Link href={`/teacher/students/${x.id}`} className="text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link></td>
              {!classId && <td className="text-xs">{x.className}</td>}
              <td className="tabular-nums">{x.rit ?? "—"}{x.percentile !== null ? <span className="text-xs text-slate-500"> · {x.percentile}</span> : ""}</td>
              <td>{x.weakest ? <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-800 ring-1 ring-orange-200">{x.weakest.name.replace(/^Language: Understand, Edit for /, "")}{x.weakest.rit ? ` · ${x.weakest.rit}` : ""}</span> : x.diagnostic ? <span className="text-xs text-slate-500">Diagnostic: {x.diagnostic}</span> : <span className="text-xs text-slate-400">—</span>}</td>
              <td className="text-xs">{x.plan === "SENT" ? "✅ sent" : x.plan === "DRAFT" ? "📝 draft" : "—"}</td>
              <td className="text-xs tabular-nums">{x.practice7} q{x.accuracy7 !== null ? ` · ${x.accuracy7}%` : ""}{x.weakest ? <span className={x.inWeakArea7 >= 3 ? "text-emerald-700" : "text-amber-700"}> · {x.inWeakArea7} in weakest</span> : ""}</td>
              <td className="text-xs">{x.check.done ? "✅" : "—"}{x.check.change !== null ? <span className={x.check.change > 0 ? " text-emerald-700" : x.check.change < 0 ? " text-red-700" : ""}> {x.check.change > 0 ? "+" : ""}{x.check.change} RIT</span> : ""}</td>
              <td className="text-xs tabular-nums">{(() => { const p = profiles.get(x.id); return p?.predictedReading ? <span title={p.predictionWhy ?? ""}>≈ {p.predictedReading}{p.goalChance !== null ? <span className={p.goalChance < 40 ? " text-red-700" : p.goalChance < 60 ? " text-amber-700" : " text-emerald-700"}> · {p.goalChance}%</span> : ""}</span> : "—"; })()}</td>
              <td className="text-xs">{x.report === "APPROVED" ? "✅" : x.report === "PENDING" ? "⏳" : "—"}</td>
              <td className="text-xs font-semibold">{STAGE_NAME[x.stage]}</td>
              <td><Link href={x.next.href} className="text-xs font-semibold text-brand-teal underline">{x.next.label}</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
        {!shown.length && <p className="mt-3 text-slate-600">No students here.</p>}
      </section>
    </AppShell>
  );
}
