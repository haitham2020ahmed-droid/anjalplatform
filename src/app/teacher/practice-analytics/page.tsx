import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportSummary, ReportTable, toneOfPct } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { resolvePeriod, type PeriodName } from "@/analytics/periods";
import { loadCalendar } from "@/server/analytics/calendar";
import { practiceAnalytics, riyadhRange, type PracticeView, type StarCounts } from "@/server/analytics/practice";
import { DayBars, SkillDonut } from "@/components/analytics/practice-charts";
import { RichInline } from "@/components/rich-inline";
import { SkillStar, StarGlyph, StarLegend } from "@/components/skills/skill-star";
import { practiceSummary } from "@/lib/report-summaries";

export const metadata = { title: "Practice and time" };
const RANGES: [PeriodName, string][] = [["LAST_7_DAYS", "Last 7 days"], ["LAST_30_DAYS", "Last 30 days"], ["TERM", "This term"], ["SCHOOL_YEAR", "School year"]];
const VIEWS: [PracticeView, string][] = [["practice", "Practice (builds stars)"], ["tests", "Tests & checks"], ["other", "Lessons, ReadMaster & reviews"], ["all", "Everything"]];
const sign = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v}`);
const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

/** The four star counts as small icons + numbers (☆ only when asked). */
function Stars({ c, t }: { c: StarCounts; t: (s: string) => string }) {
  const part = (status: "MASTERED" | "IN_PROGRESS" | "NEEDS_REVIEW", n: number, word: string) => (
    <span className="inline-flex items-center gap-1 tabular-nums" title={t(word)}><StarGlyph status={status} size={14} />{n}</span>
  );
  return <span className="inline-flex flex-wrap items-center gap-2">{part("MASTERED", c.mastered, "Mastered")}{part("IN_PROGRESS", c.inProgress, "In progress")}{part("NEEDS_REVIEW", c.needsReview, "Needs review")}</span>;
}

/**
 * 📊 Practice and time — on the shared skill system (31 Oct 2026): one row per skill (the Student Skills name), the
 * stars from SkillStatus (☆ ◐ ⭐ 🔄), every source labelled (skill practice, NAFS practice, ReadRise → build stars;
 * tests & checks; lessons / ReadMaster / reviews), Riyadh days, a summary and an action plan at the end.
 */
export default async function PracticeAnalyticsPage({ searchParams }: { searchParams: Promise<{ classId?: string; range?: string; from?: string; to?: string; student?: string; view?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const range = (sp.range === "CUSTOM" && sp.from && sp.to ? "CUSTOM" : RANGES.find(([k]) => k === sp.range)?.[0] ?? "LAST_30_DAYS") as PeriodName;
  const view = (VIEWS.find(([k]) => k === sp.view)?.[0] ?? "practice") as PracticeView;
  let period; let error = "";
  try { period = resolvePeriod(range, await loadCalendar(repo, actor.schoolId), new Date(Date.now() + 3 * 3_600_000), range === "CUSTOM" ? { from: new Date(String(sp.from)), to: new Date(String(sp.to)) } : undefined); }
  catch (e) { error = (e as Error).message; period = resolvePeriod("LAST_30_DAYS", { year: null, terms: [] }, new Date(Date.now() + 3 * 3_600_000)); }
  // the calendar days in Riyadh time (UTC+3): from Riyadh midnight to Riyadh midnight
  const days = riyadhRange(period.from, period.to);
  const a = klass ? await practiceAnalytics(repo, actor, { classId: String(klass.id), from: days.from, to: days.to, studentId: sp.student || null, view }) : null;
  const q = (p: Record<string, string | undefined>) => `/teacher/practice-analytics?${new URLSearchParams(Object.entries({ classId: klass ? String(klass.id) : undefined, range, from: sp.from, to: sp.to, student: sp.student, view: view === "practice" ? undefined : view, ...p }).filter(([, v]) => v) as [string, string][])}`;
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  const one = a?.scope.studentId ? a.students[0] : null;
  const { t } = await getT();
  const cid = klass ? String(klass.id) : "";
  const skillsHref = (key?: string) => `/teacher/reports/skills-grid?${new URLSearchParams({ classId: cid, ...(key ? { view: "skill", skill: key } : {}) })}`;
  const studentSkillsHref = (id: string) => `/teacher/reports/skills-grid?${new URLSearchParams({ classId: cid, view: "student", student: id })}`;
  const attentionHref = `/teacher/reports/needs-attention?${new URLSearchParams({ classId: cid })}`;
  const viewLabel = VIEWS.find(([k]) => k === view)![1];
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="📊" title={`${t("Practice and time")}${one ? ` · ${one.name}` : ""}`}
        subtitle="What the students practised: how much, when (at school or at home), on which skills, how accuracy changed, the stars they earned, and the questions most students missed."
        who={a ? a.scope.className : klass ? String(klass.name) : undefined} when={a ? `${a.from} → ${a.to}` : undefined}
        filters={klass ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {classes.map((c) => <Link key={String(c.id)} href={q({ classId: String(c.id), student: undefined })} className={chip(c.id === klass.id)}>{String(c.name)}</Link>)}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              {RANGES.map(([k, l]) => <Link key={k} href={q({ range: k, from: undefined, to: undefined })} className={chip(range === k)}>{t(l)}</Link>)}
              <form className="flex flex-wrap items-end gap-2" action="/teacher/practice-analytics">
                <input type="hidden" name="classId" value={String(klass.id)} /><input type="hidden" name="range" value="CUSTOM" />
                {sp.student && <input type="hidden" name="student" value={sp.student} />}
                {view !== "practice" && <input type="hidden" name="view" value={view} />}
                <label className="text-xs text-slate-600">{t("From")}<input type="date" name="from" defaultValue={sp.from ?? period.from.toISOString().slice(0, 10)} className="block rounded-lg border border-slate-300 px-2 py-1" /></label>
                <label className="text-xs text-slate-600">{t("To")}<input type="date" name="to" defaultValue={sp.to ?? period.to.toISOString().slice(0, 10)} className="block rounded-lg border border-slate-300 px-2 py-1" /></label>
                <button className={chip(range === "CUSTOM")}>{t("Apply")}</button>
              </form>
              {one && <Link href={q({ student: undefined })} className={chip(false)}>← {t("Whole class")}</Link>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2" aria-label={t("What to count")}>
              {VIEWS.map(([k, l]) => <Link key={k} href={q({ view: k === "practice" ? undefined : k })} className={chip(view === k)}>{t(l)}</Link>)}
            </div>
          </>
        ) : undefined} />
      {!klass ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("No class yet.")}</p> : (
        <>
          {error && <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">⚠️ {error}</p>}
          {a && (
            <>
              <StarLegend t={t} className="mb-4" />
              <p className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-200">
                {view === "practice" ? t("Showing practice that builds stars: skill practice, assigned sets, the MAP plan, Curriculum Map sets, NAFS practice and ReadRise questions. Tests, lessons and live games are not counted here.") : t("Showing: {what}. These answers never change a star.", { what: t(viewLabel) })}
              </p>

              {/* 1. the numbers */}
              <AtAGlance items={[
                { icon: "✍️", label: "Questions", value: a.totals.questions, meaning: a.totals.avgPerStudent !== null && !one ? t("{n} per active student", { n: a.totals.avgPerStudent }) : undefined },
                { icon: "🎯", label: "Accuracy", value: a.totals.accuracy !== null ? `${a.totals.accuracy}%` : "—", meaning: t("{n} correct", { n: a.totals.correct }), tone: toneOfPct(a.totals.accuracy) },
                { icon: "⏱️", label: "Time", value: hm(a.totals.minutes), meaning: a.totals.untimed ? t("answering questions · {n} ReadRise answers not timed", { n: a.totals.untimed }) : "answering questions" },
                { icon: "🙋", label: "Active", value: one ? (one.questions ? t("Yes") : t("No")) : `${a.totals.activeStudents}/${a.totals.students}`, meaning: one ? (one.lastActive ?? "") : "students practised", tone: one ? (one.questions ? "good" : "warn") : a.totals.activeStudents < a.totals.students ? "warn" : "good" },
                { icon: "🏫", label: "At school", value: a.totals.questions ? `${Math.round((100 * a.totals.schoolQuestions) / a.totals.questions)}%` : "—", meaning: t("{n} at home", { n: a.totals.homeQuestions }) },
                { icon: "🧠", label: "Effort", value: a.totals.effort !== null ? `${a.totals.effort}%` : "—", meaning: a.totals.unreliable ? t("{n} unreliable sessions", { n: a.totals.unreliable }) : t("answers given with care"), tone: a.totals.effort === null ? "neutral" : a.totals.effort < 80 ? "warn" : "good" },
              ]} />
              <AtAGlance title="Skills and stars" items={[
                { icon: "🧩", label: "Skills", value: a.totals.skills, meaning: "practised", href: skillsHref() },
                { icon: "⭐", label: "New stars", value: a.totals.newStars, meaning: "earned in this range", tone: a.totals.newStars ? "good" : "neutral" },
                { icon: "🌟", label: "Mastered", value: a.totals.stars.mastered, meaning: "of the skills practised, now", tone: "info" },
                { icon: "◐", label: "In progress", value: a.totals.stars.inProgress, meaning: "of the skills practised, now" },
                { icon: "🔄", label: "Needs review", value: a.totals.stars.needsReview, meaning: "of the skills practised, now", tone: a.totals.stars.needsReview ? "warn" : "neutral" },
              ]} />

              {/* 2. where the answers came from */}
              <ReportSection title="Where the answers came from" icon="🗂️" hint="Every answer in this range, from every part of the platform. Only the first three build stars.">
                <ReportTable label="Where the answers came from" cards={false}
                  cols={[{ key: "src", label: "Source" }, { key: "q", label: "Questions", num: true }, { key: "st", label: "Students", num: true }, { key: "star", label: "Builds stars" }]}
                  rows={a.sources.map((x) => ({ id: x.source, cells: { src: t(x.label), q: x.questions, st: x.students, star: x.countsForStars ? <span className="font-semibold text-emerald-700">✓ {t("Yes")}</span> : <span className="text-slate-500">{t("No")}</span> } }))} />
                {a.unlinked.questions > 0 && (
                  <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
                    ⚠️ {t("{n} answers ({s} students) are on Curriculum Map questions not linked to a skill yet: they build no star until the admin links them.", { n: a.unlinked.questions, s: a.unlinked.students })}
                    {actor.role !== "TEACHER" && <> <Link href="/admin/questions/unclassified" className="font-semibold underline">{t("Link them now")}</Link></>}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">{t("Live games are never counted: games never change levels, stars or scores.")}</p>
              </ReportSection>

              {/* 3. who needs you, next steps */}
              <div className="mb-5 grid gap-4 lg:grid-cols-2">
                <Callout kind="help" items={one ? [] : [
                  (() => { const n = a.students.filter((x) => !x.questions); return n.length ? <>{t("Did not practise")}: {n.slice(0, 10).map((x, i) => <span key={x.id}>{i ? ", " : ""}<bdi>{x.name}</bdi></span>)}{n.length > 10 ? ` +${n.length - 10}` : ""}</> : null; })(),
                  (() => { const n = a.students.filter((x) => x.questions && x.accuracy !== null && x.accuracy < 60); return n.length ? <>{t("Under 60% accuracy")}: {n.slice(0, 10).map((x, i) => <span key={x.id}>{i ? ", " : ""}<bdi>{x.name}</bdi></span>)}</> : null; })(),
                  (() => { const n = a.students.filter((x) => x.unreliable > 0); return n.length ? <>{t("Guessing (talk with them)")}: {n.slice(0, 10).map((x, i) => <span key={x.id}>{i ? ", " : ""}<Link href={q({ student: x.id })} className="underline"><bdi>{x.name}</bdi></Link></span>)}</> : null; })(),
                ]} />
                <Callout kind="next" items={[
                  (() => { const w = [...a.skills].filter((k) => k.accuracy !== null && k.questions >= 5).sort((x, y) => (x.accuracy ?? 0) - (y.accuracy ?? 0))[0]; return w && (w.accuracy ?? 100) < 60 ? <>{t("Reteach")} <Link href={skillsHref(w.key)} className="font-semibold underline">{w.name}</Link> ({w.accuracy}%)</> : null; })(),
                  a.trouble[0] ? t("Go over the trouble-spot questions below with the class.") : null,
                  !a.totals.questions ? t("No practice in this range yet.") : null,
                ]} />
              </div>

              {/* 4. when and on what */}
              <div className="grid gap-5 lg:grid-cols-5">
                <ReportSection title="By day" icon="📅" className="lg:col-span-3"><DayBars days={a.days} /></ReportSection>
                <ReportSection title="By skill" icon="🧩" className="lg:col-span-2"><SkillDonut skills={a.skills} />{!a.skills.length && <p className="text-sm text-slate-500">{t("No practice in this range.")}</p>}</ReportSection>
              </div>

              {/* 5. every skill (one row per skill, the Student Skills name) */}
              {a.skills.length > 0 && (
                <ReportSection title="Skills practised" icon="🧩" hint="One row per skill, with the same name as Student Skills. Stars = the students who practised it, now.">
                  <ReportTable label="Skills practised"
                    cols={[{ key: "s", label: "Skill" }, { key: "q", label: "Questions", num: true }, { key: "st", label: "Students", num: true }, { key: "m", label: "Time", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "ef", label: "Effort", num: true }, { key: "stars", label: "Stars now" }]}
                    rows={a.skills.map((k) => ({
                      id: k.key, flag: k.accuracy !== null && k.accuracy < 60 ? "bad" : undefined, sort: { q: k.questions, st: k.students, m: k.minutes, acc: k.accuracy, ef: k.effort, stars: k.stars.mastered },
                      cells: {
                        s: <><Link href={skillsHref(k.key)} className="font-semibold text-brand-navy hover:underline">{k.name}</Link>{view !== "practice" || Object.keys(k.bySource).length > 1 ? <span className="block text-xs text-slate-500">{Object.entries(k.bySource).map(([src, n]) => `${t(a.sources.find((x) => x.source === src)?.label ?? src)} ${n}`).join(" · ")}</span> : null}</>,
                        q: k.questions, st: k.students, m: `${k.minutes} min`,
                        acc: <span className={`font-semibold ${k.accuracy !== null && k.accuracy < 60 ? "text-red-700" : "text-emerald-700"}`}>{k.accuracy !== null && k.accuracy < 60 ? "! " : ""}{k.accuracy ?? "—"}{k.accuracy !== null ? "%" : ""}</span>,
                        ef: <span className={k.effort !== null && k.effort < 80 ? "font-semibold text-amber-700" : "text-slate-700"}>{k.effort ?? "—"}{k.effort !== null ? "%" : ""}</span>,
                        stars: <Stars c={k.stars} t={t} />,
                      },
                    }))} />
                </ReportSection>
              )}

              {/* 6. every student */}
              <section className="rk-section mb-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
                <h2 className="text-lg font-semibold text-brand-navy sm:text-xl">🧑‍🎓 {one ? t("Skills") : t("Students")}</h2>
                <p className="mt-0.5 text-sm text-slate-600">{t("Stars = all of the student's skills now (the same as My Skills). New ⭐ = earned in this range.")}</p>
                <ul className="mt-2 divide-y divide-slate-100">{a.students.map((x) => (
                  <li key={x.id}>
                    <details open={Boolean(one)} className="group py-2">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-brand-navy"><bdi>{x.name}</bdi>
                          {!one && <Link href={q({ student: x.id })} className="ms-2 text-xs font-normal text-brand-teal underline">{t("open")}</Link>}
                          <Link href={studentSkillsHref(x.id)} className="ms-2 text-xs font-normal text-brand-teal underline">{t("Student Skills")}</Link>
                        </span>
                        <span className="flex flex-wrap items-center gap-3 text-sm tabular-nums text-slate-600">
                          <span>{t("{n} q", { n: x.questions })}</span><span>{x.minutes} min</span><span>{x.accuracy ?? "—"}{x.accuracy !== null ? "%" : ""}</span>
                          <span className={x.effort !== null && x.effort < 80 ? "font-semibold text-amber-700" : ""}>{t("Effort")} {x.effort ?? "—"}{x.effort !== null ? "%" : ""}</span>
                          {x.unreliable > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">{t("{n} unreliable", { n: x.unreliable })}</span>}
                          <span>{t("{n} skills", { n: x.skills })}</span>
                          <Stars c={x.stars} t={t} />
                          {x.newStars > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">{t("+{n} new ⭐", { n: x.newStars })}</span>}
                          <span>{x.schoolPct !== null ? t("{n}% at school", { n: x.schoolPct }) : ""}</span>
                          <span className="text-slate-400">{x.lastActive ?? t("not active")}</span>
                        </span>
                      </summary>
                      {x.detail.length > 0 && (
                        <div className="rk-box mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-start text-xs text-slate-500"><th className="py-1 text-start">{t("Skill")}</th><th className="text-start">{t("Questions")}</th><th className="text-start">{t("Time")}</th><th className="text-start">{t("Accuracy")}</th><th className="text-start">{t("Change (first → last answers)")}</th><th className="text-start">{t("Star now")}</th></tr></thead>
                          <tbody>{x.detail.map((d) => (
                            <tr key={d.key} className="border-t border-slate-100">
                              <td className="py-1"><Link href={skillsHref(d.key)} className="hover:underline">{d.name}</Link></td>
                              <td className="tabular-nums">{d.questions}</td><td className="tabular-nums">{d.minutes} min</td><td className="tabular-nums">{d.accuracy ?? "—"}{d.accuracy !== null ? "%" : ""}</td>
                              <td className={`tabular-nums ${d.change !== null && d.change < 0 ? "text-red-700" : "text-emerald-700"}`}>{d.change !== null ? t("{n} pts", { n: sign(d.change) }) : "—"}</td>
                              <td className="tabular-nums"><span className="inline-flex items-center gap-1.5"><SkillStar info={{ status: d.status, score: d.score, answered: d.answered, needsSupport: d.needsSupport }} t={t} label={d.name} />{d.status !== "NOT_STARTED" ? `${d.score}%` : ""}{d.status === "IN_PROGRESS" && d.answered < 30 ? <span className="text-xs text-slate-500">{t("{n}/30 answers", { n: d.answered })}</span> : null}{d.masteredInRange ? <span className="text-xs font-semibold text-amber-700">{t("new")}</span> : null}</span></td>
                            </tr>
                          ))}</tbody>
                        </table></div>
                      )}
                    </details>
                  </li>
                ))}</ul>
              </section>

              {/* 7. one student: sessions and effort */}
              {one && a.sessions.length > 0 && (
                <ReportSection title="Sessions and effort" icon="🧠">
                  <p className="mb-2 text-sm text-slate-600">{t("Effort = answers given with care. Over 20% fast guesses makes a session Unreliable: it does not change the student's level, tier or plan.")}</p>
                  <ReportTable label="Sessions and effort"
                    cols={[{ key: "d", label: "Day" }, { key: "src", label: "Source" }, { key: "s", label: "Skill" }, { key: "n", label: "Answers", num: true }, { key: "e", label: "Effort", num: true }]}
                    rows={a.sessions.map((x) => ({ id: x.id, flag: x.unreliable ? "bad" : undefined, sort: { n: x.answers, e: x.effort }, cells: { d: x.day, src: t(a.sources.find((y) => y.source === x.source)?.label ?? x.source), s: x.skill, n: x.answers, e: <span className={x.unreliable ? "font-semibold text-amber-800" : "text-slate-700"}>{x.effort ?? "—"}{x.effort !== null ? "%" : ""}{x.unreliable ? ` · ${t("Unreliable")}` : ""}</span> } }))} />
                </ReportSection>
              )}

              {/* 8. trouble spots */}
              {a.trouble.length > 0 && (
                <section className="rk-callout mt-5 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
                  <h2 className="font-bold text-amber-950">🚧 {t("Trouble spots · questions most students missed")}</h2>
                  <ul className="mt-2 space-y-1.5 text-sm">{a.trouble.map((x) => <li key={x.questionId} className="flex flex-wrap justify-between gap-2"><span><Link href={skillsHref(x.key)} className="text-slate-500 hover:underline">{x.skill}:</Link> <RichInline text={x.stem} /></span><b className="tabular-nums text-amber-900">{t("{n}/{m} missed", { n: x.missedBy, m: x.tried })}</b></li>)}</ul>
                </section>
              )}

              {/* 9. summary + action plan */}
              {!one && <ReportSummary summary={practiceSummary({ classId: cid, totals: a.totals, students: a.students, skills: a.skills, unlinked: a.unlinked }, { skillsHref, attentionHref })} />}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
