import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, EmptyState, ReportHeader, ReportSection, toneOfPct } from "@/components/report-kit";
import { RichInline } from "@/components/rich-inline";
import { ScoreCurve } from "@/components/analytics/score-curve";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { loggedSkills, questionsLog, type LogSession } from "@/server/analytics/questions-log";

export const metadata = { title: "Questions log" };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = (m: number, t: (s: string) => string) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${t(m < 720 ? "AM" : "PM")}`;

/**
 * 🔎 Questions Log (Nov 2026, IXL-style): one student × one skill — every question they answered, their answer and
 * the right one, the time, hints and fast guesses, by session (newest first), and the mastery % curve. Without a
 * skill: the skills this student answered; without a student: the class to pick from. Read only.
 */
export default async function QuestionsLogPage({ searchParams }: { searchParams: Promise<{ classId?: string; student?: string; skill?: string; missed?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => String(c.id) === sp.classId) ?? classes[0];
  const cid = klass ? String(klass.id) : "";
  const q = (p: Record<string, string | undefined>) => `/teacher/reports/questions-log?${new URLSearchParams(Object.entries({ classId: cid, student: sp.student, skill: sp.skill, missed: sp.missed, ...p }).filter(([, v]) => v) as [string, string][])}`;
  const practiceHref = `/teacher/practice-analytics?${new URLSearchParams(Object.entries({ classId: cid, student: sp.student }).filter(([, v]) => v) as [string, string][])}`;
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  const header = (title: string, who?: string) => (
    <ReportHeader back={{ href: practiceHref, label: "Practice and time" }} icon="🔎" title={title} who={who ? <bdi>{who}</bdi> : klass ? <bdi>{String(klass.name)}</bdi> : undefined}
      subtitle="Every question the student answered on this skill: their answer, the right one, the time, hints and fast guesses." />
  );

  if (!klass) return <AppShell name={String(me.displayName)}>{header(t("Questions log"))}<EmptyState icon="🏫" title="You do not teach any class yet." /></AppShell>;

  // 1. no student yet: the class list
  if (!sp.student) {
    const ids = await classMembers(repo, cid);
    const names = await studentNames(repo, ids);
    const list = ids.map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
    return (
      <AppShell name={String(me.displayName)}>
        {header(t("Questions log"))}
        <div className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} prefetch={false} href={`/teacher/reports/questions-log?${new URLSearchParams({ classId: String(c.id) })}`} className={chip(String(c.id) === cid)}>{String(c.name)}</Link>)}</div>
        <ReportSection title="Choose a student" icon="🧑‍🎓">
          {!list.length ? <p className="text-sm text-slate-600">{t("No students in this class yet.")}</p> : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{list.map((x) => <li key={x.id}><Link prefetch={false} href={q({ student: x.id, skill: undefined })} className="block rounded-xl bg-white px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"><bdi>{x.name}</bdi></Link></li>)}</ul>
          )}
        </ReportSection>
      </AppShell>
    );
  }

  // 2. a student, no skill yet: the skills they answered
  if (!sp.skill) {
    let skills; let name = "";
    try {
      skills = await loggedSkills(repo, actor, { classId: cid, studentId: sp.student });
      name = (await studentNames(repo, [sp.student])).get(sp.student)?.name ?? "";
    } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
    return (
      <AppShell name={String(me.displayName)}>
        {header(t("Questions log"), name)}
        <ReportSection title="Choose a skill" icon="🧩" hint="The skills this student answered, the most recent first.">
          {!skills.length ? <p className="text-sm text-slate-600">{t("No answers yet.")}</p> : (
            <ul className="divide-y divide-slate-100">{skills.map((k) => (
              <li key={k.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link prefetch={false} href={q({ skill: k.key })} className="font-semibold text-brand-navy hover:underline">{k.name}</Link>
                <span className="text-sm tabular-nums text-slate-600">{t("{n} answers", { n: k.answered })} · <span dir="ltr">{k.last}</span></span>
              </li>
            ))}</ul>
          )}
        </ReportSection>
      </AppShell>
    );
  }

  // 3. the log
  let log;
  try { log = await questionsLog(repo, actor, { classId: cid, studentId: sp.student, skill: sp.skill, missedOnly: sp.missed === "1" }); }
  catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const x = log.totals;
  const sessionTitle = (ss: LogSession) => (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <b className="text-brand-navy">{t(WEEKDAYS[ss.weekday])} <span dir="ltr">{ss.day}</span></b>
      <span dir="ltr" className="tabular-nums">{ss.atSchool ? "🏫" : "🏠"} {clock(ss.startMin, t)} – {clock(ss.endMin, t)}</span>
      <span className="text-slate-600">{t(ss.sourceLabel)}</span>
      <span className="tabular-nums text-slate-600">{t("{c} of {n} right", { c: ss.correct, n: ss.answered })}{ss.accuracy !== null ? ` · ${ss.accuracy}%` : ""}</span>
    </span>
  );
  return (
    <AppShell name={String(me.displayName)}>
      {header(`${t("Questions log")} · ${log.skill.name}`, log.student.name)}
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link prefetch={false} href={q({ missed: undefined })} className={chip(sp.missed !== "1")}>{t("All answers")}</Link>
        <Link prefetch={false} href={q({ missed: "1" })} className={chip(sp.missed === "1")} data-missed-only>{t("Missed only")}</Link>
        <Link prefetch={false} href={q({ skill: undefined, missed: undefined })} className="ms-auto text-sm font-semibold text-brand-teal underline">{t("Another skill")}</Link>
      </div>
      <AtAGlance items={[
        { icon: "✍️", label: "Questions", value: x.answered, meaning: log.older ? t("+{n} older answers not listed", { n: log.older }) : undefined },
        { icon: "🎯", label: "Accuracy", value: x.accuracy !== null ? `${x.accuracy}%` : "—", meaning: t("{n} correct", { n: x.correct }), tone: toneOfPct(x.accuracy) },
        { icon: "⏱️", label: "Time", value: `${x.minutes} min`, meaning: "answering questions" },
        { icon: "💡", label: "Hints", value: x.hints },
        { icon: "⚡", label: "Fast guesses", value: x.guesses, tone: x.guesses ? "warn" : "neutral" },
        { icon: "⭐", label: "Mastery now", value: x.scoreNow !== null ? `${x.scoreNow}%` : "—" },
      ]} />
      <ReportSection title="Mastery after each answer" icon="📈"><ScoreCurve points={log.curve} t={t} /></ReportSection>
      {!log.sessions.length ? <EmptyState icon="✅" title={sp.missed === "1" ? "No missed answers." : "No answers yet."} /> : (
        <div className="space-y-4">{log.sessions.map((ss) => (
          <section key={ss.id} className="rk-section rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5" data-log-session={ss.id}>
            <h2 className="text-sm">{sessionTitle(ss)}</h2>
            <ol className="mt-3 space-y-2">{ss.answers.map((a) => (
              <li key={`${a.n}`} className={`rounded-2xl p-3 ring-1 ${a.correct ? "bg-emerald-50/50 ring-emerald-200" : "bg-rose-50/60 ring-rose-200"}`} data-answer={a.correct ? "right" : "wrong"}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-slate-800"><span className="me-2 font-bold tabular-nums text-slate-500">{a.n}.</span>{a.correct ? "✅" : "❌"} {a.missing ? <i className="text-slate-500">{t("This question is no longer in the bank.")}</i> : <span data-content lang="en"><RichInline text={a.stem} /></span>}</p>
                  <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-slate-600">
                    <span>{t("{n} s", { n: a.seconds })}</span>
                    {a.hint && <span title={t("Used a hint")}>💡</span>}
                    {a.guess && <span className="rounded-full bg-amber-100 px-1.5 font-semibold text-amber-900" title={t("Answered too fast to have read it")}>⚡</span>}
                    {a.score !== null && <span className="rounded-full bg-slate-100 px-1.5 font-semibold text-slate-700" title={t("Mastery after this answer")}>⭐ {a.score}%</span>}
                  </span>
                </div>
                {!a.missing && (
                  <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    <p><span className="text-slate-500">{t("Student's answer")}:</span> <b className={a.correct ? "text-emerald-800" : "text-rose-800"} data-content lang="en">{a.yourAnswer || "—"}</b>{a.partial && <span className="ms-1 text-xs text-amber-800">({t("partly right")})</span>}</p>
                    {!a.correct && <p><span className="text-slate-500">{t("Right answer")}:</span> <b className="text-emerald-800" data-content lang="en">{a.correctAnswer}</b></p>}
                  </div>
                )}
                {!a.correct && a.why && <details className="mt-1 text-sm"><summary className="cursor-pointer text-brand-teal">{t("Why")}</summary><p className="mt-1 text-slate-700" data-content lang="en"><RichInline text={a.why} /></p></details>}
              </li>
            ))}</ol>
          </section>
        ))}</div>
      )}
    </AppShell>
  );
}
