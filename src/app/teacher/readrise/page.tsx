import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { classReport, pollReport, POLL_LABELS, skillsReport, writingQueue, type SkillCell } from "@/server/readrise/dashboards";
import { assignableArticles } from "@/server/readrise/library";
import { classArticles, teacherReadRiseClasses } from "@/server/readrise/teacher";
import { ENGINE } from "@/server/readrise/engine";
import { exportsOf } from "@/components/reports/report-ui";
import { AtAGlance, Callout, ReportHeader } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";
import { ReadingLevelLabel } from "@/components/reading-level";
import { skillName } from "@/app/admin/readrise/_components/article-view";
import { ReadRiseTabs, TEACHER_TABS } from "@/app/admin/readrise/_components/tabs";
import { btn, day, field, Flash, fmt, LevelHistogram, levelRange, RR_NOTE, ScaledLineChart, signed } from "@/app/admin/readrise/_components/ui";
import { classGrowth, studentGrowthReport } from "@/server/readrise/growth-report";
import { ClassGrowthTab, StudentGrowthView } from "./_components/growth";
import { allowReadRiseRetakeAction, assignReadRiseAction, scoreReadRiseWritingAction, setReadRiseLevelAction, unassignReadRiseAction } from "./actions";
import { AssignDates } from "@/components/assign/assign-dates";

export const metadata = { title: "ReadRise" };

