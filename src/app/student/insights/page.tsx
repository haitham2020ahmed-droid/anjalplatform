import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { buildProfiles, profilesOf } from "@/server/insights/student-profile";
import { risksOf, forecast } from "@/server/predict/risk";
import { nextStep } from "@/server/student/next-step";

export const metadata = { title: "My Progress" };
const LEVEL: Record<string, string> = { BELOW: "Building up", ON: "On track", ABOVE: "Above grade level", UNKNOWN: "Getting to know you" };
const TIPS: Record<string, string> = {
  lowPractice: "Practise a little every day: 10 minutes, 5 days a week.",
  decliningPractice: "You practised less lately. Pick a time each day and stick to it.",
  slowGrowth: "Start with the 🧱 skills in your path: they make the others easier.",
  guessing: "Slow down and read each question twice: careful answers count more.",
  weakFoundations: "Your path starts with the skills underneath. That is the fastest way up.",
  lowGoalChance: "Do your Weekly Check and follow My Next Step: they aim at your MAP goal.",
};

/** 🌟 The student's AI dashboard: where I am, where I am going, what helps me most, and my path. */
export default async function MyProgressPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const id = actor.studentId!;
  let p = (await profilesOf(repo, [id])).get(id) ?? null;
  if (!p) { await buildProfiles(repo, String(actor.schoolId), new Date(), [id]).catch(() => 0); p = (await profilesOf(repo, [id])).get(id) ?? null; }
  const [risk] = await risksOf(repo, String(actor.schoolId), [id]);
  const step = await nextStep(repo, actor);
  const i = p?.intelligence ?? null;
  const fc = forecast(i?.developing ?? [], i?.growthPerWeek ?? null, { rit: p?.predictedReading ?? null, goal: p?.goalReading ?? null, current: p?.estReadingRit ?? p?.readingRit ?? null, weeksToTerm: 12 });
  const tips = (risk?.reasons ?? []).map((r) => TIPS[r.key]).filter(Boolean).slice(0, 2);
  return (
    <AppShell name={String(me.displayName)}>
      <h1 className="text-3xl font-extrabold text-brand-navy">🌟 My Progress</h1>
      <section className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-brand-navy p-5 text-white"><p className="text-sm text-indigo-200">Where I am</p><p className="text-3xl font-extrabold">{LEVEL[p?.level ?? "UNKNOWN"]}</p><p className="mt-1 text-sm text-indigo-100">{i ? `${i.mastered.length} skills mastered · ${i.developing.length} growing` : ""}</p></div>
        <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200"><p className="text-sm text-slate-500">🔮 My next MAP</p><p className="text-3xl font-extrabold text-brand-navy">{p?.predictedReading ? `≈ ${p.predictedReading}` : "—"}</p><p className="text-sm text-slate-600">{p?.goalReading ? `My goal: ${p.goalReading}${fc.weeksToGoal !== null ? ` · about ${fc.weeksToGoal} weeks at my pace` : ""}` : "Your teacher will add your MAP score."}</p></div>
        <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200"><p className="text-sm text-slate-500">📈 My pace</p><p className="text-3xl font-extrabold text-brand-navy">{i?.growthPerWeek !== null && i?.growthPerWeek !== undefined ? `+${i.growthPerWeek}` : "—"}</p><p className="text-sm text-slate-600">mastery points a week · {p?.practiceDays14 ?? 0} practice days in 2 weeks</p></div>
      </section>
      {tips.length > 0 && <section className="mt-4 rounded-3xl bg-amber-50 p-4 ring-1 ring-amber-200"><p className="font-bold text-amber-900">💡 What will help me most</p><ul className="mt-1 list-disc ps-5 text-amber-900">{tips.map((t) => <li key={t}>{t}</li>)}</ul></section>}
      {step.href && <Link href={step.href} className="lift mt-4 flex items-center justify-between gap-3 rounded-3xl bg-brand-navy p-5 text-white"><span><span className="block text-xs font-bold uppercase tracking-wider text-indigo-200">▶ My Next Step</span><span className="block text-2xl font-extrabold">{step.title}</span><span className="block text-sm text-indigo-100">{step.why}</span></span><span className="rounded-xl bg-white px-5 py-2 font-bold text-brand-navy">{step.cta} ▶</span></Link>}
      {i && i.path.length > 0 && (
        <section className="mt-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">🧭 My learning path</h2>
          <ol className="mt-2 space-y-2">{i.path.map((x, k) => <li key={x.skillId + k} className="flex items-center gap-2"><span className="tabular-nums text-slate-400">{k + 1}</span>{x.action === "FOUNDATION" ? "🧱" : x.action === "REVIEW" ? "🔁" : x.action === "STRETCH" ? "🚀" : "🎯"}<Link href={`/practice/${x.skillId}`} className="font-semibold text-brand-navy hover:underline">{x.name}</Link><span className="text-xs text-slate-500">{x.action === "FOUNDATION" ? "builds a skill underneath" : x.action === "STRETCH" ? "a challenge" : x.action === "REVIEW" ? "keep it strong" : ""}</span></li>)}</ol>
        </section>
      )}
      {fc.skills.length > 0 && (
        <section className="mt-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">🌱 Skills I am growing</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">{fc.skills.map((x) => <li key={x.name} className="rounded-xl bg-slate-50 px-3 py-2 text-sm"><b>{x.name}</b><br /><span className="text-xs text-slate-600">{x.weeks !== null ? `about ${x.weeks} week${x.weeks === 1 ? "" : "s"} to master at my pace` : "practise it to see my pace"}</span></li>)}</ul>
        </section>
      )}
    </AppShell>
  );
}
