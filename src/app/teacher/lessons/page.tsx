import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { LessonPassage } from "@/components/lessons/lesson-passage";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classLessonProgress, classLessonSkills, lessonRoster, qarReport, scriptCard } from "@/server/lessons/teacher";
import { assignLessonAction } from "./actions";

export const metadata = { title: "Lessons" };

const PHASE: Record<string, string> = { MODEL: "Model", GUIDED: "Guided", INDEPENDENT: "On own", CHECK: "Quick check", DONE: "Done" };
const APPROACH = ["Standard", "Organizer first", "Easier items + frames"];

/**
 * 🧩 Intervention lessons for a class: assign a lesson, follow progress (phase, check tries, check %, passed), a
 * 15-minute small-group script for a skill, and the class's accuracy by question type (QAR).
 */
export default async function TeacherLessonsPage({ searchParams }: { searchParams: Promise<{ class?: string; skill?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.class) ?? classes[0];
  const classId = klass ? String(klass.id) : "";
  const [skills, roster, progress, qar] = klass
    ? await Promise.all([classLessonSkills(repo, actor, classId), lessonRoster(repo, actor, classId), classLessonProgress(repo, actor, classId), qarReport(repo, actor, classId)])
    : [[], [], [], null];
  // the script card: the chosen skill, else the skill with the most lesson runs in the class, else the first one
  const runCount = new Map<string, number>();
  for (const r of progress) runCount.set(r.skillId, (runCount.get(r.skillId) ?? 0) + 1);
  const skillId = skills.find((k) => k.id === sp.skill)?.id ?? [...runCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? skills[0]?.id;
  const card = klass && skillId && skills.some((k) => k.id === skillId) ? await scriptCard(repo, actor, classId, skillId) : null;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="🧩" title="Intervention lessons"
        subtitle="Gradual release for one skill: model → guided practice with hints → on their own → a 5-question quick check (4 of 5 to pass). A missed step is retaught a different way; students who need more come to you." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/lessons?class=${c.id}`} className={chip(c.id === klass?.id)}>{String(c.name)}</Link>)}</nav>
      {!classes.length && <p className="mt-4 text-slate-600">You have no classes yet.</p>}
      {klass && (
        <div className="mt-5 space-y-6">
          <Section title="Assign a lesson" icon="📨" hint="Students get a notification with a link. A student who already has this lesson open keeps it.">
            {skills.length ? (
              <form action={assignLessonAction} className="space-y-3">
                <input type="hidden" name="classId" value={classId} />
                <label className="block text-sm font-semibold">Skill
                  <select name="skillId" defaultValue={skillId} className="mt-1 block w-full max-w-md rounded-lg border-slate-300">{skills.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
                </label>
                <fieldset>
                  <legend className="text-sm font-semibold">Students <span className="font-normal text-slate-500">(none chosen = the whole class)</span></legend>
                  <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-3">{roster.map((st) => <label key={st.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="studentIds" value={st.id} /><bdi>{st.name}</bdi></label>)}</div>
                </fieldset>
                <button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">Assign lesson</button>
              </form>
            ) : <p className="text-slate-600">This class's curriculum has no skills with a lesson yet.</p>}
          </Section>

          <Section title="Class progress" icon="📈" hint="Approach: the re-teach in use (never repeated). Check: quick-check tries and the last score.">
            {progress.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th scope="col" className="p-2">Student</th><th scope="col" className="p-2">Skill</th><th scope="col" className="p-2">Phase</th><th scope="col" className="p-2">Approach</th><th scope="col" className="p-2">Check tries</th><th scope="col" className="p-2">Check %</th><th scope="col" className="p-2">Result</th><th scope="col" className="p-2">Organizer</th></tr></thead>
                  <tbody>
                    {progress.map((r) => (
                      <tr key={r.runId} className="border-t border-slate-100">
                        <td className="p-2"><Link href={`/teacher/lessons/${r.runId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{r.student}</bdi></Link></td>
                        <td className="p-2">{r.skill}</td>
                        <td className="p-2">{PHASE[r.phase] ?? r.phase}</td>
                        <td className="p-2">{APPROACH[r.approach] ?? r.approach}</td>
                        <td className="p-2 tabular-nums">{r.attempts}</td>
                        <td className="p-2 tabular-nums">{r.checkPct === null ? "—" : `${r.checkPct}%`}</td>
                        <td className="p-2">{r.passed === true ? "✅ Passed" : r.passed === false ? "🧑‍🏫 Needs you" : "In progress"}</td>
                        <td className="p-2">{r.organizer === "COMPLETE" ? "✓ Complete" : r.organizer === "STARTED" ? "Started" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-slate-600">No lessons yet in this class.</p>}
          </Section>

          {card && (
            <Section title={`15-minute small-group script: ${card.skillName}`} icon="⏱️" hint={<form className="flex flex-wrap items-center gap-2" action="/teacher/lessons"><input type="hidden" name="class" value={classId} /><label className="text-sm">Skill <select name="skill" defaultValue={card.skillId} className="rounded-lg border-slate-300 text-sm">{skills.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label><button className="rounded-lg bg-white px-3 py-1 text-sm font-semibold ring-1 ring-slate-300">Show</button></form>}>
              <div className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200"><h3 className="font-bold">1 · Warm-up ({card.minutes.warmUp} min)</h3><p className="mt-1">{card.warmUp}</p></article>
                <article className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
                  <h3 className="font-bold">2 · Model ({card.minutes.model} min)</h3>
                  <p className="mt-1"><span className="font-semibold">Say: </span>{card.model.definition}</p>
                  <ol className="mt-2 list-decimal ps-5">{card.model.steps.map((x) => <li key={x}>{x}</li>)}</ol>
                  <p className="mt-2 text-sm"><span className="font-semibold">Signal words: </span>{card.model.signalWords.join(", ")}</p>
                  <p className="mt-2 font-semibold">Think aloud:</p><ul className="list-disc ps-5 text-sm">{card.model.thinkAloud.map((x) => <li key={x}>{x}</li>)}</ul>
                </article>
                <div className="lg:col-span-2"><LessonPassage title={card.model.passageTitle} text={card.model.passage} clues={card.model.clues} numbered /></div>
                <article className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                  <h3 className="font-bold">3 · Guided ({card.minutes.guided} min)</h3>
                  <p className="mt-1"><span className="font-semibold">Ask: </span>{card.guided.question}</p>
                  <p className="text-sm"><span className="font-semibold">Answer: </span>{card.guided.answer} <span className="text-slate-600">({card.guided.why})</span></p>
                  {card.guided.organizer && <p className="mt-1 text-sm"><span className="font-semibold">Organizer: </span>{card.guided.organizer}</p>}
                  <ul className="mt-2 list-disc ps-5 text-sm">{card.guided.prompts.map((x) => <li key={x}>{x}</li>)}</ul>
                  <p className="mt-2 text-sm"><span className="font-semibold">Frames: </span>{card.guided.frames.map((f) => `“${f}”`).join(" · ")}</p>
                </article>
                <article className="rounded-xl bg-violet-50 p-4 ring-1 ring-violet-200">
                  <h3 className="font-bold">4 · Check ({card.minutes.check} min)</h3>
                  <ul className="mt-1 list-disc ps-5 text-sm">{card.check.prompts.map((x) => <li key={x}>{x}</li>)}</ul>
                  <p className="mt-2 text-sm font-semibold">{card.check.passRule}</p>
                  <ul className="mt-1 list-disc ps-5 text-sm">{card.check.reteach.map((x) => <li key={x.title}><span className="font-semibold">{x.title}: </span>{x.how}</li>)}</ul>
                </article>
                <article className="rounded-xl bg-white p-4 ring-1 ring-slate-200 lg:col-span-2">
                  <h3 className="font-bold">This class's most common mistakes on this skill</h3>
                  {card.misconceptions.length ? <ul className="mt-1 space-y-1 text-sm">{card.misconceptions.map((m) => <li key={m.code}><span className="font-semibold">{m.label}</span> ({m.count}) — {m.fix}</li>)}</ul> : <p className="mt-1 text-sm text-slate-600">No recorded mistakes on this skill yet.</p>}
                </article>
              </div>
            </Section>
          )}

          {qar && (
            <Section title="Accuracy by question type (QAR)" icon="❓" hint="Right There · Think and Search · Author and Me · On My Own — the class's careful answers in the last 90 days.">
              {qar.rows.length ? (
                <ul className="space-y-2">
                  {qar.rows.map((r) => (
                    <li key={r.value} className="grid grid-cols-[10rem_1fr_6rem] items-center gap-3 text-sm">
                      <span className="font-semibold">{r.name}</span>
                      <span className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><span className="block h-full rounded-full bg-brand-teal" style={{ width: `${r.accuracy}%` }} /></span>
                      <span className="tabular-nums">{r.accuracy}% <span className="text-slate-500">({r.answers})</span></span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">💡 {qar.interpretation}</p>
            </Section>
          )}
        </div>
      )}
    </AppShell>
  );
}
