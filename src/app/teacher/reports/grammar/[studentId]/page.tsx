import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { fmtNum, fmtPct, pctTone, Stat, Stats, TableBox, td, th, WindowChips } from "@/components/reports/report-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studentGrammarReport } from "@/server/reports/grammar-report";
import { windowOf } from "@/server/reports/report-access";

export const metadata = { title: "Grammar results · student" };

/** 🔤 One student's grammar results: each grammar skill, the errors, the latest answers. */
export default async function StudentGrammarPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ days?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const days = windowOf((await searchParams).days);
  let r;
  try { r = await studentGrammarReport(repo, actor, studentId, { days }); } catch (e) {
    if (e instanceof ForbiddenError) return <AppShell name={String(me.displayName)}><p className="rounded-2xl bg-white p-6 text-slate-700 ring-1 ring-slate-200">Student not found.</p></AppShell>;
    throw e;
  }
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/reports/grammar", label: "Grammar results" }} icon="🔤" title="Grammar results" subtitle={<><bdi className="font-semibold">{r.name}</bdi> · Grade {r.grade}</>} />
      <WindowChips days={days} href={(d) => `/teacher/reports/grammar/${studentId}?days=${d}`} />
      <Stats>
        <Stat label="Answers" value={r.summary.answers} note={`last ${r.days} days`} />
        <Stat label="Accuracy" value={fmtPct(r.summary.accuracy)} note="rapid guesses left out" />
        <Stat label="Rapid guesses" value={r.summary.rapid} tone={r.summary.rapid ? "amber" : "slate"} />
        <Stat label="Avg mastery" value={fmtNum(r.summary.avgMastery)} />
        <Stat label="Skills to reteach" value={r.summary.reteach} tone={r.summary.reteach ? "red" : "teal"} />
      </Stats>
      <div className="space-y-5">
        <Section title="Skills" icon="🧩" hint="Weakest first. Reteach = 5+ careful answers and accuracy under 60% (or under 70% while mastery is still under 40).">
          {r.skills.length ? (
            <TableBox label="Skills">
              <table className="w-full min-w-[600px] text-sm">
                <thead><tr><th className={th}>Skill</th><th className={th}>Answers</th><th className={th}>Accuracy</th><th className={th}>Rapid</th><th className={th}>Mastery</th><th className={th}>Reteach</th></tr></thead>
                <tbody>{r.skills.map((k) => (
                  <tr key={k.skillId} className="border-t border-slate-100">
                    <td className={`${td} font-medium`}>{k.name}</td><td className={`${td} tabular-nums`}>{k.answers}</td><td className={`${td} font-semibold ${pctTone(k.accuracy)}`}>{fmtPct(k.accuracy)}</td>
                    <td className={td}>{k.rapid || "—"}</td><td className={td}>{fmtNum(k.mastery)}{k.band ? <span className="ms-1 text-xs text-slate-500">{k.band.toLowerCase()}</span> : null}</td>
                    <td className={td}>{k.reteach ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Reteach</span> : "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </TableBox>
          ) : <p className="text-slate-600">No grammar practice yet.</p>}
        </Section>
        <Section title="Error types" icon="🔎">
          {r.errors.length ? <ul className="space-y-2">{r.errors.map((e) => <li key={e.code} className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="font-semibold">{e.label} <span className="text-sm font-normal text-slate-500">· {e.count}</span></p>{e.fix && <p className="text-sm text-slate-600">{e.fix}</p>}</li>)}</ul> : <p className="text-slate-600">No error types recorded.</p>}
        </Section>
        <Section title="Latest answers" icon="🕘">
          {r.recent.length ? (
            <ul className="divide-y divide-slate-100">{r.recent.map((a, i) => (
              <li key={i} className="py-2 text-sm"><span className={a.correct ? "text-emerald-700" : "text-red-700"}>{a.correct ? "✓" : "✗"}</span> <span className="text-slate-500">{a.at} · {a.skill}</span>{a.rapid && <span className="ms-1 rounded bg-amber-100 px-1 text-xs text-amber-900">rapid</span>}<p className="text-slate-800">{a.stem}</p>{a.error && <p className="text-xs text-slate-500">{a.error}</p>}</li>
            ))}</ul>
          ) : <p className="text-slate-600">No answers in this window.</p>}
        </Section>
        <p><Link href={`/teacher/students/${studentId}`} className="inline-flex min-h-10 items-center font-semibold text-brand-teal hover:underline">Open the student page →</Link></p>
      </div>
    </AppShell>
  );
}
