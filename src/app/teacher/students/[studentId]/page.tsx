import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ForbiddenError } from "@/server/auth/rbac";
import { StudentRewardsPanel } from "@/components/motivation/teacher-rewards";
import { staffClassOf } from "@/server/motivation/coins";
import { LearningPathView } from "@/components/student/learning-path-view";
import { AppShell } from "@/components/app-shell";
import { teacherStudentData } from "@/server/teacher/page-data";
import { StudentDetailView } from "@/components/teacher/student-detail";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { ResetPasswordButton } from "./reset-password-button";
import { StudentAnalyticsView } from "@/components/analytics/student-analytics";
import { MapComparisonView } from "@/components/analytics/map-comparison";
import { ReportDownloads } from "@/components/reports/report-downloads";
import { FamilyReportPanel } from "@/components/reports/family-report-panel";
import { StudentProfileCard } from "@/components/insights/student-profile-card";
import { EmptyState, SourceTag, StatusPill } from "@/components/ui-kit";
import { AtAGlance, Callout, InfoTip, ReportHeader, ReportIntro, ReportSummary, toneOfPct } from "@/components/report-kit";
import { GLOSSARY } from "@/lib/report-columns";
import { studentFileSummary } from "@/lib/report-summaries";
import { studentEffort } from "@/server/practice/guessing";
import { MASTERED_AT, NEEDS_BELOW } from "@/server/teacher/student-profile";
import type { MapSummary } from "@/server/insights/student-data";
import { writingResults } from "@/server/writing/locked";
import { studentFileInsights } from "@/server/insights/student-file-insights";
import { TREND_ARROW } from "@/server/insights/language-strands";
import { commentsFor } from "@/server/teacher/classroom";
import { notesFor, quickComments } from "@/server/teacher/extras";
import { InsightActions } from "@/components/teacher/insight-actions";
import { ReadRiseLevelChart } from "@/components/insights/readrise-level-chart";
import { Combo } from "@/components/ui/combo";
import { addCommentAction, addNoteAction, deleteCommentAction, deleteNoteAction } from "./comment-actions";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh" }) : "—");
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

/**
 * 🧑‍🎓 The ONE student file (owner r67: Reports → Students): every student name on the teacher pages opens this page;
 * the older "Student Progress" (/teacher/progress/[id]) and "Student file" (/admin/student-file/[id]) pages redirect
 * here. Overview → Language profile (the seven strands: level, skills mastered x of y, trend, next step) → Mistakes
 * and the real gap → Compared with the class (staff only) → My Work → Plans → Tests → MAP → ReadRise level → Skills →
 * Follow-up (alerts, comments to the student and parent, private notes) → Reports → the detailed history.
 * Access: the teacher's own classes; the admin: the school (typed URLs refused on the server).
 */
