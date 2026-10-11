import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { ReadingLevelLabel, ReadingScalesHelp } from "@/components/reading-level";
import { ClassChips, Empty, ExportLinks, fmtNum, fmtPct, fmtSigned, pctTone, Stat, Stats, TableBox, td, th, WindowChips } from "@/components/reports/report-ui";
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
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="⭐" title="ReadMaster results"
        subtitle={<>Articles read, each student's <ReadingLevelLabel scale="READMASTER" /> (start → now), accuracy by question type and time. Time and rapid guesses are recorded for articles read since this update.</>} />
      <ReadingScalesHelp className="mb-4" />
      <ClassChips classes={classes} current={klass?.id ?? null} href={(id) => url(id)} />
      {klass && <WindowChips days={days} href={(d) => url(klass.id, d)} />}
      {!r ? <Empty>You have no classes yet.</Empty> : (
        <div className="space-y-5">
          <Stats>
            <Stat label="Readers" value={`${r.summary.readers} / ${r.summary.students}`} note={`last ${r.days} days`} />
            <Stat label="Articles" value={r.summary.articles} />
            <Stat label="Accuracy" value={fmtPct(r.summary.accuracy)} />
            <Stat label="Avg Lexile change" value={fmtSigned(r.summary.avgChange)} note="ReadMaster reading Lexile" />
            <Stat label="Minutes" value={fmtNum(r.summary.minutes)} note="timed articles" />
            <Stat label="Rapid guesses" value={fmtPct(r.summary.rapidPct)} tone={(r.summary.rapidPct ?? 0) >= 20 ? "amber" : "slate"} />
          </Stats>
          <ExportLinks report={{ kind: "readmaster", classId: klass!.id, days, period: "TERM" }} />
          <Section title="Students" icon="👩‍🎓">
            <TableBox label="Students">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr><th className={th}>Student</th><th className={th}>Articles</th><th className={th}>Reading Lexile start</th><th className={th}>Now</th><th className={th}>Change</th><th className={th}>Accuracy</th><th className={th}>Minutes</th><th className={th}>Rapid</th><th className={th}>Last read</th></tr></thead>
                <tbody>{r.students.map((s) => (
                  <tr key={s.studentId} className="border-t border-slate-100">
                    <td className={td}><Link href={`/teacher/reports/readmaster/${s.studentId}`} className="inline-flex min-h-8 items-center font-semibold text-brand-teal hover:underline"><bdi>{s.name}</bdi></Link></td>
                    <td className={td}>{s.articles}{s.totalArticles > s.articles ? <span className="text-xs text-slate-500"> ({s.totalArticles} in all)</span> : null}</td>
                    <td className={`${td} tabular-nums`}>{s.lexileStart === null ? "—" : `${s.lexileStart}L`}</td><td className={`${td} tabular-nums`}>{s.lexileNow === null ? "—" : `${s.lexileNow}L`}</td>
                    <td className={`${td} tabular-nums ${(s.change ?? 0) > 0 ? "text-emerald-700" : (s.change ?? 0) < 0 ? "text-red-700" : ""}`}>{fmtSigned(s.change)}</td>
                    <td className={`${td} font-semibold ${pctTone(s.accuracy)}`}>{fmtPct(s.accuracy)}</td><td className={td}>{fmtNum(s.minutes)}</td><td className={td}>{fmtNum(s.rapid)}</td><td className={td}>{s.lastRead ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </TableBox>
          </Section>
          <Section title="Accuracy by question type" icon="🧩" hint="ReadMaster answers saved through the engine; rapid guesses left out.">
            {r.types.length ? (
              <TableBox label="Accuracy by question type">
                <table className="w-full min-w-[420px] text-sm">
                  <thead><tr><th className={th}>Question type</th><th className={th}>Answers</th><th className={th}>Accuracy</th><th className={th}>Rapid</th></tr></thead>
                  <tbody>{r.types.map((t) => <tr key={t.type} className="border-t border-slate-100"><td className={td}>{t.name}</td><td className={td}>{t.answers}</td><td className={`${td} font-semibold ${pctTone(t.accuracy)}`}>{fmtPct(t.accuracy)}</td><td className={td}>{t.rapid}</td></tr>)}</tbody>
                </table>
              </TableBox>
            ) : <p className="text-slate-600">No ReadMaster answers in this window.</p>}
          </Section>
        </div>
      )}
    </AppShell>
  );
}
