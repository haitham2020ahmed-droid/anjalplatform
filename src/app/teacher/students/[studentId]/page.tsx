import Link from "next/link";
import { Suspense } from "react";
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
import { AtAGlance, Callout, ReportHeader, toneOfPct } from "@/components/report-kit";
import { MASTERED_AT, NEEDS_BELOW } from "@/server/teacher/student-profile";
import type { MapSummary } from "@/server/insights/student-data";
import { writingResults } from "@/server/writing/locked";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh" }) : "—");
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

/**
 * 🧑‍🎓 ONE student profile (UI reorg Phase 3 E): every student name on the teacher pages opens this page.
 * Overview → My Work → Plans → Tests → MAP → Skills (mastered / needed) → Reports → the detailed history.
 * Access: the teacher's own classes; the admin: the school (typed URLs refused on the server).
 */
export default async function StudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const { studentId } = await params;
  const me = (await getActor())!.user;
  const { t } = await getT();
  // the detail (access check) first, then every section at once (Update 42B): src/server/teacher/page-data.ts
  const { d, st, member, analytics, profile, tier, reports, path, mapCompare, extras: x } = await teacherStudentData(repo, actor, studentId);
  const classId = member ? String(member.classId) : null;
  // ✍️ graded writing (rubric score %), with the other results
  const writing = classId ? await writingResults(repo, actor, classId, { studentId, limit: 20 }).catch(() => null) : null;
  const myWriting = writing ? writing.tasks.filter((k) => writing.rows[0]?.pct[k.id] !== undefined).map((k) => ({ ...k, pct: writing.rows[0].pct[k.id] })) : [];
  const mastered = d.skills.filter((k) => k.score >= MASTERED_AT || /master/i.test(k.band)).sort((a, b) => b.score - a.score);
  const needed = d.skills.filter((k) => k.score < NEEDS_BELOW && !/master/i.test(k.band)).sort((a, b) => a.score - b.score);
  const avgTest = x.tests.completed.filter((c) => c.pct !== null);
  const testAvg = avgTest.length ? Math.round(avgTest.reduce((n, c) => n + (c.pct ?? 0), 0) / avgTest.length) : null;
  const card = "rk-section mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6";
  const h2 = "text-lg font-semibold text-brand-navy";
  const sections = [["overview", "Overview"], ["work", "My Work"], ["plans", "Plans"], ["tests", "Tests"], ["map", "MAP"], ["skills", "Skills"], ["rewards", "Rewards"], ["reports", "Reports"], ["details", "More details"]] as const;
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
        </nav>} />

      <section id="overview" aria-label={t("Overview")} className="scroll-mt-20">
        <AtAGlance items={[
          { icon: "📘", label: "My Work done", value: `${x.work.done} / ${x.work.items.length}`, meaning: t("{n} not started", { n: x.work.notStarted }), tone: x.work.items.some((w) => w.overdue) ? "warn" : "neutral" },
          { icon: "🎯", label: "Accuracy", value: x.answers.accuracy === null ? "—" : `${x.answers.accuracy}%`, meaning: t("{c} correct · {i} not correct", { c: x.answers.correct, i: x.answers.incorrect }), tone: toneOfPct(x.answers.accuracy) },
          { icon: "⏱️", label: "Time spent", value: mins(x.time.totalMinutes), meaning: <>{t("This week")}: <span dir="ltr">{mins(x.time.weekMinutes)}</span> · {t("This month")}: <span dir="ltr">{mins(x.time.monthMinutes)}</span></> },
          { icon: "📝", label: "Test average", value: testAvg === null ? "—" : `${testAvg}%`, tone: toneOfPct(testAvg) },
          { icon: "🧩", label: "Skills", value: `${mastered.length} ✓ · ${needed.length} ↻`, meaning: t("{m} mastered · {n} need work", { m: mastered.length, n: needed.length }) },
        ]} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Callout kind="meaning" items={[
            x.answers.accuracy !== null ? (x.answers.accuracy >= 80 ? t("Strong accuracy: most answers are right.") : x.answers.accuracy >= 60 ? t("Getting there: about two answers in three are right.") : t("Needs help: fewer than 6 answers in 10 are right.")) : t("No answers yet."),
            x.time.weekMinutes === 0 ? t("No practice this week yet.") : null,
          ]} />
          <Callout kind="next" items={[
            needed[0] ? <>{t("Practise")} <b data-content lang="en">{needed[0].name}</b> ({needed[0].score})</> : null,
            x.work.items.some((w) => w.overdue) ? t("Talk with the student about the late work.") : null,
            x.tests.toDo.length ? t("{n} test(s) to do.", { n: x.tests.toDo.length }) : null,
          ]}>{!needed.length && !x.work.items.some((w) => w.overdue) && !x.tests.toDo.length ? t("Keep the daily practice going.") : null}</Callout>
        </div>
      </section>

      <section id="work" className={`${card} scroll-mt-20`} aria-labelledby="work-h">
        <h2 id="work-h" className={h2}><span aria-hidden="true">📘</span> {t("My Work")} <span className="text-sm font-normal text-slate-500">· {t("{n} not started", { n: x.work.notStarted })} · {t("{n} in progress", { n: x.work.inProgress })} · {t("{n} done", { n: x.work.done })}</span></h2>
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
        <h2 id="plans-h" className={h2}><span aria-hidden="true">🗂️</span> {t("Plans")}</h2>
        {x.plans.length === 0 ? <div className="mt-3"><EmptyState compact icon="🗂️" title="No plans yet" action={classId ? { href: `/teacher/plans?classId=${classId}`, label: "Plans" } : undefined} /></div> : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{x.plans.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200"><span className="min-w-0"><SourceTag source={p.sourceKey} size="sm" /> <span className="font-medium" data-content lang="en">{p.title}</span></span><span className="shrink-0 text-sm tabular-nums text-slate-600" dir="ltr">{p.done}/{p.parts}</span></li>
          ))}</ul>
        )}
      </section>

      <section id="tests" className={`${card} scroll-mt-20`} aria-labelledby="tests-h">
        <h2 id="tests-h" className={h2}><span aria-hidden="true">📝</span> {t("Tests and scores")}</h2>
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
            <h3 className="font-semibold text-brand-navy">✍️ {t("Writing results")} <span className="text-sm font-normal text-slate-500">· {t("Average")} <span dir="ltr">{writing!.rows[0].average}%</span></span></h3>
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
        <h2 id="map-h" className={h2}><span aria-hidden="true">🗺️</span> {t("MAP results")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2"><MapCard label="Reading" m={x.map.reading} /><MapCard label="Language Usage" m={x.map.language} /></div>
        <p className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link prefetch={false} href={`/map-report/profile/${studentId}`} className="font-semibold text-brand-teal hover:underline">{t("MAP Student Profile")}</Link>
          {classId && <Link prefetch={false} href={`/teacher/map-entry?classId=${classId}`} className="font-semibold text-brand-teal hover:underline">{t("Upload MAP Scores")}</Link>}
        </p>
        <div className="max-w-full overflow-x-auto"><MapComparisonView data={mapCompare} /></div>
      </section>

      <section id="skills" className={`${card} scroll-mt-20`} aria-labelledby="skills-h">
        <h2 id="skills-h" className={h2}><span aria-hidden="true">🧩</span> {t("Skills: mastered and needed")}</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div><h3 className="font-semibold text-emerald-800">✓ {t("Mastered")} ({mastered.length})</h3>
            {mastered.length === 0 ? <p className="mt-1 text-sm text-slate-600">{t("Nothing to show yet")}</p> : <ul className="mt-1 space-y-1 text-sm">{mastered.slice(0, 15).map((k) => <li key={k.skillId} className="flex justify-between gap-2"><span data-content lang="en">{k.name}</span><span className="tabular-nums text-slate-500" dir="ltr">{k.score}</span></li>)}</ul>}
          </div>
          <div><h3 className="font-semibold text-amber-800">↻ {t("Needs work")} ({needed.length})</h3>
            {needed.length === 0 ? <p className="mt-1 text-sm text-slate-600">{t("Nothing to show yet")}</p> : <ul className="mt-1 space-y-1 text-sm">{needed.slice(0, 15).map((k) => <li key={k.skillId} className="flex justify-between gap-2"><span data-content lang="en">{k.name}</span><span className="tabular-nums text-slate-500" dir="ltr">{k.score}</span></li>)}</ul>}
          </div>
        </div>
      </section>

      {/* 🎖️ rewards (Games Part 3): avatar, coins, favorite badge, bonus coins and certificates (own students) */}
      <Suspense fallback={null}><StudentRewardsPanel actor={actor} studentId={studentId} canGive={await staffClassOf(repo, actor, studentId).then(() => true, () => false)} /></Suspense>

      <section id="reports" className="scroll-mt-20" aria-label={t("Reports")}>
        <div className={card}>
          <h2 className={h2}><span aria-hidden="true">📊</span> {t("Reports")}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {([
              [`/teacher/progress/${studentId}`, "📈", "Student Progress"],
              [`/teacher/progress/${studentId}/report`, "👪", "Parent Report"],
              [`/teacher/reports/grammar/${studentId}`, "🔤", "Grammar results"],
              [`/teacher/reports/readmaster/${studentId}`, "⭐", "ReadMaster results"],
              [`/map-report/profile/${studentId}`, "🗺️", "MAP Student Profile"],
              [`/teacher/level-story/${studentId}`, "🧭", "Level Story"],
              [`/teacher/tiers/${studentId}`, "🪜", "Support tiers"],
              [`/admin/student-file/${studentId}`, "🗃️", "Student file"],
            ] as const).map(([href, icon, label]) => (
              <li key={href}><Link prefetch={false} href={href} className="flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 font-medium text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"><span aria-hidden="true">{icon}</span> {t(label)}</Link></li>
            ))}
          </ul>
        </div>
        <ReportDownloads title="Student progress report (this school year)" report={{ kind: "student", studentId, period: "SCHOOL_YEAR" }} />
        <FamilyReportPanel studentId={studentId} name={String(d.name ?? "")} reports={reports} />
      </section>

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
