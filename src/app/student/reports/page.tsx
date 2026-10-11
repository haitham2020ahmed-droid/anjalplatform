import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, Meter, ReportHeader, ReportSection } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import type { Actor } from "@/server/auth/rbac";
import { READING_REPORT_LINKS, reportCards } from "@/server/student/student-home";
import { studentWeek } from "@/server/teacher/classroom";
import { streakAndPoints } from "@/server/student/streak";
import { buildProfiles, profilesOf } from "@/server/insights/student-profile";
import { risksOf, forecast } from "@/server/predict/risk";
import { nextStep } from "@/server/student/next-step";
import { mySkills, type MySkill } from "@/server/game/skill-games";
import { isReportShared } from "@/server/insights/parent-report";
import { myMap } from "@/server/map/map-more";
import { weekStats } from "@/server/student/weekly";
import { studentDiagnosticReport } from "@/server/diagnostic/report";
import { coachSummary } from "@/server/fluency/coach";
import { approvedForFamily } from "@/server/reports/family-reports";
import { setMyGoalAction } from "@/app/student/goal-actions";
import { classChallenge } from "@/server/teacher/extras";
import { LangSwitch } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";

export const metadata = { title: "My Reports" };
type View = "home" | "progress" | "family";

/** what a student reads about themselves: friendly words, never Below / On / Above */
const WHERE: Record<string, string> = { BELOW: "Growing every day", ON: "Doing well", ABOVE: "Doing great", UNKNOWN: "Getting to know you" };
const TIPS: Record<string, string> = {
  lowPractice: "Practise a little every day: 10 minutes, 5 days a week.",
  decliningPractice: "You practised less lately. Pick a time each day and stick to it.",
  slowGrowth: "Start with the 🧱 skills in your path: they make the others easier.",
  guessing: "Slow down and read each question twice: careful answers count more.",
  weakFoundations: "Your path starts with the skills underneath. That is the fastest way up.",
  lowGoalChance: "Do your Weekly Check and follow My Next Step: they aim at your MAP goal.",
};
const bar = (p: number, total: number) => (
  <div className="bar-track mt-2 h-3 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(p, total)}>
    <div className="bar-fill h-full rounded-full" style={{ width: `${Math.min(100, Math.round((100 * p) / Math.max(1, total)))}%` }} />
  </div>
);
const CARD_SOFT = ["bg-sky-50 ring-sky-200", "bg-teal-50 ring-teal-200", "bg-violet-50 ring-violet-200", "bg-amber-50 ring-amber-200"];

/**
 * 📊 My Reports — VERY simple: a few big cards (one icon, one line each). "My progress" and "For my family" open
 * here (?view=progress / ?view=family): the old Progress Report, My Skills and Family Report pages live inside them
 * now (those addresses redirect here). Reading reports are a "My report" tab inside each reading program.
 * Every number is the signed-in student's own (actor.studentId).
 */
