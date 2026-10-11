import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { ClassChips, Empty, ExportLinks, fmtNum, fmtPct, pctTone, Stat, Stats, TableBox, td, th, WindowChips } from "@/components/reports/report-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { readableClasses } from "@/server/teacher/coordinators";
import { classGrammarReport, schoolGrammarReport } from "@/server/reports/grammar-report";
import { windowOf } from "@/server/reports/report-access";

export const metadata = { title: "Grammar results" };

/** 🔤 Grammar results: a class's grammar and mechanics skills — mastery, accuracy, errors, what to reteach (and the school view for admins). */
export default async function GrammarReportPage({ searchParams }: { searchParams: Promise<{ classId?: string; days?: string; view?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const days = windowOf(sp.days);
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const school = can(actor, "analytics:school") && sp.view === "school";
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const url = (o: { classId?: string; days?: number; view?: string }) => `/teacher/reports/grammar?${new URLSearchParams({ ...(o.view ? { view: o.view } : { classId: o.classId ?? klass?.id ?? "" }), days: String(o.days ?? days) }).toString()}`;
  const header = (
    <PageHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🔤" title="Grammar results"
      subtitle="Grammar and mechanics skills of the grade: mastery, accuracy (rapid guesses left out), the errors students make and what to reteach." />
  );
  return (
    <AppShell name={String(me.displayName)}>
      {header}
      {can(actor, "analytics:school") && (
        <nav aria-label="View" className="mb-3 flex flex-wrap gap-2">
          <Link href={url({ view: "school" })} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${school ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>🏫 Whole school</Link>
        </nav>
      )}
      <ClassChips classes={classes} current={school ? null : klass?.id ?? null} href={(id) => url({ classId: id })} />
      <WindowChips days={days} href={(d) => url({ ...(school ? { view: "school" } : { classId: klass?.id }), days: d })} />
      {school ? <SchoolView actorDays={days} /> : !klass ? <Empty>You have no classes yet.</Empty> : <ClassView classId={klass.id} days={days} />}
    </AppShell>
  );

  async function SchoolView({ actorDays }: { actorDays: number }) {
    const rows = await schoolGrammarReport(repo, actor, { days: actorDays });
    return (
      <Section title="Every class" icon="🏫" hint="The same numbers as each class's report.">
        <ExportLinks report={{ kind: "grammar", scope: "school", days: actorDays, period: "TERM" }} />
        <TableBox label="Grammar results by class">
          <table className="mt-3 w-full min-w-[640px] text-sm">
            <thead><tr><th className={th}>Class</th><th className={th}>Grade</th><th className={th}>Practised</th><th className={th}>Answers</th><th className={th}>Accuracy</th><th className={th}>Avg mastery</th><th className={th}>Skills to reteach</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.classId} className="border-t border-slate-100">
                <td className={td}><Link className="font-semibold text-brand-teal hover:underline" href={url({ classId: r.classId })}><bdi>{r.name}</bdi></Link></td>
                <td className={td}>{r.grade}</td><td className={td}>{r.practised} / {r.students}</td><td className={`${td} tabular-nums`}>{r.answers}</td>
                <td className={`${td} font-semibold ${pctTone(r.accuracy)}`}>{fmtPct(r.accuracy)}</td><td className={td}>{fmtNum(r.avgMastery)}</td><td className={td}>{r.reteachSkills}</td>
              </tr>
            ))}</tbody>
          </table>
        </TableBox>
      </Section>
    );
  }

  async function ClassView({ classId, days: d }: { classId: string; days: number }) {
    const r = await classGrammarReport(repo, actor, classId, { days: d });
    const practisedSkills = r.skills.filter((k) => k.answers > 0 || k.avgMastery !== null);
    return (
      <div className="space-y-5">
        <Stats>
          <Stat label="Practised" value={`${r.summary.practised} / ${r.summary.students}`} note={`last ${r.days} days`} />
          <Stat label="Answers" value={r.summary.answers} />
          <Stat label="Accuracy" value={fmtPct(r.summary.accuracy)} note="rapid guesses left out" tone={(r.summary.accuracy ?? 100) < 60 ? "amber" : "slate"} />
          <Stat label="Rapid guesses" value={r.summary.rapid} tone={r.summary.rapid ? "amber" : "slate"} />
          <Stat label="Avg mastery" value={fmtNum(r.summary.avgMastery)} note="0–100" />
          <Stat label="Skills to reteach" value={r.summary.reteachSkills} tone={r.summary.reteachSkills ? "red" : "teal"} />
        </Stats>
        <ExportLinks report={{ kind: "grammar", classId, days: d, period: "TERM" }} />

        <Section title="Recommended reteach" icon="🎯" hint="A skill where 2+ students (or 30%+ of those who practised) need it: 5+ careful answers and accuracy under 60% (or under 70% while mastery is still under 40).">
          {r.reteach.length ? (
            <ul className="grid gap-3 md:grid-cols-2">{r.reteach.map((x) => (
              <li key={x.skillId} className="min-w-0 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <p className="font-bold text-brand-navy">{x.name}</p>
                <p className="mt-1 text-sm text-slate-700">{x.students.length} student{x.students.length === 1 ? "" : "s"}: {x.students.map((s, i) => <span key={s.id}>{i ? ", " : ""}<bdi>{s.name}</bdi></span>)}</p>
                {x.error && <p className="mt-2 text-sm"><b>Most common error:</b> {x.error}</p>}
                {x.move && <p className="mt-1 text-sm"><b>Teaching move:</b> {x.move}</p>}
                <Link href={`/teacher/skill-assign?classId=${classId}&skillId=${x.skillId}`} className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand-teal hover:underline">Assign practice on this skill →</Link>
              </li>
            ))}</ul>
          ) : <p className="text-slate-600">Nothing to reteach in this window. 👍</p>}
        </Section>

        <Section title="Skills" icon="🧩">
          {practisedSkills.length ? (
            <TableBox label="Grammar skills">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr><th className={th}>Skill</th><th className={th}>Students</th><th className={th}>Answers</th><th className={th}>Accuracy</th><th className={th}>Avg mastery</th><th className={th}>To reteach</th><th className={th}>Most common error</th></tr></thead>
                <tbody>{practisedSkills.map((k) => (
                  <tr key={k.skillId} className="border-t border-slate-100">
                    <td className={`${td} font-medium`}>{k.name}</td><td className={td}>{k.practised}</td><td className={`${td} tabular-nums`}>{k.answers}</td>
                    <td className={`${td} font-semibold ${pctTone(k.accuracy)}`}>{fmtPct(k.accuracy)}</td><td className={td}>{fmtNum(k.avgMastery)}</td><td className={td}>{k.reteach.length || "—"}</td>
                    <td className={`${td} text-slate-600`}>{k.topError?.label ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </TableBox>
          ) : <p className="text-slate-600">No grammar practice in this window.</p>}
        </Section>

        <Section title="Students" icon="👩‍🎓" hint="Open a student for each skill and their recent answers.">
          <TableBox label="Students">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr><th className={th}>Student</th><th className={th}>Answers</th><th className={th}>Accuracy</th><th className={th}>Avg mastery</th><th className={th}>Skills</th><th className={th}>To reteach</th><th className={th}>Most common error</th></tr></thead>
              <tbody>{r.students.map((st) => (
                <tr key={st.studentId} className="border-t border-slate-100">
                  <td className={td}><Link className="inline-flex min-h-8 items-center font-semibold text-brand-teal hover:underline" href={`/teacher/reports/grammar/${st.studentId}?days=${d}`}><bdi>{st.name}</bdi></Link></td>
                  <td className={`${td} tabular-nums`}>{st.answers}</td><td className={`${td} font-semibold ${pctTone(st.accuracy)}`}>{fmtPct(st.accuracy)}</td><td className={td}>{fmtNum(st.avgMastery)}</td>
                  <td className={td}>{st.skillsPractised}</td><td className={td}>{st.reteach || "—"}</td><td className={`${td} text-slate-600`}>{st.topError ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </TableBox>
        </Section>

        <Section title="Common error types" icon="🔎" hint="From wrong answers (rapid guesses left out).">
          {r.errors.length ? (
            <ul className="space-y-2">{r.errors.slice(0, 8).map((e) => (
              <li key={e.code} className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="font-semibold text-slate-900">{e.label} <span className="text-sm font-normal text-slate-500">· {e.count} wrong answers · {e.students} students</span></p>{e.fix && <p className="mt-1 text-sm text-slate-600">{e.fix}</p>}</li>
            ))}</ul>
          ) : <p className="text-slate-600">No error types recorded in this window.</p>}
        </Section>
      </div>
    );
  }
}
