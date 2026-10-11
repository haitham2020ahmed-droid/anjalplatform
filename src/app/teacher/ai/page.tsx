import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classIntelligence, copilotAnswer, intentOf, PRESETS } from "@/server/copilot/copilot";
import { assignCopilotQuestionsAction } from "./actions";

export const metadata = { title: "Class AI" };
const RISK = { HIGH: "bg-red-100 text-red-800", MEDIUM: "bg-amber-100 text-amber-900", LOW: "bg-emerald-100 text-emerald-800" } as const;

/**
 * 🤖 Teacher AI dashboard: the Copilot (ask about the class), students at risk with reasons and actions, predicted
 * problems, recommended interventions and the class summary — every line from the class's own data.
 */
export default async function TeacherAiPage({ searchParams }: { searchParams: Promise<{ class?: string; q?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.class) ?? classes[0];
  if (!klass) return <AppShell name={String(me.displayName)}><p>No class yet.</p></AppShell>;
  const question = (sp.q ?? PRESETS[0].text).slice(0, 200);
  const intel = await classIntelligence(repo, actor, String(klass.id));
  const a = await copilotAnswer(repo, intel, intentOf(question));
  const nameOf = (id: string) => intel.students.find((x) => x.id === id)?.name ?? "Student";
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const atRisk = intel.risks.filter((r) => r.level !== "LOW");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="🤖" title="Class AI"
        subtitle="Ask about your class. The answers come from your students' own data on the platform — risk, foundations, misconceptions, MAP and Weekly Checks — with the numbers behind them." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/ai?class=${c.id}`} className={chip(c.id === klass.id)}>{String(c.name)}</Link>)}</nav>

      <section className="mt-5 rounded-3xl bg-gradient-to-br from-indigo-50 via-white to-teal-50 p-5 ring-1 ring-indigo-200" data-testid="copilot">
        <h2 className="text-lg font-bold text-brand-navy">🧑‍💼 Copilot</h2>
        <form className="mt-2 flex flex-wrap gap-2" action="/teacher/ai">
          <input type="hidden" name="class" value={String(klass.id)} />
          <input name="q" defaultValue={question} maxLength={200} className="min-w-0 flex-1 rounded-xl border-slate-300" aria-label="Your question" />
          <button className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">Ask</button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">{PRESETS.map((p) => <Link key={p.intent} href={`/teacher/ai?class=${klass.id}&q=${encodeURIComponent(p.text)}`} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200 hover:ring-indigo-400">{p.text}</Link>)}</div>
        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xl font-extrabold text-brand-navy">{a.headline}</p>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-slate-800">{a.summary.map((x, i) => <li key={i}><bdi>{x}</bdi></li>)}</ul>
          {a.priorities.length > 0 && a.intent !== "HELP" && <>
            <h3 className="mt-3 font-bold text-brand-navy">Teaching priorities</h3>
            <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm">{a.priorities.map((p, i) => <li key={i}><b>{p.title}</b> — {p.why}</li>)}</ol>
          </>}
          {a.lesson && (a.intent === "TOMORROW" || a.intent === "QUESTIONS") && <>
            <h3 className="mt-3 font-bold text-brand-navy">📋 {a.lesson.minutes}-minute lesson: {a.lesson.focus}</h3>
            <ul className="mt-1 space-y-1 text-sm">{a.lesson.steps.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </>}
          {a.groups.length > 0 && (a.intent === "TOMORROW" || a.intent === "GROUPS" || a.intent === "HELP") && <>
            <h3 className="mt-3 font-bold text-brand-navy">👥 Groups</h3>
            <div className="mt-1 grid gap-2 md:grid-cols-2">{a.groups.map((g) => (
              <div key={g.name} className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                <p className="font-bold">{g.name} <span className="font-normal text-slate-500">({g.students.length})</span></p>
                <p className="text-xs text-slate-600"><bdi>{g.students.join(", ")}</bdi></p>
                <p className="mt-1 text-xs">{g.activity}</p>
                <Link href={`/teacher/intervention/groups?class=${klass.id}&students=${g.studentIds.join(",")}`} className="mt-1 inline-block text-xs font-semibold text-brand-teal underline">Start as an intervention group →</Link>
              </div>
            ))}</div>
          </>}
          {a.questions.length > 0 && (a.intent === "TOMORROW" || a.intent === "QUESTIONS") && <>
            <h3 className="mt-3 font-bold text-brand-navy">❓ Recommended questions</h3>
            <ul className="mt-1 space-y-1 text-sm">{a.questions.map((q) => <li key={q.id}><span className="me-1 rounded bg-slate-100 px-1.5 text-xs">L{q.level}</span>{q.stem}</li>)}</ul>
            <form action={assignCopilotQuestionsAction} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="classId" value={String(klass.id)} /><input type="hidden" name="questionIds" value={a.questions.map((q) => q.id).join(",")} />
              <input type="hidden" name="studentIds" value={a.groups[0]?.studentIds.join(",") ?? ""} /><input type="hidden" name="title" value={`Copilot: ${a.lesson?.focus ?? "practice"}`} />
              <button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white">Assign to {a.groups[0] ? `${a.groups[0].name} (${a.groups[0].students.length})` : "the class"}</button>
            </form>
          </>}
          <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">The data behind this answer</summary><ul className="mt-1 list-disc ps-5">{a.evidence.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <article className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 lg:col-span-2">
          <h2 className="text-lg font-bold text-brand-navy">🚨 Students at risk ({atRisk.length})</h2>
          <p className="text-xs text-slate-500">Probability of not reaching the MAP goal, with what pushes it up and what to do.</p>
          <table className="mt-2 w-full text-sm"><tbody>{atRisk.slice(0, 15).map((r) => (
            <tr key={r.studentId} className="border-t align-top">
              <td className="py-2 pe-2"><Link href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{nameOf(r.studentId)}</bdi></Link><br /><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${RISK[r.level]}`}>{r.score}%</span></td>
              <td className="py-2 text-xs"><ul className="space-y-0.5">{r.reasons.slice(0, 3).map((x) => <li key={x.key}>• {x.text}</li>)}</ul></td>
              <td className="py-2 ps-2 text-xs text-slate-700">→ {r.reasons[0]?.action ?? "Check in."}</td>
            </tr>
          ))}</tbody></table>
          {!atRisk.length && <p className="mt-2 text-sm text-slate-500">No student at medium or high risk. 🎉</p>}
        </article>
        <article className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">🔮 Predicted problems</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {intel.gaps.slice(0, 3).map((g) => <li key={g.skillId}>🧱 <b>{g.name}</b> will hold back {g.unblocks.slice(0, 2).join(", ") || "later skills"} for {g.students.length} student(s).</li>)}
            {intel.misconceptions.slice(0, 2).map((m) => <li key={m.code}>🔍 <b>{m.label}</b> keeps coming back ({m.students.length} students).</li>)}
            {intel.weakAreas.slice(0, 1).map((w) => <li key={w.key}>🗺️ <b>{w.name}</b> is the weakest MAP area for {w.students} students.</li>)}
          </ul>
          <h2 className="mt-4 text-lg font-bold text-brand-navy">📊 Class summary</h2>
          <ul className="mt-1 space-y-1 text-xs text-slate-700">{a.evidence.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <p className="mt-3 flex flex-wrap gap-2 text-xs"><Link href={`/teacher/knowledge-graph?class=${klass.id}`} className="font-semibold text-brand-teal underline">Knowledge Graph</Link><Link href={`/teacher/learning-loop?classId=${klass.id}`} className="font-semibold text-brand-teal underline">Learning Loop</Link><Link href={`/teacher/intervention/groups?class=${klass.id}`} className="font-semibold text-brand-teal underline">Intervention Groups</Link></p>
        </article>
      </section>
    </AppShell>
  );
}