export default async function MyReportsPage({ searchParams }: { searchParams: Promise<{ view?: string; goal?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const view: View = sp.view === "progress" ? "progress" : sp.view === "family" ? "family" : "home";
  const { t } = await getT();
  const name = String(me.displayName);
  return (
    <AppShell name={name}>
      {view === "home" && (
        <>
          <ReportHeader back={{ href: "/student", label: "My Work" }} icon="📊" title="My Reports" subtitle={t("All my reports in one place")} who={name} print={false} />
          <ul className="grid gap-4 sm:grid-cols-2" data-testid="report-cards">
            {reportCards().map((c, i) => (
              <li key={c.href}><Link prefetch={false} href={c.href} className={`tile flex min-h-28 items-center gap-4 rounded-3xl p-5 ring-1 sm:p-6 ${CARD_SOFT[i % CARD_SOFT.length]}`}>
                <span aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white text-4xl shadow-card">{c.icon}</span>
                <span className="min-w-0"><span className="block text-xl font-semibold text-brand-navy">{t(c.label)}</span><span className="block text-slate-600">{t(c.hint)}</span></span>
              </Link></li>
            ))}
          </ul>
          <p className="mt-6 flex flex-wrap items-center gap-2 text-slate-600">
            <span>📖 {t("Reading reports are inside each reading program:")}</span>
            {READING_REPORT_LINKS.map((l) => <Link key={l.href} prefetch={false} href={l.href} className="inline-flex min-h-11 items-center rounded-full bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">{l.label}</Link>)}
          </p>
        </>
      )}
      {view === "progress" && <ProgressView actor={actor} name={name} t={t} goalMsg={sp.goal} />}
      {view === "family" && <FamilyView actor={actor} name={name} t={t} />}
    </AppShell>
  );
}

/** 📈 My progress: where I am, my next step, my week, my learning path, and every skill to practise (old My Skills). */
async function ProgressView({ actor, name, t, goalMsg }: { actor: Actor; name: string; t: TFn; goalMsg?: string }) {
  const id = actor.studentId!;
  let p = (await profilesOf(repo, [id])).get(id) ?? null;
  if (!p) { await buildProfiles(repo, String(actor.schoolId), new Date(), [id]).catch(() => 0); p = (await profilesOf(repo, [id])).get(id) ?? null; }
  const student = await repo.findUnique("Student", { id });
  const [[risk], step, wk, streak, skills, challenge, mine] = await Promise.all([
    risksOf(repo, String(actor.schoolId), [id]), nextStep(repo, actor), studentWeek(repo, actor).catch(() => null), streakAndPoints(repo, id),
    mySkills(repo, actor).catch(() => ({ assigned: [] as MySkill[], free: [] as { kind: string; skills: MySkill[] }[] })),
    student?.gradeId ? classChallenge(repo, String(student.schoolId), String(student.gradeId)).catch(() => []) : Promise.resolve([] as Awaited<ReturnType<typeof classChallenge>>),
    repo.findMany("ClassMembership", { studentId: id, leftAt: null }, { select: ["classId"], take: 1 }),
  ]);
  const i = p?.intelligence ?? null;
  const fc = forecast(i?.developing ?? [], i?.growthPerWeek ?? null, { rit: p?.predictedReading ?? null, goal: p?.goalReading ?? null, current: p?.estReadingRit ?? p?.readingRit ?? null, weeksToTerm: 12 });
  const tips = (risk?.reasons ?? []).map((r) => TIPS[r.key]).filter(Boolean).slice(0, 2);
  const skill = (k: MySkill) => (
    <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
      <span className="min-w-0 font-semibold text-brand-navy"><bdi>{k.name}</bdi></span>
      <span className="flex gap-2">
        <Link prefetch={false} href={`/practice/${k.id}${k.assigned ? "" : "?from=free"}`} className="inline-flex min-h-11 items-center rounded-xl bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 transition hover:ring-brand-teal">{t("Practise")}</Link>
        <Link prefetch={false} href={`/game/${k.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-brand-gold px-3 text-sm font-semibold text-brand-navy">{t("Play")}</Link>
      </span>
    </li>
  );
  return (
    <>
      <ReportHeader back={{ href: "/student/reports", label: "My Reports" }} icon="📈" title="My progress" subtitle={t("How I am doing and what to learn next")} who={name} />
      <AtAGlance title={null} items={[
        { icon: "📍", label: "Where I am", value: <span className="text-2xl">{t(WHERE[p?.level ?? "UNKNOWN"] ?? WHERE.UNKNOWN)}</span>, meaning: i ? t("{m} skills mastered · {g} growing", { m: i.mastered.length, g: i.developing.length }) : undefined, tone: p?.level ? "good" : "neutral" },
        { icon: "🔮", label: "My next MAP", value: p?.predictedReading ? `≈ ${p.predictedReading}` : "—", meaning: p?.goalReading ? <>{t("My goal")}: {p.goalReading}{fc.weeksToGoal !== null ? ` · ${t("about {n} weeks at my pace", { n: fc.weeksToGoal })}` : ""}</> : t("Your teacher will add your MAP score."), tone: "info" },
        { icon: "📈", label: "My pace", value: i?.growthPerWeek !== null && i?.growthPerWeek !== undefined ? `+${i.growthPerWeek}` : "—", meaning: t("mastery points a week · {n} practice days in 2 weeks", { n: p?.practiceDays14 ?? 0 }), tone: (p?.practiceDays14 ?? 0) >= 5 ? "good" : "warn" },
      ]} />
      <Callout kind="meaning" className="mb-4" items={[
        t("“Mastered” means I can do the skill well again and again."),
        t("My pace is how fast my skills grow each week. Practising more days makes it faster."),
      ]} />
      {tips.length > 0 && <Callout kind="next" title="What will help me most" items={tips.map((x) => t(x))} className="mb-4" />}
      {step.href && <Link prefetch={false} href={step.href} className="lift mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gradient-to-r from-brand-navy via-[#2c4f8c] to-brand-purple p-5 text-white shadow-pop"><span><span className="block text-xs font-semibold uppercase tracking-wider text-indigo-200">▶ {t("My Next Step")}</span><span className="block text-2xl font-semibold">{step.title}</span><span className="block text-sm text-indigo-100">{step.why}</span></span><span className="inline-flex min-h-11 items-center rounded-2xl bg-white px-5 font-semibold text-brand-navy">{step.cta} ▶</span></Link>}

      <ReportSection id="my-week" title="My Week" icon="📅">
        {goalMsg && <p className="mb-2 text-sm text-emerald-800">{String(goalMsg).slice(0, 200)}</p>}
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-orange-50 px-3 py-1 font-semibold text-orange-900 ring-1 ring-orange-200">🔥 {t("{n}-day streak", { n: streak.streak })}</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-900 ring-1 ring-amber-200">⭐ {t("{n} points", { n: streak.points.toLocaleString("en") })}</span>
        </div>
        {wk && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-sky-50 p-4">
              <h3 className="font-semibold text-brand-navy">🎯 {t("My goal this week")}</h3>
              {wk.mine ? (
                <><p className="mt-1 text-2xl font-semibold text-brand-navy">{wk.mine.progress} / {wk.mine.target} <span className="text-base font-normal text-slate-500">{t(wk.mine.kind === "MINUTES" ? "minutes" : "answers")}</span> {wk.mine.done ? "🎉" : ""}</p>{bar(wk.mine.progress, wk.mine.target)}</>
              ) : (
                <form action={setMyGoalAction} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <input name="target" type="number" min={5} max={600} defaultValue={50} aria-label={t("My goal this week")} className="min-h-11 w-20 rounded-lg border border-slate-300 px-2" />
                  <select name="kind" aria-label={t("My goal this week")} className="min-h-11 rounded-lg border border-slate-300 px-2"><option value="ANSWERS">{t("answers")}</option><option value="MINUTES">{t("minutes")}</option></select>
                  <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Set my goal")}</button>
                </form>
              )}
              <p className="mt-2 text-xs text-slate-500">{t("This week: {a} answers · {m} min", { a: wk.answers, m: wk.minutes })}</p>
            </div>
            <div className="rounded-2xl bg-violet-50 p-4">
              <h3 className="font-semibold text-brand-navy">👥 {t("Our class goal")}</h3>
              {wk.klass ? <><p className="mt-1 text-2xl font-semibold text-brand-navy">{wk.klass.progress} / {wk.klass.target} {wk.klass.done ? "🎉" : ""}</p>{bar(wk.klass.progress, wk.klass.target)}</> : <p className="mt-1 text-sm text-slate-500">{t("Nothing here yet")}</p>}
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <h3 className="font-semibold text-brand-navy">📅 {t("Practice days")}</h3>
              {wk.rhythm ? <><p className="mt-1 text-2xl font-semibold text-brand-navy">{wk.rhythm.daysDone} / {wk.rhythm.days}</p><Meter className="mt-2" value={wk.rhythm.daysDone} total={wk.rhythm.days} /></> : <p className="mt-1 text-sm text-slate-500">{t("Practise a little every day.")}</p>}
            </div>
          </div>
        )}
        {challenge.length > 0 && (
          <div className="mt-4 rounded-2xl bg-indigo-50/60 p-4 ring-1 ring-indigo-100">
            <h3 className="font-semibold text-brand-navy">🏁 {t("Class challenge this week")}</h3>
            <ol className="mt-2 space-y-1">{challenge.map((c) => <li key={c.classId} className={`flex items-center justify-between rounded-xl px-3 py-1.5 ${c.classId === mine[0]?.classId ? "bg-indigo-600 font-semibold text-white" : "bg-white ring-1 ring-slate-200"}`}><span>{c.rank}. <bdi>{c.name}</bdi></span><span className="tabular-nums">{c.perStudent}</span></li>)}</ol>
          </div>
        )}
      </ReportSection>

      {i && i.path.length > 0 && (
        <ReportSection title="My learning path" icon="🧭" className="mt-4">
          <ol className="space-y-2">{i.path.map((x, k) => <li key={x.skillId + k} className="flex items-center gap-2"><span className="tabular-nums text-slate-400">{k + 1}</span>{x.action === "FOUNDATION" ? "🧱" : x.action === "REVIEW" ? "🔁" : x.action === "STRETCH" ? "🚀" : "🎯"}<Link prefetch={false} href={`/practice/${x.skillId}`} className="inline-flex min-h-11 items-center font-semibold text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link></li>)}</ol>
        </ReportSection>
      )}
      {fc.skills.length > 0 && (
        <ReportSection title="Skills I am growing" icon="🌱" className="mt-4">
          <ul className="grid gap-2 sm:grid-cols-2">{fc.skills.map((x) => <li key={x.name} className="rounded-xl bg-slate-50 px-3 py-2 text-sm"><b><bdi>{x.name}</bdi></b><br /><span className="text-xs text-slate-600">{x.weeks !== null ? t("about {n} weeks at my pace", { n: x.weeks }) : t("Practise a little every day.")}</span></li>)}</ul>
        </ReportSection>
      )}

      <section id="skills" aria-labelledby="skills-h" className="mt-4 scroll-mt-24 rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6">
        <h2 id="skills-h" className="text-xl font-semibold text-brand-navy">🧩 {t("My Skills")}</h2>
        <p className="text-sm text-slate-600">{t("Pick any skill to practise or play — it opens at the right level for you.")}</p>
        {skills.assigned.length > 0 && <><h3 className="mt-3 font-semibold text-brand-navy">⭐ {t("From my teacher")}</h3><ul className="mt-2 grid gap-2 md:grid-cols-2">{skills.assigned.map(skill)}</ul></>}
        {skills.free.map((g) => (
          <details key={g.kind} className="mt-3 rounded-2xl bg-slate-50 p-3">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-navy">{t(g.kind)} ({g.skills.length})</summary>
            <ul className="mt-2 grid gap-2 md:grid-cols-2">{g.skills.map(skill)}</ul>
          </details>
        ))}
      </section>
      <p className="mt-4"><Link prefetch={false} href="/student/comments" className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-200">💬 {t("Comments from My Teachers")}</Link></p>
    </>
  );
}

/** 👪 For my family (old Family Report): reports from the school, this week, MAP, teacher, diagnostic, reading — with the English | Arabic switch. */
async function FamilyView({ actor, name, t }: { actor: Actor; name: string; t: TFn }) {
  const id = actor.studentId!;
  const [shared, m, week, diag, coach, reports] = await Promise.all([
    isReportShared(repo, String(actor.schoolId), id), myMap(repo, actor).catch(() => ({ subjects: [], plans: [] })), weekStats(repo, id),
    studentDiagnosticReport(repo, actor, id).catch(() => null), coachSummary(repo, id), approvedForFamily(repo, actor, id).catch(() => []),
  ]);
  const hasMap = m.subjects.some((x) => x.profile.term);
  const card = "lift flex min-h-24 items-start gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200";
  const off = (icon: string, title: string, text: string) => <div className={`${card} opacity-70`}><span className="text-4xl" aria-hidden="true">{icon}</span><span><span className="block text-lg font-semibold text-slate-600">{t(title)}</span><span className="block text-sm text-slate-500">{t(text)}</span></span></div>;
  return (
    <>
      <ReportHeader back={{ href: "/student/reports", label: "My Reports" }} icon="👪" title="For my family" subtitle={t("Show these to your family. Open one, then use Download PDF / Print.")} who={name}>
        <LangSwitch />
      </ReportHeader>
      {reports.length > 0 && (
        <ReportSection title="Reports from the school" icon="📬" className="mb-4">
          <ul className="space-y-2">{reports.map((r) => (
            <li key={r.id}><Link prefetch={false} href={`/family-report/${r.id}`} className="lift flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
              <span><span className="block font-semibold text-brand-navy">{r.title}</span><span className="block text-sm text-slate-600">{r.content.summary.slice(0, 140)}{r.content.summary.length > 140 ? "…" : ""}</span></span>
              <span className="text-sm text-slate-500">{r.reviewedAt}{!r.seenByStudentAt ? " · 🆕" : ""}</span>
            </Link></li>
          ))}</ul>
        </ReportSection>
      )}
      <section aria-labelledby="fam-week-h" className="mb-4 rounded-3xl bg-gradient-to-r from-teal-50 to-sky-50 p-5 ring-1 ring-teal-200">
        <h2 id="fam-week-h" className="text-lg font-semibold text-brand-navy">🗓️ {t("This Week")}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Weekly goal", `${Math.min(week.partsDone, week.partsGoal)}/${week.partsGoal}`], ["Answers", String(week.answers)], ["Minutes", String(week.minutes)], ["Days active", `${week.days}/7`]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs font-semibold text-slate-500">{t(k)}</dt><dd className="text-2xl font-semibold tabular-nums text-brand-navy">{v}</dd></div>
          ))}
        </dl>
        {week.parts.length > 0 && <p className="mt-3 text-sm text-slate-700">✅ {week.parts.join(" · ")}</p>}
      </section>
      <ul className="grid gap-4 md:grid-cols-2">
        <li>{hasMap ? <Link prefetch={false} href={`/map-report/family/${id}`} className={card}><span className="text-4xl" aria-hidden="true">📈</span><span><span className="block text-lg font-semibold text-brand-navy">{t("MAP Family Report")}</span><span className="block text-sm text-slate-600">{t("My MAP scores, my goal and what they mean.")}</span></span></Link> : off("📈", "MAP Family Report", "Appears when your MAP results are added.")}</li>
        <li>{shared ? <Link prefetch={false} href="/student/family/teacher-report" className={card}><span className="text-4xl" aria-hidden="true">📄</span><span><span className="block text-lg font-semibold text-brand-navy">{t("Report from My Teacher")}</span><span className="block text-sm text-slate-600">{t("My teacher’s report about my progress, strengths and what to practise next.")}</span></span></Link> : off("📄", "Report from My Teacher", "Appears when your teacher shares it.")}</li>
        <li>{diag ? <Link prefetch={false} href="/student/family/diagnostic" className={card}><span className="text-4xl" aria-hidden="true">📝</span><span><span className="block text-lg font-semibold text-brand-navy">{t("My Diagnostic Report")}</span><span className="block text-sm text-slate-600">{diag.pct}% · {t("My strengths and next steps.")}</span></span></Link> : off("📝", "My Diagnostic Report", "Appears when your teacher shares it.")}</li>
        <li><Link prefetch={false} href="/student/fluency-coach#my-report" className={card}><span className="text-4xl" aria-hidden="true">🎙️</span><span><span className="block text-lg font-semibold text-brand-navy">{t("Reading Fluency")}</span><span className="block text-sm text-slate-600">{coach.latest ? t("{n} words correct per minute ({date})", { n: coach.latest.wcpm, date: coach.latest.date }) : t("No 1-minute check yet.")}{coach.plan ? ` · ${t("Goal")} ${coach.plan.goal}` : ""}</span></span></Link></li>
        <li><Link prefetch={false} href={`/map-report/study-plan/${id}`} className={card}><span className="text-4xl" aria-hidden="true">🧭</span><span><span className="block text-lg font-semibold text-brand-navy">{t("My Study Plan")}</span><span className="block text-sm text-slate-600">{t("The skills to work on next, from my MAP results.")}</span></span></Link></li>
      </ul>
    </>
  );
}
