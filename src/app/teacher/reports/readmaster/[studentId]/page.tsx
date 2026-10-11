import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { ReadingLevelLabel, ReadingScalesHelp } from "@/components/reading-level";
import { fmtNum, fmtPct, fmtSigned, pctTone, Stat, Stats, TableBox, td, th } from "@/components/reports/report-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studentReadMasterReport } from "@/server/reports/readmaster-report";

export const metadata = { title: "ReadMaster · student" };

/** ⭐ One student's ReadMaster: every article (version, Lexile before → after, score, time) and accuracy by question type. */
export default async function StudentReadMasterPage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  let r;
  try { r = await studentReadMasterReport(repo, actor, studentId); } catch (e) {
    if (e instanceof ForbiddenError) return <AppShell name={String(me.displayName)}><p className="rounded-2xl bg-white p-6 text-slate-700 ring-1 ring-slate-200">Student not found.</p></AppShell>;
    throw e;
  }
  const max = Math.max(1, ...r.articles.map((a) => a.lexileAfter)), min = Math.min(max - 1, ...r.articles.map((a) => a.lexileBefore));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/reports/readmaster", label: "ReadMaster results" }} icon="⭐" title="ReadMaster" subtitle={<><bdi className="font-semibold">{r.name}</bdi> · Grade {r.grade} · <ReadingLevelLabel scale="READMASTER" value={r.row.lexileNow} /></>} />
      <ReadingScalesHelp className="mb-4" />
      <Stats>
        <Stat label="Articles" value={r.row.articles} note="last 12 months" />
        <Stat label="Lexile start → now" value={<span className="text-lg">{r.row.lexileStart ?? "—"} → {r.row.lexileNow ?? "—"}</span>} note={`change ${fmtSigned(r.row.change)}`} />
        <Stat label="Accuracy" value={fmtPct(r.row.accuracy)} />
        <Stat label="Minutes" value={fmtNum(r.row.minutes)} note={`${r.row.timedArticles} timed article(s)`} />
        <Stat label="Rapid answers" value={fmtNum(r.row.rapid)} tone={(r.row.rapid ?? 0) > 0 ? "amber" : "slate"} />
      </Stats>
      <div className="space-y-5">
        <Section title="ReadMaster reading Lexile, article by article" icon="📈">
          {r.articles.length ? (
            <div className="flex h-28 items-end gap-1" role="img" aria-label={`Reading Lexile after each article: ${r.articles.map((a) => a.lexileAfter).join(", ")}`}>
              {r.articles.map((a, i) => <span key={i} title={`${a.date}: ${a.lexileBefore}L → ${a.lexileAfter}L`} className={`flex-1 rounded-t ${a.lexileAfter > a.lexileBefore ? "bg-emerald-500" : a.lexileAfter < a.lexileBefore ? "bg-red-400" : "bg-brand-teal"}`} style={{ height: `${15 + (85 * (a.lexileAfter - min)) / Math.max(1, max - min)}%` }} />)}
            </div>
          ) : <p className="text-slate-600">No article read yet.</p>}
        </Section>
        <Section title="Articles" icon="📰">
          {r.articles.length ? (
            <TableBox label="Articles">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr><th className={th}>Date</th><th className={th}>Article</th><th className={th}>Version</th><th className={th}>Lexile</th><th className={th}>Score</th><th className={th}>Minutes</th><th className={th}>Rapid</th></tr></thead>
                <tbody>{r.articles.map((a, i) => (
                  <tr key={i} className="border-t border-slate-100"><td className={td}>{a.date}</td><td className={`${td} font-medium`}>{a.title}</td><td className={td}>{a.version.toLowerCase()}</td><td className={`${td} tabular-nums`}>{a.lexileBefore}L → {a.lexileAfter}L</td><td className={`${td} font-semibold ${pctTone(a.total ? Math.round((100 * a.correct) / a.total) : null)}`}>{a.correct}/{a.total}</td><td className={td}>{fmtNum(a.minutes)}</td><td className={td}>{fmtNum(a.rapid)}</td></tr>
                ))}</tbody>
              </table>
            </TableBox>
          ) : <p className="text-slate-600">No article read yet.</p>}
        </Section>
        <Section title="Accuracy by question type" icon="🧩">
          {r.types.length ? <ul className="grid gap-2 sm:grid-cols-2">{r.types.map((t) => <li key={t.type} className="rounded-xl bg-white p-3 ring-1 ring-slate-200 text-sm"><b>{t.name}</b>: <span className={`font-semibold ${pctTone(t.accuracy)}`}>{fmtPct(t.accuracy)}</span> of {t.answers}{t.rapid ? ` (${t.rapid} rapid)` : ""}</li>)}</ul> : <p className="text-slate-600">No answers yet.</p>}
        </Section>
        <p><Link href={`/teacher/students/${studentId}`} className="inline-flex min-h-10 items-center font-semibold text-brand-teal hover:underline">Open the student page →</Link></p>
      </div>
    </AppShell>
  );
}