const TABS = [
  { key: "students", label: "👩‍🎓 Students" },
  { key: "growth", label: "📈 Growth" },
  { key: "skills", label: "🧠 Skills" },
  { key: "polls", label: "🗳 Polls" },
  { key: "writing", label: "✍️ Scoring" },
  { key: "assign", label: "📌 Assign" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const LINE_COLORS = ["#93c5fd", "#fdba74", "#86efac", "#c4b5fd", "#f9a8d4", "#a5f3fc", "#fcd34d", "#cbd5e1"];
const pctTone = (c?: SkillCell) => (!c || c.pct === null ? "text-slate-500" : c.pct >= 75 ? "bg-emerald-50 text-emerald-800" : c.pct >= 50 ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800");

/** 🚀 ReadRise (teacher): the class dashboard — levels and growth, skills, polls, writing to score, assignments. */
export default async function ReadRiseTeacher({ searchParams }: { searchParams: Promise<{ class?: string; tab?: string; msg?: string; student?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [classes, { t }] = await Promise.all([teacherReadRiseClasses(repo, actor), getT()]);
  const klass = classes.find((c) => c.id === sp.class) ?? classes.find((c) => c.own) ?? classes[0];
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "students";
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const studentId = typeof sp.student === "string" && /^[\w-]{1,64}$/.test(sp.student) ? sp.student : null;
  const header = (
    <ReportHeader back={{ href: "/teacher", label: "Home" }} icon="🚀" title="ReadRise"
      subtitle={<>Every student reads the same articles at their own level; the level moves with first-try scores (3 of the last 4 at 75%+: up 50 · one score of 25% or less, or two in a row under 50%: down 100). Readings with 2+ answers too fast to be read do not count. <span className="text-xs text-slate-500">{RR_NOTE}</span></>}
      who={klass?.name} downloads={klass ? exportsOf({ kind: "readrise", classId: klass.id, period: "TERM", ...(studentId ? { studentId } : {}) }).map((d) => ({ ...d, label: d.label })) : []}
      filters={classes.length ? <nav aria-label="Class" className="flex flex-wrap gap-2">
        {classes.map((c) => <Link key={c.id} href={`/teacher/readrise?class=${c.id}&tab=${tab}`} className={chip(c.id === klass?.id)}>{c.name}{!c.own && <span className="ms-1 text-xs opacity-70">(view)</span>}</Link>)}
      </nav> : undefined}>
      <ReadRiseTabs items={TEACHER_TABS} current="/teacher/readrise" />
    </ReportHeader>
  );
  if (!klass) {
    return <AppShell name={String(me.displayName)}>{header}<p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">You have no classes yet.</p></AppShell>;
  }
  if (studentId) {
    const g = await studentGrowthReport(repo, actor, klass.id, studentId);
    return <AppShell name={String(me.displayName)}>{header}<StudentGrowthView g={g} t={t} backHref={`/teacher/readrise?class=${klass.id}&tab=growth`} /></AppShell>;
  }
  const canWrite = klass.own;
  // ⚡ the class summary and the open tab's data load at the same time (all of them only read)
  const [r, growth, skills, polls, writing, assigned, library] = await Promise.all([
    classReport(repo, actor, klass.id),
    tab === "growth" ? classGrowth(repo, actor, klass.id) : null,
    tab === "skills" ? skillsReport(repo, actor, klass.id) : null,
    tab === "polls" ? pollReport(repo, actor, klass.id) : null,
    tab === "writing" ? writingQueue(repo, actor, klass.id, { scored: true }) : null,
    tab === "assign" ? classArticles(repo, actor, klass.id) : null,
    tab === "assign" && canWrite ? assignableArticles(repo, actor) : [],
  ]);
  const url = (t: Tab) => `/teacher/readrise?class=${klass.id}&tab=${t}`;
  const s = r.summary;
  const medBelow = s.medianLevel !== null && s.medianLevel < r.band.low;

  return (
    <AppShell name={String(me.displayName)}>
      {header}
      <Flash msg={sp.msg} />
      <AtAGlance items={[
        { icon: "🧭", label: "Placed", value: `${s.placed} / ${s.students}`, meaning: s.notPlaced ? t("{n} not placed", { n: s.notPlaced }) : "everyone placed", tone: s.notPlaced ? "warn" : "good" },
        { icon: "📊", label: "Median ReadRise Level", value: fmt(s.medianLevel), meaning: t("Grade {g} band {lo}–{hi} (ReadRise Level is an estimate)", { g: r.grade, lo: r.band.low, hi: r.band.high }), tone: medBelow ? "bad" : "info" },
        { icon: "📈", label: "Growth", value: signed(s.avgGrowth), meaning: "average since placement", tone: (s.avgGrowth ?? 0) > 0 ? "good" : (s.avgGrowth ?? 0) < 0 ? "bad" : "neutral" },
        { icon: "▼", label: "Below band", value: s.belowBand, meaning: "students under the grade's expected band", tone: s.belowBand ? "warn" : "neutral" },
        { icon: "💤", label: "Inactive", value: s.inactive, meaning: "no reading for 14+ days", tone: s.inactive ? "warn" : "neutral" },
      ]} />
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Callout kind="help" items={[
          s.belowBand ? <>{t("Below band")}: {r.students.filter((x) => x.flags.belowBand).slice(0, 10).map((x) => x.name).join(", ")}</> : null,
          s.inactive ? <>{t("Inactive")}: {r.students.filter((x) => x.flags.inactive).slice(0, 10).map((x) => x.name).join(", ")}</> : null,
          s.notPlaced ? <>{t("Not placed")}: {r.students.filter((x) => x.flags.notPlaced).slice(0, 10).map((x) => x.name).join(", ")}</> : null,
        ]} />
        <Callout kind="next" items={[
          s.writingToScore ? <>{t("Writing to score")}: <b>{s.writingToScore}</b> · <Link href={url("writing")} className="font-semibold text-brand-teal hover:underline">Score now →</Link></> : null,
          s.inactive ? t("Remind inactive students to read one article this week.") : null,
          s.notPlaced ? t("Ask students who are not placed to take the placement.") : null,
          !s.writingToScore && !s.inactive && !s.notPlaced ? t("Everyone is reading: keep the weekly goal going.") : null,
        ]} />
      </div>
      <nav aria-label="Report" className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link key={t.key} href={url(t.key)} aria-current={t.key === tab ? "page" : undefined}
            className={`-mb-px rounded-t-xl px-4 py-2 text-sm font-semibold ${t.key === tab ? "border border-b-white border-slate-200 bg-white text-brand-navy" : "text-slate-500 hover:text-brand-navy"}`}>
            {t.label}{t.key === "writing" && s.writingToScore ? <span className="ms-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-900">{s.writingToScore}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "students" && <StudentsTab r={r} canWrite={canWrite} classId={klass.id} t={t} />}
      {growth && <ClassGrowthTab g={growth} t={t} studentHref={(id) => `/teacher/readrise?class=${klass.id}&student=${id}`} assignHref={url("assign")} />}
      {skills && <SkillsTab data={skills} />}
      {polls && <PollsTab rows={polls} />}
      {writing && <WritingTab q={writing} classId={klass.id} canWrite={canWrite} />}
      {assigned && <AssignTab classId={klass.id} canWrite={canWrite && can(actor, "assignments:create")} assigned={assigned} library={library} />}
    </AppShell>
  );
}

type Report = Awaited<ReturnType<typeof classReport>>;

function StudentsTab({ r, canWrite, classId, t }: { r: Report; canWrite: boolean; classId: string; t: TFn }) {
  const series = [
    ...r.history.series.map((x, i) => ({ name: x.name, color: LINE_COLORS[i % LINE_COLORS.length], points: x.points, width: 1.5, dots: false, legend: false })),
    { name: "Class median", color: "#0f766e", points: r.history.median, width: 4 },
  ];
  const range = levelRange(series.flatMap((x) => x.points), r.band);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Section title="Growth" icon="📈" hint="Each student's ReadRise Level at the end of each week (thin lines) and the class median (bold).">
          {r.history.series.length === 0 ? <p className="text-sm text-slate-600">No student has been placed yet.</p> :
            <ScaledLineChart labels={r.history.weeks} series={series} title={`${r.className} ReadRise Level by week`} min={range.min} max={range.max} ticks={range.ticks} band={{ ...r.band, label: `Grade ${r.grade} expected band` }} />}
        </Section>
        <Section title="Where the class is" icon="📊" hint={`Expected band for Grade ${r.grade}: ${r.band.low}–${r.band.high}.`}>
          <LevelHistogram buckets={r.distribution} title={`${r.className} students by ReadRise Level`} />
        </Section>
      </div>

      <Section title="Students" icon="👩‍🎓" hint={canWrite ? "Change a level by hand (with a reason) or allow a placement retake from a student's row." : "You can view this class; changes are made by its teachers."}>
        <div className="rk-box rk-tall">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="p-2">Student</th><th className="p-2">Level now</th><th className="p-2">Start</th><th className="p-2">Growth</th><th className="p-2"><ReadingLevelLabel scale="MAP" /></th>
                <th className="p-2">Articles (week / total)</th><th className="p-2">First-try avg</th><th className="p-2">Weeks meeting goal</th><th className="p-2">Last activity</th><th className="p-2">Writing</th><th className="p-2">Flags</th>
                {canWrite && <th className="p-2"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {r.students.map((x) => (
                <tr key={x.studentId} className="border-b align-top last:border-0">
                  <td className="p-2 font-semibold text-brand-navy"><Link href={`/teacher/readrise?class=${classId}&student=${x.studentId}`} className="hover:underline">{x.name}</Link></td>
                  <td className="p-2 font-bold tabular-nums">{x.placed ? <>{fmt(x.level)}{x.source === "TEACHER" && <span className="ms-1 text-xs font-normal text-slate-400" title="Set by a teacher">✎</span>}</> : <span data-testid="rr-no-placement" className="text-xs font-semibold text-amber-800">{x.placementOpen ? t("Placement in progress") : t("No placement yet")}</span>}</td>
                  <td className="p-2 tabular-nums text-slate-600">{fmt(x.startLevel)}</td>
                  <td className={`p-2 font-semibold tabular-nums ${x.growth === null ? "" : x.growth > 0 ? "text-emerald-700" : x.growth < 0 ? "text-red-700" : "text-slate-600"}`}>{signed(x.growth)}</td>
                  <td className="p-2 tabular-nums text-slate-600">{x.mapLexile === null ? "—" : `${x.mapLexile}L`}</td>
                  <td className="p-2 tabular-nums">{x.weekArticles} / {x.totalArticles}</td>
                  <td className={`p-2 tabular-nums ${x.firstTryAvg === null ? "" : x.firstTryAvg >= 75 ? "text-emerald-700" : x.firstTryAvg < 50 ? "text-red-700" : ""}`}>{fmt(x.firstTryAvg, "%")}</td>
                  <td className="p-2 tabular-nums">{x.placed ? `${x.goalMet} / ${x.goalWeeks}` : "—"}<span className="block text-[11px] text-slate-400">{x.placed ? `goal ${x.goal} a week` : ""}</span></td>
                  <td className="p-2 tabular-nums text-slate-600">{day(x.lastActivity)}</td>
                  <td className="p-2 tabular-nums">{x.writingToScore ? <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">{x.writingToScore} to score</span> : "—"}</td>
                  <td className="p-2">
                    <span className="flex flex-wrap gap-1 text-[11px] font-semibold">
                      {x.flags.notPlaced && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">not placed</span>}
                      {x.flags.belowBand && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-800 ring-1 ring-red-200">below band</span>}
                      {x.flags.inactive && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900 ring-1 ring-amber-200">inactive</span>}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="p-2">
                      <details className="text-xs">
                        <summary className="cursor-pointer font-semibold text-brand-teal">Change</summary>
                        <div className="mt-2 w-64 space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                          <form action={setReadRiseLevelAction} className="space-y-1.5">
                            <input type="hidden" name="classId" value={classId} /><input type="hidden" name="studentId" value={x.studentId} />
                            <label className="block font-semibold">New ReadRise Level<input type="number" name="level" required min={ENGINE.min} max={ENGINE.max} step={10} defaultValue={x.level ?? ""} className={`${field} mt-1 block w-full`} /></label>
                            <label className="block font-semibold">Reason<input name="reason" required minLength={3} maxLength={250} placeholder="e.g. MAP reading 820 in the winter test" className={`${field} mt-1 block w-full`} /></label>
                            <button className="rounded-lg bg-brand-navy px-3 py-1.5 font-semibold text-white">Set level</button>
                          </form>
                          {(x.placed || x.placementOpen) && (
                            <form action={allowReadRiseRetakeAction} className="space-y-1.5 border-t border-slate-200 pt-3">
                              <input type="hidden" name="classId" value={classId} /><input type="hidden" name="studentId" value={x.studentId} />
                              <input name="reason" maxLength={200} placeholder="Why (optional)" className={`${field} block w-full`} />
                              <button className="rounded-lg bg-white px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-300">{x.placementOpen ? t("Restart the placement") : "Allow placement retake"}</button>
                              <p className="text-[11px] text-slate-500">{x.placementOpen ? t("The test starts again from the first passage.") : "Once per term. The level stays until the new test ends."}</p>
                            </form>
                          )}
                        </div>
                      </details>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function SkillsTab({ data }: { data: Awaited<ReturnType<typeof skillsReport>> }) {
  if (!data.skills.length) return <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No first-try results yet.</p>;
  const ranked = [...data.skills].sort((a, b) => (data.classBySkill[a].pct ?? 0) - (data.classBySkill[b].pct ?? 0));
  return (
    <div className="space-y-6">
      <Section title="Class by skill" icon="🧠" hint="First-try accuracy by question skill, weakest first.">
        <ul className="space-y-2">
          {ranked.map((k) => { const c = data.classBySkill[k]; return (
            <li key={k} className="grid grid-cols-[10rem_minmax(0,1fr)_6rem] items-center gap-3 text-sm">
              <span className="truncate font-semibold text-slate-700">{skillName(k)}</span>
              <span className="h-3 rounded-full bg-slate-100"><span className={`block h-3 rounded-full ${(c.pct ?? 0) >= 75 ? "bg-emerald-500" : (c.pct ?? 0) >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${c.pct ?? 0}%` }} /></span>
              <span className="text-right tabular-nums text-slate-700">{fmt(c.pct, "%")} <span className="text-xs text-slate-600">({c.correct}/{c.total})</span></span>
            </li>
          ); })}
        </ul>
      </Section>
      <Section title="Each student" icon="👩‍🎓">
        <div className="relative overflow-x-auto">
          <table className="w-full text-center text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="p-2 text-left">Student</th>{data.skills.map((k) => <th key={k} className="p-2">{skillName(k)}</th>)}<th className="p-2">All</th></tr></thead>
            <tbody>{data.students.map((x) => (
              <tr key={x.studentId} className="border-b last:border-0">
                <td className="p-2 text-left font-semibold text-brand-navy">{x.name}</td>
                {data.skills.map((k) => <td key={k} className={`p-2 tabular-nums ${pctTone(x.bySkill[k])}`} title={x.bySkill[k] ? `${x.bySkill[k].correct}/${x.bySkill[k].total}` : "no questions yet"}>{fmt(x.bySkill[k]?.pct ?? null, "%")}</td>)}
                <td className={`p-2 font-semibold tabular-nums ${pctTone(x.total)}`}>{fmt(x.total.pct, "%")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function PollBar({ counts }: { counts: number[] }) {
  const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
  const colors = ["bg-emerald-600", "bg-emerald-300", "bg-orange-300", "bg-orange-600"];
  return (
    <span className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100" aria-label={POLL_LABELS.map((l, i) => `${l}: ${counts[i]}`).join(", ")}>
      {counts.map((c, i) => c > 0 && <span key={i} className={colors[i]} style={{ width: `${(100 * c) / total}%` }} />)}
    </span>
  );
}

function PollsTab({ rows }: { rows: Awaited<ReturnType<typeof pollReport>> }) {
  if (!rows.length) return <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No poll answers yet: students answer the poll before and after each article.</p>;
  return (
    <Section title="Opinions before and after reading" icon="🗳" hint="Did the article change minds? A shift toward agree or disagree shows students used the evidence.">
      <p className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">{POLL_LABELS.map((l, i) => <span key={l} className="flex items-center gap-1"><span className={`h-3 w-3 rounded ${["bg-emerald-600", "bg-emerald-300", "bg-orange-300", "bg-orange-600"][i]}`} />{l}</span>)}</p>
      <ul className="space-y-4">
        {rows.map((p) => (
          <li key={p.articleId} className="rounded-xl p-3 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-brand-navy">{p.title}</p>
              <p className="text-xs text-slate-500">{p.responses} student{p.responses === 1 ? "" : "s"} · {p.changed} changed their answer{p.shift !== null && p.shift !== 0 ? ` · moved toward ${p.shift > 0 ? "disagree" : "agree"} (${p.shift > 0 ? "+" : ""}${p.shift})` : ""}</p>
            </div>
            <div className="mt-2 grid grid-cols-[4rem_1fr] items-center gap-2 text-xs text-slate-600"><span>Before</span><PollBar counts={p.before} /><span>After</span><PollBar counts={p.after} /></div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function WritingTab({ q, classId, canWrite }: { q: Awaited<ReturnType<typeof writingQueue>>; classId: string; canWrite: boolean }) {
  return (
    <div className="space-y-6">
      <Section title={`To score (${q.pending.length})`} icon="✍️" hint="Thought questions: score 0–4 with the checklist, add a short comment. The student sees both.">
        {q.pending.length === 0 ? <p className="text-sm text-slate-600">Nothing to score. 🎉</p> : (
          <ul className="space-y-4">
            {q.pending.map((w) => (
              <li key={w.runId} className="rounded-2xl p-4 ring-1 ring-amber-300">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-bold text-brand-navy">{w.name}</p><p className="text-xs text-slate-500">{w.title} · {w.band} · {day(w.completedAt)}</p></div>
                <p className="mt-2 text-sm text-slate-700"><b>Prompt:</b> {w.prompt}</p>
                {w.checklist.length > 0 && <ul className="mt-1 list-disc ps-5 text-xs text-slate-500">{w.checklist.map((c) => <li key={c}>{c}</li>)}</ul>}
                <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-slate-900">{w.writing}</p>
                {w.aiScore !== null && (
                  <p className="mt-2 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-900 ring-1 ring-indigo-200">
                    🤖 <b>AI suggestion — check before saving:</b> {w.aiScore}/4{w.aiComment ? ` · "${w.aiComment}"` : ""}
                  </p>
                )}
                {canWrite ? (
                  <form action={scoreReadRiseWritingAction} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
                    <input type="hidden" name="classId" value={classId} /><input type="hidden" name="runId" value={w.runId} />
                    <fieldset className="flex gap-1"><legend className="mb-1 font-semibold">Score</legend>
                      {[0, 1, 2, 3, 4].map((n) => <label key={n} className="cursor-pointer"><input type="radio" name="score" value={n} required defaultChecked={w.aiScore === n} className="peer sr-only" /><span className="block rounded-lg px-3 py-1.5 font-bold ring-1 ring-slate-300 peer-checked:bg-brand-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-teal">{n}</span></label>)}
                    </fieldset>
                    <label className="flex min-w-[16rem] flex-1 flex-col gap-1 font-semibold">Comment (optional)<input name="comment" maxLength={1000} defaultValue={w.aiComment ?? ""} className={field} placeholder="One thing done well, one thing to improve" /></label>
                    <button className={btn}>Save score</button>
                  </form>
                ) : <p className="mt-2 text-xs text-slate-500">Only the class&apos;s teachers score.</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {q.scored.length > 0 && (
        <Section title="Recently scored" icon="✅">
          <ul className="divide-y divide-slate-100 text-sm">
            {q.scored.map((w) => <li key={w.runId} className="flex flex-wrap justify-between gap-2 py-2"><span><b className="text-brand-navy">{w.name}</b> · {w.title}</span><span className="tabular-nums font-semibold">{w.score}/4</span></li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}

function AssignTab({ classId, canWrite, assigned, library }: { classId: string; canWrite: boolean; assigned: Awaited<ReturnType<typeof classArticles>>; library: Awaited<ReturnType<typeof assignableArticles>> }) {
  const have = new Set(assigned.map((a) => a.articleId));
  const topics = [...new Set(library.map((a) => a.topic))].sort();
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section title={`Assigned to this class (${assigned.length})`} icon="📌" hint="Students see these first. Each student reads the version of their own level.">
        {assigned.length === 0 ? <p className="text-sm text-slate-600">Nothing assigned: students choose from the whole library.</p> : (
          <ul className="space-y-2">
            {assigned.map((a) => (
              <li key={a.articleId} className="flex flex-wrap items-center gap-3 rounded-xl p-3 ring-1 ring-slate-200">
                <div className="me-auto min-w-0"><p className="truncate font-semibold text-brand-navy">{a.title}</p><p className="text-xs text-slate-500">{a.topic} · {a.dueAt ? `due ${day(a.dueAt)}` : "no due date"}</p></div>
                <span className="text-sm tabular-nums text-slate-700">{a.done}/{a.students} done</span>
                {canWrite && (
                  <form action={unassignReadRiseAction}><input type="hidden" name="classId" value={classId} /><input type="hidden" name="articleId" value={a.articleId} />
                    <button className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50">Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {canWrite ? (
        <Section title="Assign articles" icon="➕" hint="Tick one or more published articles. Assigning again changes the due date.">
          {library.length === 0 ? <p className="text-sm text-slate-600">No published articles yet.</p> : (
            <form action={assignReadRiseAction} className="space-y-3">
              <input type="hidden" name="classId" value={classId} />
              <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                {topics.map((t) => (
                  <fieldset key={t}><legend className="text-xs font-bold uppercase tracking-wide text-slate-500">{t}</legend>
                    {library.filter((a) => a.topic === t).map((a) => (
                      <label key={a.id} className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" name="articleId" value={a.id} className="h-4 w-4 accent-teal-600" /><span>{a.title} <span className="text-xs text-slate-400">{a.code}</span>{have.has(a.id) && <span className="ms-1 text-xs font-semibold text-teal-700">(assigned)</span>}</span></label>
                    ))}
                  </fieldset>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <AssignDates field={field} />
                <button className={btn}>Assign to the class</button>
              </div>
            </form>
          )}
        </Section>
      ) : <Section title="Assign articles" icon="➕"><p className="text-sm text-slate-600">Only the class&apos;s teachers assign articles.</p></Section>}
    </div>
  );
}
