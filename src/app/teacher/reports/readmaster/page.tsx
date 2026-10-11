import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReadingLevelLabel, ReadingScalesHelp } from "@/components/reading-level";
import { ClassChips, Empty, exportsOf, fmtNum, fmtPct, fmtSigned, pctTone, WindowChips, windowText } from "@/components/reports/report-ui";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar, toneOfPct } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classReadMasterReport } from "@/server/reports/readmaster-report";
import { windowOf } from "@/server/reports/report-access";

export const metadata = { title: "ReadMaster results" };

/** ⭐ ReadMaster results for a class: articles read, the ReadMaster reading Lexile, accuracy by question type, time. */
export default async function ReadMasterReportPage({ searchParams }: { searchParams: Promise<{ classId?: string; days?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const days = windowOf(sp.days, 90);
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const url = (classId: string, d = days) => `/teacher/reports/readmaster?classId=${classId}&days=${d}`;
  const r = klass ? await classReadMasterReport(repo, actor, klass.id, { days }) : null;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="⭐" title="ReadMaster results"
        subtitle={<>Articles read, each student's <ReadingLevelLabel scale="READMASTER" /> (start → now), accuracy by question type and time. Time and rapid guesses are recorded for articles read since this update.</>}
        who={klass?.name} when={windowText(t, days)} downloads={klass ? exportsOf({ kind: "readmaster", classId: klass.id, days, period: "TERM" }) : []}
        filters={<><ClassChips classes={classes} current={klass?.id ?? null} href={(id) => url(id)} />{klass && <WindowChips days={days} href={(d) => url(klass.id, d)} />}</>} />
      <ReadingScalesHelp className="mb-4" />
      {!r ? <Empty>You have no classes yet.</Empty> : (
        <div className="space-y-5">
          <AtAGlance items={[
            { icon: "📚", label: "Readers", value: `${r.summary.readers} / ${r.summary.students}`, meaning: t("students read at least one article in the last {n} days", { n: r.days }), tone: r.summary.readers < r.summary.students ? "warn" : "good" },
            { icon: "📰", label: "Articles", value: r.summary.articles, meaning: t("{n} minutes on timed articles", { n: fmtNum(r.summary.minutes) }) },
            { icon: "🎯", label: "Accuracy", value: fmtPct(r.summary.accuracy), meaning: "of the questions after reading were right", tone: toneOfPct(r.summary.accuracy) },
            { icon: "📈", label: "Avg Lexile change", value: fmtSigned(r.summary.avgChange), meaning: "ReadMaster reading Lexile since the first article", tone: (r.summary.avgChange ?? 0) > 0 ? "good" : (r.summary.avgChange ?? 0) < 0 ? "bad" : "neutral" },
            { icon: "⚡", label: "Rapid guesses", value: fmtPct(r.summary.rapidPct), meaning: "answers too fast to have been read", tone: (r.summary.rapidPct ?? 0) >= 20 ? "warn" : "neutral" },
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Callout kind="help" items={[
              (() => { const n = r.students.filter((s) => !s.articles); return n.length ? <>{t("Not reading yet")}: {n.slice(0, 8).map((s, i) => <span key={s.studentId}>{i ? ", " : ""}<bdi>{s.name}</bdi></span>)}{n.length > 8 ? ` +${n.length - 8}` : ""}</> : null; })(),
              (() => { const n = r.students.filter((s) => (s.change ?? 0) < 0); return n.length ? <>{t("Reading Lexile went down")}: {n.slice(0, 8).map((s, i) => <span key={s.studentId}>{i ? ", " : ""}<bdi>{s.name}</bdi></span>)}</> : null; })(),
              (() => { const n = r.students.filter((s) => s.accuracy !== null && s.accuracy < 60); return n.length ? <>{t("Under 60% accuracy")}: {n.slice(0, 8).map((s, i) => <span key={s.studentId}>{i ? ", " : ""}<bdi>{s.name}</bdi></span>)}</> : null; })(),
            ]} />
            <Callout kind="next" items={[
              r.types.length ? (() => { const w = [...r.types].filter((x) => x.accuracy !== null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0]; return w ? <>{t("Model the weakest question type in class")}: <b>{w.name}</b> ({fmtPct(w.accuracy)})</> : null; })() : null,
              t("Ask students who are not reading yet to read one article this week."),
            ]} />
          </div>
          <ReportSection title="Students" icon="👩‍🎓">
            <ReportTable label="Students"
              cols={[{ key: "n", label: "Student" }, { key: "a", label: "Articles", num: true }, { key: "ls", label: "Reading Lexile start", num: true }, { key: "ln", label: "Now", num: true }, { key: "c", label: "Change", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "m", label: "Minutes", num: true }, { key: "r", label: "Rapid", num: true }, { key: "l", label: "Last read" }]}
              rows={r.students.map((s) => ({
                id: s.studentId, flag: !s.articles || (s.change ?? 0) < 0 ? "warn" : undefined,
                sort: { n: s.name, a: s.articles, ls: s.lexileStart, ln: s.lexileNow, c: s.change, acc: s.accuracy, m: s.minutes, r: s.rapid, l: s.lastRead },
                cells: { n: <Link href={`/teacher/reports/readmaster/${s.studentId}`} className="inline-flex min-h-8 items-center font-semibold text-brand-teal hover:underline"><bdi>{s.name}</bdi></Link>,
                  a: <>{s.articles}{s.totalArticles > s.articles ? <span className="text-xs text-slate-500"> ({s.totalArticles} in all)</span> : null}</>,
                  ls: s.lexileStart === null ? "—" : `${s.lexileStart}L`, ln: s.lexileNow === null ? "—" : `${s.lexileNow}L`,
                  c: <span className={(s.change ?? 0) > 0 ? "font-semibold text-emerald-700" : (s.change ?? 0) < 0 ? "font-semibold text-red-700" : ""}>{(s.change ?? 0) > 0 ? "▲ " : (s.change ?? 0) < 0 ? "▼ " : ""}{fmtSigned(s.change)}</span>,
                  acc: <span className={`font-semibold ${pctTone(s.accuracy)}`}>{fmtPct(s.accuracy)}</span>, m: fmtNum(s.minutes), r: fmtNum(s.rapid), l: s.lastRead ?? "—" },
              }))} />
          </ReportSection>
          <ReportSection title="Accuracy by question type" icon="🧩" hint="ReadMaster answers saved through the engine; rapid guesses left out.">
            {r.types.length ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <SimpleBar items={r.types.map((x) => ({ label: x.name, value: x.accuracy, note: t("{n} answers", { n: x.answers }) }))} />
                <ReportTable label="Accuracy by question type"
                  cols={[{ key: "q", label: "Question type" }, { key: "a", label: "Answers", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "r", label: "Rapid", num: true }]}
                  rows={r.types.map((x) => ({ id: x.type, sort: { acc: x.accuracy }, cells: { q: x.name, a: x.answers, acc: <span className={`font-semibold ${pctTone(x.accuracy)}`}>{fmtPct(x.accuracy)}</span>, r: x.rapid } }))} />
              </div>
            ) : <p className="text-slate-600">No ReadMaster answers in this window.</p>}
          </ReportSection>
        </div>
      )}
    </AppShell>
  );
}