export default async function StudentPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const { studentId } = await params;
  const sp = await searchParams;
  const me = (await getActor())!.user;
  const { t } = await getT();
  // the detail (access check) first, then every section at once (Update 42B): src/server/teacher/page-data.ts
  // a grade coordinator opening another teacher's student gets the read-only summary (the file is the class teacher's)
  const data = await teacherStudentData(repo, actor, studentId).catch((e) => { if (e instanceof ForbiddenError && actor.role === "TEACHER") return null; throw e; });
  if (!data) redirect(`/admin/student-file/${encodeURIComponent(studentId)}`);
  const { d, st, member, analytics, profile, tier, reports, path, mapCompare, extras: x } = data;
  const classId = member ? String(member.classId) : null;
  // ✍️ graded writing (rubric score %) + the language profile, mistakes, class comparison and follow-up (one read each)
  // 🧠 effort (r67, teacher-only): answers given with care in the last 30 days; Unreliable sessions (> 20 % guesses)
  const [writing, ins, comments, notes, quick, effort] = await Promise.all([
    classId ? writingResults(repo, actor, classId, { studentId, limit: 20 }).catch(() => null) : Promise.resolve(null),
    studentFileInsights(repo, actor, studentId, { classId, name: String(d.name ?? "") }),
    commentsFor(repo, actor, studentId).catch(() => []),
    notesFor(repo, actor, studentId).catch(() => []),
    quickComments(repo, actor).catch(() => [] as string[]),
    studentEffort(repo, studentId).catch(() => null),
  ]);
  const myWriting = writing ? writing.tasks.filter((k) => writing.rows[0]?.pct[k.id] !== undefined).map((k) => ({ ...k, pct: writing.rows[0].pct[k.id] })) : [];
  const mastered = d.skills.filter((k) => k.score >= MASTERED_AT || /master/i.test(k.band)).sort((a, b) => b.score - a.score);
  const needed = d.skills.filter((k) => k.score < NEEDS_BELOW && !/master/i.test(k.band)).sort((a, b) => a.score - b.score);
  const avgTest = x.tests.completed.filter((c) => c.pct !== null);
  const testAvg = avgTest.length ? Math.round(avgTest.reduce((n, c) => n + (c.pct ?? 0), 0) / avgTest.length) : null;
  const noPractice = x.answers.correct + x.answers.incorrect === 0;
  const card = "rk-section mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6";
  const h2 = "text-lg font-semibold text-brand-navy";
  const sections = [["overview", "Overview"], ["strands", "Language profile"], ["mistakes", "Mistakes"], ["class", "Compared with the class"], ["work", "My Work"], ["plans", "Plans"], ["tests", "Tests"], ["map", "MAP"], ["readrise", "ReadRise level"], ["skills", "Skills"], ["followup", "Follow-up"], ["rewards", "Rewards"], ["reports", "Reports"], ["summary", "Summary"], ["details", "More details"]] as const;
  const target = { classId, studentId };
  const LEVEL_UI: Record<string, { label: string; tone: string }> = { BELOW: { label: "Below", tone: "bg-rose-50 text-rose-800 ring-rose-200" }, ON: { label: "On", tone: "bg-sky-50 text-sky-800 ring-sky-200" }, ABOVE: { label: "Above", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" } };
  const first = String(d.name ?? "").split(" ")[0];
  const MapCard = ({ label, m }: { label: string; m: MapSummary | null }) => (
    <div className="rounded-xl p-4 ring-1 ring-slate-200">
      <p className="flex items-center gap-2 font-semibold text-slate-800"><SourceTag source="MAP" size="sm" /> {t(label)}</p>
      {!m || !m.latest ? <p className="mt-2 text-sm text-slate-600">{t("No MAP score yet.")}</p> : (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">{t("RIT")}</dt><dd className="font-semibold tabular-nums" dir="ltr">{m.latest.rit} <span className="font-normal text-slate-500">({m.latest.term})</span></dd>
          {m.latest.percentile !== null && <><dt className="text-slate-500">{t("Percentile")}</dt><dd className="tabular-nums" dir="ltr">{m.latest.percentile}</dd></>}
          {m.springTarget !== null && <><dt className="text-slate-500">{t("Spring projection")}</dt><dd className="tabular-nums" dir="ltr">{m.springTarget}</dd></>}
          {m.lexile !== null && <><dt className="text-slate-500">MAP Lexile</dt><dd className="tabular-nums" dir="ltr">{m.lexile}L</dd></>}
          {m.goals.length > 0 && <><dt className="text-slate-500">{t("Weakest areas")}</dt><dd data-content lang="en">{m.goals.slice(0, 2).map((g) => `${g.name} ${g.rit}`).join(" · ")}</dd></>}
        </dl>
      )}
    </div>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: classId ? `/teacher/classes/${classId}` : "/teacher", label: "My Students" }} icon="🧑‍🎓" title={String(d.name)}
        subtitle={<>{t("Student number")} <span dir="ltr">{d.studentNumber}</span>{tier ? <> · <Link prefetch={false} href={`/teacher/tiers/${studentId}`} className="font-semibold text-brand-teal hover:underline">{`Tier ${tier.tier}`}</Link></> : null}</>}
        who={<>{t("Grade {n}", { n: d.grade })}{d.className ? <> · <bdi>{d.className}</bdi></> : null}</>} when={<>{t("Last active")}: <span dir="ltr">{day(x.time.lastActive)}</span></>}
        filters={<nav aria-label={t("On this page")} className="flex gap-2 overflow-x-auto pb-1">
          {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">{t(label)}</a>)}
          <Link prefetch={false} href={`/teacher/student-view?student=${encodeURIComponent(studentId)}`} className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-sky-700 px-3 text-sm font-semibold text-white">👀 {t("Preview as student")}</Link>
        </nav>} />

      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      <ReportIntro text="Everything about this student in one page: results, skills, work, MAP and follow-up." />
      {/* no answer yet (Teacher Home → Needs attention → "Open" lands here): say so plainly, with the next step */}
      {noPractice && (
        <section id="start" aria-labelledby="start-h" className="mb-5 flex scroll-mt-20 flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="min-w-0">
            <h2 id="start-h" className="text-lg font-semibold text-amber-950">{t("No practice yet — assign a skill")}</h2>
            <p className="mt-0.5 text-sm text-amber-900">{t("{name} has not answered any question yet. Assign a skill to start; it appears in the student's My Work at once.", { name: String(d.name) })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link prefetch={false} href={`/teacher/plans?${new URLSearchParams([["tab", "custom"], ...(classId ? [["classId", classId]] : []), ["who", "student"], ["sid", studentId]])}`} className="inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white hover:opacity-90">{t("Assign a skill")}</Link>
            <a href="#work" className="inline-flex min-h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-brand-navy ring-1 ring-amber-200 hover:ring-brand-teal">{t("My Work")} · <span dir="ltr" className="ms-1">{x.work.items.length}</span></a>
          </div>
        </section>
      )}

      <section id="overview" aria-label={t("Overview")} className="scroll-mt-20">
        <AtAGlance items={[
          { icon: "📘", label: "My Work done", value: `${x.work.done} / ${x.work.items.length}`, meaning: t("{n} not started", { n: x.work.notStarted }), tone: x.work.items.some((w) => w.overdue) ? "warn" : "neutral" },
          { icon: "🎯", label: "Accuracy", value: x.answers.accuracy === null ? "—" : `${x.answers.accuracy}%`, meaning: t("{c} correct · {i} not correct", { c: x.answers.correct, i: x.answers.incorrect }), tone: toneOfPct(x.answers.accuracy) },
          { icon: "⏱️", label: "Time spent", value: mins(x.time.totalMinutes), meaning: <>{t("This week")}: <span dir="ltr">{mins(x.time.weekMinutes)}</span> · {t("This month")}: <span dir="ltr">{mins(x.time.monthMinutes)}</span></> },
          { icon: "📝", label: "Test average", value: testAvg === null ? "—" : `${testAvg}%`, tone: toneOfPct(testAvg) },
          { icon: "🧩", label: "Skills", value: `${mastered.length} ✓ · ${needed.length} ↻`, meaning: t("{m} mastered · {n} need work", { m: mastered.length, n: needed.length }) },
          { icon: "🧠", label: "Effort", value: effort?.effort === null || !effort ? "—" : `${effort.effort}%`, meaning: effort?.unreliableSessions ? t("{n} unreliable sessions", { n: effort.unreliableSessions }) : t("answers given with care"), tone: !effort || effort.effort === null ? "neutral" : effort.effort < 80 ? "warn" : "good" },
        ]} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Callout kind="meaning" items={[
            x.answers.accuracy !== null ? (x.answers.accuracy >= 80 ? t("Strong accuracy: most answers are right.") : x.answers.accuracy >= 60 ? t("Getting there: about two answers in three are right.") : t("Needs help: fewer than 6 answers in 10 are right.")) : t("No answers yet."),
            x.time.weekMinutes === 0 ? t("No practice this week yet.") : null,
          ]} />
          <Callout kind="next" items={[
            needed[0] ? <>{t("Practise")} <b data-content lang="en">{needed[0].name}</b> ({needed[0].score})</> : null,
            x.work.items.some((w) => w.overdue) ? t("Talk with the student about the late work.") : null,
            effort?.unreliableSessions && classId ? <Link prefetch={false} href={`/teacher/practice-analytics?classId=${encodeURIComponent(classId)}&student=${encodeURIComponent(studentId)}`} className="underline">{t("Talk with the student about guessing: see the sessions")}</Link> : null,
            x.tests.toDo.length ? t("{n} test(s) to do.", { n: x.tests.toDo.length }) : null,
          ]}>{!needed.length && !x.work.items.some((w) => w.overdue) && !x.tests.toDo.length ? t("Keep the daily practice going.") : null}</Callout>
        </div>
      </section>

      {/* 🧭 the language profile: seven strands, one row each (level is for staff only) */}
      <section id="strands" className={`${card} scroll-mt-20`} aria-labelledby="strands-h">
        <h2 id="strands-h" className={h2}><span aria-hidden="true">🧭</span> {t("Language profile")} <InfoTip text={GLOSSARY["Language profile"]} /> <span className="text-sm font-normal text-slate-500">· {t("Staff only")}</span></h2>
        <div className="rk-box mt-3">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr><th className="p-2 text-start">{t("Strand")}</th><th className="p-2 text-start">{t("Level")}</th><th className="p-2 text-start">{t("Skills mastered")}</th><th className="p-2 text-start">{t("Trend (4 weeks)")}</th><th className="p-2 text-start">{t("Next step")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{ins.strands.map((r) => (
              <tr key={r.key} data-strand={r.key}>
                <td className="p-2 font-medium"><span aria-hidden="true">{r.icon}</span> {t(r.label)}</td>
                <td className="p-2">{r.level ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${LEVEL_UI[r.level].tone}`}>{t(LEVEL_UI[r.level].label)}</span> : <span className="text-slate-400">—</span>}</td>
                <td className="p-2 tabular-nums" dir="ltr">{r.total !== null ? `${r.mastered} / ${r.total}` : r.wcpm ? `${r.wcpm} WCPM` : "—"}</td>
                <td className={`p-2 text-lg font-bold ${r.trend === "up" ? "text-emerald-700" : r.trend === "down" ? "text-rose-700" : "text-slate-400"}`} title={t(r.trend === "up" ? "Going up" : r.trend === "down" ? "Going down" : "Steady")}>{TREND_ARROW[r.trend]}</td>
                <td className="p-2">{r.next ? (r.next.skillId && classId ? <Link prefetch={false} href={`/teacher/skill-assign?${new URLSearchParams({ skillId: r.next.skillId, classId })}`} className="font-medium text-brand-navy underline-offset-2 hover:underline" data-content lang="en">{r.next.text}</Link> : <span data-content={r.next.skillId ? true : undefined} lang={r.next.skillId ? "en" : undefined}>{r.next.skillId ? r.next.text : t(r.next.text)}</span>) : <span className="text-slate-400">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {/* 🔍 the main mistake in plain words, and the real gap underneath (prerequisites) */}
      <section id="mistakes" className={`${card} scroll-mt-20`} aria-labelledby="mistakes-h">
        <h2 id="mistakes-h" className={h2}><span aria-hidden="true">🔍</span> {t("Mistakes and the real gap")} <InfoTip text={GLOSSARY["Mistakes and the real gap"]} /></h2>
        {!ins.mistake && !ins.rootCauses.length ? <p className="mt-2 text-sm text-slate-600">{t("No repeated mistake and no gap underneath right now.")}</p> : (
          <ul className="mt-3 space-y-3">
            {ins.mistake && (
              <li className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <p className="font-semibold text-amber-950">{t("{name} {mistake} — {n} of the last {m} wrong answers.", { name: first, mistake: ins.mistake.label.charAt(0).toLowerCase() + ins.mistake.label.slice(1), n: ins.mistake.count, m: ins.mistake.of })}</p>
                <p className="mt-1 text-sm text-amber-900">💡 <span data-content lang="en">{ins.mistake.fix}</span></p>
                <InsightActions t={t} target={target} className="mt-2" />
              </li>
            )}
            {ins.rootCauses.map((c) => (
              <li key={`${c.prereqId}${c.skillId}`} className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
                <p className="font-semibold text-sky-950">{c.prereqMastery !== null ? t("The real gap is {skill} ({pct}%), which {target} depends on.", { skill: c.prereqName, pct: c.prereqMastery, target: c.skillName }) : t("The real gap is {skill}, which {target} depends on.", { skill: c.prereqName, target: c.skillName })}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {classId && <Link prefetch={false} href={`/teacher/skill-assign?${new URLSearchParams({ skillId: c.prereqId, classId })}`} className="inline-flex min-h-9 items-center rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white hover:opacity-90">{t("Assign {skill}", { skill: c.prereqName })}</Link>}
                  <InsightActions t={t} target={{ ...target, skillId: c.prereqId }} only={["plan", "group", "lesson"]} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 👥 against the class: teachers and admins only (never shown to the student or the family) */}
      <section id="class" className={`${card} scroll-mt-20`} aria-labelledby="class-h">
        <h2 id="class-h" className={h2}><span aria-hidden="true">👥</span> {t("Compared with the class")} <InfoTip text={GLOSSARY["Compared with the class"]} /> <span className="text-sm font-normal text-slate-500">· {t("Staff only")}</span></h2>
        {!ins.peer ? <p className="mt-2 text-sm text-slate-600">{t("Not enough answers yet to compare.")}</p> : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl p-4 ring-1 ring-slate-200"><p className="text-sm text-slate-500">{t("Position")}</p><p className="text-xl font-bold text-brand-navy">{ins.peer.position ? t(ins.peer.position === "above" ? "Above the class middle" : ins.peer.position === "below" ? "Below the class middle" : "Around the class middle") : "—"}</p></div>
            <div className="rounded-2xl p-4 ring-1 ring-slate-200"><p className="text-sm text-slate-500">{t("Growth this month")}</p><p className="text-xl font-bold text-brand-navy">{ins.peer.fasterThan === null ? "—" : <>{t("Progressing faster than {n}% of classmates", { n: ins.peer.fasterThan })} <span className={ins.peer.fasterThan >= 50 ? "text-emerald-700" : "text-rose-700"}>{ins.peer.fasterThan >= 50 ? "↑" : "↓"}</span></>}</p><p className="text-sm text-slate-500">{t("{n} new stars this month", { n: ins.peer.newStars })}</p></div>
          </div>
        )}
      </section>

      <section id="work" className={`${card} scroll-mt-20`} aria-labelledby="work-h">
        <h2 id="work-h" className={h2}><span aria-hidden="true">📘</span> {t("My Work")} <InfoTip text={GLOSSARY["My Work"]} /> <span className="text-sm font-normal text-slate-500">· {t("{n} not started", { n: x.work.notStarted })} · {t("{n} in progress", { n: x.work.inProgress })} · {t("{n} done", { n: x.work.done })}</span></h2>
        {x.work.items.length === 0 ? <div className="mt-3"><EmptyState compact icon="📭" title="Nothing here yet" /></div> : (
          <div className="rk-box rk-tall mt-3">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr><th className="p-2 text-start">{t("Skill")}</th><th className="p-2 text-start">{t("From")}</th><th className="p-2 text-start">{t("Status")}</th><th className="p-2 text-start">{t("Due")}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{x.work.items.map((w) => (
                <tr key={w.assignmentId}><td className="p-2" data-content lang="en">{w.skill}</td><td className="p-2"><SourceTag source={w.sourceKey} size="sm" /></td><td className="p-2"><StatusPill status={w.status === "Done" ? "DONE" : w.status === "In progress" ? "IN_PROGRESS" : "NOT_STARTED"} />{w.overdue && <span className="ms-2 text-xs font-semibold text-red-700">{t("Late")}</span>}</td><td className="p-2 tabular-nums" dir="ltr">{day(w.dueAt)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section id="plans" className={`${card} scroll-mt-20`} aria-labelledby="plans-h">
        <h2 id="plans-h" className={h2}><span aria-hidden="true">🗂️</span> {t("Plans")} <InfoTip text={GLOSSARY["Student plans"]} /></h2>
        {x.plans.length === 0 ? <div className="mt-3"><EmptyState compact icon="🗂️" title="No plans yet" action={classId ? { href: `/teacher/plans?classId=${classId}`, label: "Plans" } : undefined} /></div> : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{x.plans.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200"><span className="min-w-0"><SourceTag source={p.sourceKey} size="sm" /> <span className="font-medium" data-content lang="en">{p.title}</span></span><span className="shrink-0 text-sm tabular-nums text-slate-600" dir="ltr">{p.done}/{p.parts}</span></li>
          ))}</ul>
        )}
      </section>

      <section id="tests" className={`${card} scroll-mt-20`} aria-labelledby="tests-h">
        <h2 id="tests-h" className={h2}><span aria-hidden="true">📝</span> {t("Tests and scores")} <InfoTip text={GLOSSARY["Tests and scores"]} /></h2>
        {x.tests.toDo.length + x.tests.completed.length === 0 ? <div className="mt-3"><EmptyState compact icon="📝" title="No results yet" /></div> : (
          <div className="rk-box rk-tall mt-3">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr><th className="p-2 text-start">{t("Test")}</th><th className="p-2 text-start">{t("Type")}</th><th className="p-2 text-start">{t("Score")}</th><th className="p-2 text-start">{t("Date")}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {x.tests.completed.map((c) => (
                  <tr key={c.assignmentId}><td className="p-2">{x.testOf[c.assignmentId] ? <Link prefetch={false} href={`/teacher/assessments/${x.testOf[c.assignmentId]}/review/${c.assignmentId}/${studentId}`} className="font-medium text-brand-navy underline" data-content lang="en">{c.title}</Link> : <span data-content lang="en">{c.title}</span>}</td><td className="p-2"><SourceTag source={c.tag} size="sm" /></td><td className="p-2 tabular-nums" dir="ltr">{c.pct === null ? "—" : `${c.pct}% (${c.correct}/${c.questions})`}</td><td className="p-2 tabular-nums" dir="ltr">{day(c.completedAt)}</td></tr>
                ))}
                {x.tests.toDo.map((c) => (
                  <tr key={c.assignmentId}><td className="p-2" data-content lang="en">{c.title}</td><td className="p-2"><SourceTag source={c.tag} size="sm" /></td><td className="p-2"><StatusPill status="NOT_STARTED" /></td><td className="p-2 tabular-nums" dir="ltr">{c.dueAt ? t("Due {date}", { date: day(c.dueAt) }) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {myWriting.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold text-brand-navy">✍️ {t("Writing results")} <InfoTip text={GLOSSARY["Writing results"]} /> <span className="text-sm font-normal text-slate-500">· {t("Average")} <span dir="ltr">{writing!.rows[0].average}%</span></span></h3>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">{myWriting.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 py-1.5">
                {w.locked ? <Link prefetch={false} href={`/teacher/writing/task/${w.id}/${studentId}`} className="font-medium text-brand-navy underline" data-content lang="en">🔒 {w.title}</Link> : <span data-content lang="en">{w.title}</span>}
                <span className="tabular-nums" dir="ltr">{w.pct}%</span>
              </li>
            ))}</ul>
          </div>
        )}
      </section>

      <section id="map" className={`${card} scroll-mt-20`} aria-labelledby="map-h">
        <h2 id="map-h" className={h2}><span aria-hidden="true">🗺️</span> {t("MAP results")} <InfoTip text={GLOSSARY["MAP results"]} /></h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2"><MapCard label="Reading" m={x.map.reading} /><MapCard label="Language Usage" m={x.map.language} /></div>
        <p className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link prefetch={false} href={`/map-report/profile/${studentId}`} className="font-semibold text-brand-teal hover:underline">{t("MAP Student Profile")}</Link>
          {classId && <Link prefetch={false} href={`/teacher/map-entry?classId=${classId}`} className="font-semibold text-brand-teal hover:underline">{t("Upload MAP Scores")}</Link>}
        </p>
        <div className="max-w-full overflow-x-auto"><MapComparisonView data={mapCompare} /></div>
      </section>

      {/* 🚀 ReadRise level growth (never called Lexile) */}
      <section id="readrise" className={`${card} scroll-mt-20`} aria-labelledby="readrise-h">
        <h2 id="readrise-h" className={h2}><span aria-hidden="true">🚀</span> {t("ReadRise level")} <InfoTip text={GLOSSARY["ReadRise level"]} /></h2>
        {!ins.readRise?.placed || !ins.readRise.history.length ? <p className="mt-2 text-sm text-slate-600">{t("No ReadRise level yet: the student starts with the placement reading.")}</p> : (
          <>
            <ReadRiseLevelChart t={t} history={ins.readRise.history} />
            {classId && <p className="mt-2 text-sm"><Link prefetch={false} href={`/teacher/readrise?${new URLSearchParams({ class: classId, student: studentId })}`} className="font-semibold text-brand-teal hover:underline">{t("ReadRise growth report")}</Link></p>}
          </>
        )}
      </section>

      <section id="skills" className={`${card} scroll-mt-20`} aria-labelledby="skills-h">
        <h2 id="skills-h" className={h2}><span aria-hidden="true">🧩</span> {t("Skills: mastered and needed")} <InfoTip text={GLOSSARY["Skills: mastered and needed"]} /></h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div><h3 className="font-semibold text-emerald-800">✓ {t("Mastered")} ({mastered.length})</h3>
            {mastered.length === 0 ? <p className="mt-1 text-sm text-slate-600">{t("Nothing to show yet")}</p> : <ul className="mt-1 space-y-1 text-sm">{mastered.slice(0, 15).map((k) => <li key={k.skillId} className="flex justify-between gap-2"><span data-content lang="en">{k.name}</span><span className="tabular-nums text-slate-500" dir="ltr">{k.score}</span></li>)}</ul>}
          </div>
          <div><h3 className="font-semibold text-amber-800">↻ {t("Needs work")} ({needed.length})</h3>
            {needed.length === 0 ? <p className="mt-1 text-sm text-slate-600">{t("Nothing to show yet")}</p> : <ul className="mt-1 space-y-1 text-sm">{needed.slice(0, 15).map((k) => <li key={k.skillId} className="flex justify-between gap-2"><span data-content lang="en">{k.name}</span><span className="tabular-nums text-slate-500" dir="ltr">{k.score}</span></li>)}</ul>}
          </div>
        </div>
      </section>

      {/* 🚨 follow-up: alerts and what was done, comments (the student and the parent read them), private notes */}
      <section id="followup" className={`${card} scroll-mt-20`} aria-labelledby="followup-h">
        <h2 id="followup-h" className={h2}><span aria-hidden="true">🚨</span> {t("Follow-up")} <InfoTip text={GLOSSARY["Follow-up"]} /></h2>
        <h3 className="mt-3 font-semibold text-brand-navy">{t("Alerts and what was done")} <InfoTip text={GLOSSARY["Alerts and what was done"]} /></h3>
        {!ins.alerts.length ? <p className="mt-1 text-sm text-slate-600">{t("No alerts.")}</p> : (
          <ul className="mt-2 space-y-1 text-sm">{ins.alerts.map((a) => (
            <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-1.5"><span dir="ltr">{a.date}</span> · <span aria-hidden="true">{a.icon}</span> <b>{t(a.title)}</b>: <span data-content lang="en">{a.detail}</span> — {a.status === "HANDLED" ? <span className="text-emerald-700">✅ <span data-content lang="en">{a.action}</span></span> : <Link prefetch={false} href={`/teacher/alerts?${new URLSearchParams(classId ? { classId } : {})}`} className="font-semibold text-red-700 underline">{t("not handled")}</Link>}</li>
          ))}</ul>
        )}
        <InsightActions t={t} target={target} className="mt-3" />
        <div id="comments" className="mt-5 scroll-mt-24">
          <h3 className="font-semibold text-brand-navy">💬 {t("Comments to the student and the parent")} <InfoTip text={GLOSSARY["Comments to the student and the parent"]} /></h3>
          {actor.role !== "SUPER_ADMIN" && (
            <form action={addCommentAction} className="mt-2 flex flex-wrap items-end gap-2 print:hidden">
              <input type="hidden" name="studentId" value={studentId} />
              <label className="flex min-w-[16rem] flex-1 flex-col text-sm font-semibold text-slate-700">{t("Comment")}<input name="body" list="quick-comments" required maxLength={2000} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 font-normal" /><span className="mt-1 flex items-center gap-1 text-xs font-normal text-slate-500"><input type="checkbox" name="keep" /> {t("save as one of my quick comments")}</span></label>
              <label className="flex flex-col text-sm font-semibold text-slate-700">{t("About (optional)")}<Combo name="assignmentId" label={t("About (optional)")} defaultValue="" options={[{ value: "", label: t("— general —") }, ...x.work.items.slice(0, 20).map((w) => ({ value: w.assignmentId, label: w.skill.slice(0, 60) }))]} className="mt-1 w-64 font-normal" /></label>
              <button className="min-h-10 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Send")}</button>
            </form>
          )}
          <datalist id="quick-comments">{quick.map((q) => <option key={q} value={q} />)}</datalist>
          {comments.length > 0 && <ul className="mt-2 space-y-2">{comments.map((c) => <li key={c.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="text-slate-500">{c.author} · <span dir="ltr">{c.createdAt.slice(0, 10)}</span>{c.assignment ? <> · <span data-content lang="en">{c.assignment}</span></> : null}{c.mine && <form action={deleteCommentAction} className="ms-2 inline print:hidden"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="studentId" value={studentId} /><button className="text-xs text-red-700 underline">{t("delete")}</button></form>}</div><p className="mt-1 whitespace-pre-line text-slate-900" data-content>{c.body}</p></li>)}</ul>}
        </div>
        <div id="notes" className="mt-5 scroll-mt-24 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 print:hidden">
          <h3 className="font-semibold text-brand-navy">🔒 {t("Private notes")} <InfoTip text={GLOSSARY["Private notes"]} /> <span className="text-sm font-normal text-slate-500">· {t("staff only — never shown to the student or the parent")}</span></h3>
          <form action={addNoteAction} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="studentId" value={studentId} />
            <input name="body" required maxLength={1000} aria-label={t("Private notes")} className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-2" />
            <button className="min-h-10 rounded-xl bg-slate-700 px-4 font-semibold text-white">{t("Save note")}</button>
          </form>
          {notes.length > 0 && <ul className="mt-2 space-y-1 text-sm">{notes.map((n) => <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"><span><span className="text-slate-500"><span dir="ltr">{n.date}</span> · {n.author}:</span> <span data-content>{n.body}</span></span>{n.mine && <form action={deleteNoteAction}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="studentId" value={studentId} /><button className="text-xs text-red-700 underline">{t("delete")}</button></form>}</li>)}</ul>}
        </div>
      </section>

      {/* 🎖️ rewards (Games Part 3): avatar, coins, favorite badge, bonus coins and certificates (own students) */}
      <Suspense fallback={null}><StudentRewardsPanel actor={actor} studentId={studentId} canGive={await staffClassOf(repo, actor, studentId).then(() => true, () => false)} /></Suspense>

      <section id="reports" className="scroll-mt-20" aria-label={t("Reports")}>
        <div className={card}>
          <h2 className={h2}><span aria-hidden="true">📊</span> {t("Reports")} <InfoTip text={GLOSSARY["Student reports"]} /></h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {([
              [`/teacher/progress/${studentId}/report`, "👪", "Parent Report"],
              [`/teacher/reports/grammar/${studentId}`, "🔤", "Grammar results"],
              [`/teacher/reports/readmaster/${studentId}`, "⭐", "ReadMaster results"],
              [`/map-report/profile/${studentId}`, "🗺️", "MAP Student Profile"],
              [`/teacher/level-story/${studentId}`, "🧭", "Level Story"],
              [`/teacher/tiers/${studentId}`, "🪜", "Support tiers"],
            ] as const).map(([href, icon, label]) => (
              <li key={href}><Link prefetch={false} href={href} className="flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 font-medium text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"><span aria-hidden="true">{icon}</span> {t(label)}</Link></li>
            ))}
          </ul>
        </div>
        <ReportDownloads title="Student progress report (this school year)" report={{ kind: "student", studentId, period: "SCHOOL_YEAR" }} />
        <FamilyReportPanel studentId={studentId} name={String(d.name ?? "")} reports={reports} />
      </section>

      <div id="summary" className="scroll-mt-20">
        <ReportSummary summary={studentFileSummary({ studentId, name: String(d.name ?? ""), classId, accuracy: x.answers.accuracy, skills: d.skills, late: x.work.items.filter((w) => w.overdue).length })} />
      </div>
      <section id="details" className="scroll-mt-20" aria-label={t("More details")}>
        <StudentProfileCard p={profile} tier={tier} tierHref={`/teacher/tiers/${studentId}`} />
        <LearningPathView p={path} classId={classId} />
        <StudentAnalyticsView a={analytics} />
        <div className="mt-6"><StudentDetailView d={d} classHref={classId ? `/teacher/classes/${classId}` : "/teacher"} header={false} /></div>
      </section>
      <div className="mt-8"><ResetPasswordButton userId={String(st.userId)} /></div>
    </AppShell>
  );
}
