import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { buildProfiles, profilesOf } from "@/server/insights/student-profile";
import { risksOf, forecast } from "@/server/predict/risk";
import { nextStep } from "@/server/student/next-step";
import { AtAGlance, Callout, ReportHeader, ReportSection } from "@/components/report-kit";
import { getT } from "@/i18n/server";

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
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/student", label: "Home" }} icon="🌟" title="My Progress" subtitle="Where I am, where I am going, and what helps me most." who={String(me.displayName)} />
      <AtAGlance title={null} items={[
        { icon: "📍", label: "Where I am", value: <span className="text-2xl">{t(LEVEL[p?.level ?? "UNKNOWN"])}</span>, meaning: i ? t("{m} skills mastered · {g} growing", { m: i.mastered.length, g: i.developing.length }) : undefined, tone: p?.level === "BELOW" ? "warn" : p?.level === "UNKNOWN" || !p?.level ? "neutral" : "good" },
        { icon: "🔮", label: "My next MAP", value: p?.predictedReading ? `≈ ${p.predictedReading}` : "—", meaning: p?.goalReading ? <>{t("My goal")}: {p.goalReading}{fc.weeksToGoal !== null ? ` · ${t("about {n} weeks at my pace", { n: fc.weeksToGoal })}` : ""}</> : "Your teacher will add your MAP score.", tone: "info" },
        { icon: "📈", label: "My pace", value: i?.growthPerWeek !== null && i?.growthPerWeek !== undefined ? `+${i.growthPerWeek}` : "—", meaning: t("mastery points a week · {n} practice days in 2 weeks", { n: p?.practiceDays14 ?? 0 }), tone: (p?.practiceDays14 ?? 0) >= 5 ? "good" : "warn" },
      ]} />
      <Callout kind="meaning" items={[
        t("“Mastered” means I can do the skill well again and again."),
        t("My pace is how fast my skills grow each week. Practising more days makes it faster."),
      ]} className="mb-4" />
      {tips.length > 0 && <Callout kind="next" title="What will help me most" items={tips} className="mb-4" />}
      {step.href && <Link href={step.href} className="lift mt-4 flex items-center justify-between gap-3 rounded-3xl bg-brand-navy p-5 text-white"><span><span className="block text-xs font-bold uppercase tracking-wider text-indigo-200">▶ My Next Step</span><span className="block text-2xl font-extrabold">{step.title}</span><span className="block text-sm text-indigo-100">{step.why}</span></span><span className="rounded-xl bg-white px-5 py-2 font-bold text-brand-navy">{step.cta} ▶</span></Link>}
      {i && i.path.length > 0 && (
        <ReportSection title="My learning path" icon="🧭" className="mt-4">
          <ol className="space-y-2">{i.path.map((x, k) => <li key={x.skillId + k} className="flex items-center gap-2"><span className="tabular-nums text-slate-400">{k + 1}</span>{x.action === "FOUNDATION" ? "🧱" : x.action === "REVIEW" ? "🔁" : x.action === "STRETCH" ? "🚀" : "🎯"}<Link href={`/practice/${x.skillId}`} className="font-semibold text-brand-navy hover:underline">{x.name}</Link><span className="text-xs text-slate-500">{x.action === "FOUNDATION" ? "builds a skill underneath" : x.action === "STRETCH" ? "a challenge" : x.action === "REVIEW" ? "keep it strong" : ""}</span></li>)}</ol>
        </ReportSection>
      )}
      {fc.skills.length > 0 && (
        <ReportSection title="Skills I am growing" icon="🌱">
          <ul className="grid gap-2 sm:grid-cols-2">{fc.skills.map((x) => <li key={x.name} className="rounded-xl bg-slate-50 px-3 py-2 text-sm"><b>{x.name}</b><br /><span className="text-xs text-slate-600">{x.weeks !== null ? `about ${x.weeks} week${x.weeks === 1 ? "" : "s"} to master at my pace` : "practise it to see my pace"}</span></li>)}</ul>
        </ReportSection>
      )}
    </AppShell>
  );
}
