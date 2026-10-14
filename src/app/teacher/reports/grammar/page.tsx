import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ClassChips, Empty, exportsOf, fmtNum, fmtPct, pctTone, WindowChips, windowText } from "@/components/reports/report-ui";
import { AtAGlance, Callout, ReportHeader, ReportIntro, ReportSection, ReportSummary, ReportTable, SimpleBar, toneOfPct } from "@/components/report-kit";
import { grammarClassSummary, grammarSchoolSummary } from "@/lib/report-summaries";
import { getT } from "@/i18n/server";
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
  const { t } = await getT();
  const filters = (
    <>
      {can(actor, "analytics:school") && (
        <nav aria-label="View" className="mb-3 flex flex-wrap gap-2">
          <Link href={url({ view: "school" })} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${school ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>🏫 Whole school</Link>
        </nav>
      )}
      <ClassChips classes={classes} current={school ? null : klass?.id ?? null} href={(id) => url({ classId: id })} />
      <WindowChips days={days} href={(d) => url({ ...(school ? { view: "school" } : { classId: klass?.id }), days: d })} />
    </>
  );
  const exports = school ? exportsOf({ kind: "grammar", scope: "school", days, period: "TERM" }) : klass ? exportsOf({ kind: "grammar", classId: klass.id, days, period: "TERM" }) : [];
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🔤" title="Grammar results"
        subtitle="Grammar and mechanics skills of the grade: mastery, accuracy (rapid guesses left out), the errors students make and what to reteach."
        who={school ? t("Whole school") : klass?.name} when={windowText(t, days)} downloads={exports} filters={filters} />
      <ReportIntro text={school ? "Grammar accuracy of every class in the school, side by side." : "How well the class answers grammar questions, skill by skill, and what to re-teach."} />
      {school ? <SchoolView actorDays={days} /> : !klass ? <Empty>You have no classes yet.</Empty> : <ClassView classId={klass.id} days={days} />}
    </AppShell>
  );

  async function SchoolView({ actorDays }: { actorDays: number }) {
    const rows = await schoolGrammarReport(repo, actor, { days: actorDays });
    if (!rows.length) return <Empty>No classes yet.</Empty>;
    return (
      <>
        <Callout kind="next" items={[t("Open the class with the most skills to reteach first."), t("Classes under 60% accuracy need a short grammar lesson before more practice.")]} />
        <ReportSection title="Every class" icon="🏫" hint="The same numbers as each class's report." className="mt-5">
          <SimpleBar label="Accuracy" items={rows.map((r) => ({ label: <bdi>{r.name}</bdi>, value: r.accuracy, href: url({ classId: r.classId }) }))} className="mb-4" />
          <ReportTable label="Grammar results by class"
            cols={[{ key: "c", label: "Class" }, { key: "g", label: "Grade", num: true, more: true }, { key: "p", label: "Practised", num: true }, { key: "a", label: "Answers", num: true, more: true }, { key: "acc", label: "Accuracy", num: true }, { key: "m", label: "Avg mastery", num: true, more: true }, { key: "r", label: "Skills to reteach", num: true }]}
            rows={rows.map((r) => ({
              id: r.classId, flag: r.reteachSkills ? "warn" : undefined,
              sort: { c: r.name, p: r.practised, acc: r.accuracy, m: r.avgMastery },
              cells: { c: <Link className="font-semibold text-brand-teal hover:underline" href={url({ classId: r.classId })}><bdi>{r.name}</bdi></Link>, g: r.grade, p: `${r.practised} / ${r.students}`, a: r.answers,
                acc: <span className={`font-semibold ${pctTone(r.accuracy)}`}>{fmtPct(r.accuracy)}</span>, m: fmtNum(r.avgMastery), r: r.reteachSkills },
            }))} />
        </ReportSection>
        <ReportSummary summary={grammarSchoolSummary(rows, (id) => url({ classId: id }))} />
      </>
    );
  }

  async function ClassView({ classId, days: d }: { classId: string; days: number }) {
    const r = await classGrammarReport(repo, actor, classId, { days: d });
    const practisedSkills = r.skills.filter((k) => k.answers > 0 || k.avgMastery !== null);
    return (
      <div className="space-y-5">
        <AtAGlance items={[
          { icon: "👩‍🎓", label: "Practised", value: `${r.summary.practised} / ${r.summary.students}`, meaning: t("students answered grammar questions in the last {n} days", { n: r.days }), tone: r.summary.practised < r.summary.students ? "warn" : "good" },
          { icon: "✍️", label: "Answers", value: r.summary.answers, meaning: t("{n} rapid guesses left out of accuracy", { n: r.summary.rapid }) },
          { icon: "🎯", label: "Accuracy", value: fmtPct(r.summary.accuracy), meaning: "of careful answers were right", tone: toneOfPct(r.summary.accuracy) },
          { icon: "📈", label: "Avg mastery", value: fmtNum(r.summary.avgMastery), meaning: "0–100: how well the skills are learned" },
          { icon: "🔁", label: "Skills to reteach", value: r.summary.reteachSkills, meaning: r.summary.reteachSkills ? "skills where several students need help" : "nothing to reteach right now", tone: r.summary.reteachSkills ? "bad" : "good" },
        ]} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Callout kind="help" items={r.reteach.slice(0, 4).map((x) => <><b>{x.name}</b>: {x.students.map((st, i) => <span key={st.id}>{i ? ", " : ""}<bdi>{st.name}</bdi></span>)}</>)} />
          <Callout kind="next" items={[
            r.reteach[0] ? <>{t("Reteach")} <b>{r.reteach[0].name}</b>{r.reteach[0].move ? <> — {r.reteach[0].move}</> : null}</> : t("Nothing to reteach in this window. Keep the daily practice going."),
            r.errors[0] ? <>{t("Most common error")}: <b>{r.errors[0].label}</b>{r.errors[0].fix ? <> — {r.errors[0].fix}</> : null}</> : null,
          ]} />
        </div>

        <ReportSection title="Recommended reteach" icon="🎯" hint="A skill where 2+ students (or 30%+ of those who practised) need it: 5+ careful answers and accuracy under 60% (or under 70% while mastery is still under 40).">
          {r.reteach.length ? (
            <ul className="grid gap-3 md:grid-cols-2">{r.reteach.map((x) => (
              <li key={x.skillId} className="min-w-0 break-inside-avoid rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <p className="font-bold text-brand-navy">{x.name}</p>
                <p className="mt-1 text-sm text-slate-700">{x.students.length} student{x.students.length === 1 ? "" : "s"}: {x.students.map((s, i) => <span key={s.id}>{i ? ", " : ""}<bdi>{s.name}</bdi></span>)}</p>
                {x.error && <p className="mt-2 text-sm"><b>Most common error:</b> {x.error}</p>}
                {x.move && <p className="mt-1 text-sm"><b>Teaching move:</b> {x.move}</p>}
                <Link href={`/teacher/skill-assign?classId=${classId}&skillId=${x.skillId}`} className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand-teal hover:underline print:hidden">Assign practice on this skill →</Link>
              </li>
            ))}</ul>
          ) : <p className="text-slate-600">Nothing to reteach in this window. 👍</p>}
        </ReportSection>

        <ReportSection title="Skills" icon="🧩" hint="Accuracy by skill: ✓ 80%+ strong · ~ 60–79% getting there · ! under 60% needs help.">
          {practisedSkills.length ? (
            <>
              <SimpleBar items={practisedSkills.map((k) => ({ label: k.name, value: k.accuracy, note: t("{n} answers", { n: k.answers }) }))} className="mb-5" />
              <ReportTable label="Grammar skills"
                cols={[{ key: "s", label: "Skill" }, { key: "st", label: "Students", num: true }, { key: "a", label: "Answers", num: true, more: true }, { key: "acc", label: "Accuracy", num: true }, { key: "m", label: "Avg mastery", num: true, more: true }, { key: "r", label: "To reteach", num: true }, { key: "e", label: "Most common error", more: true }]}
                rows={practisedSkills.map((k) => ({
                  id: k.skillId, flag: k.reteach.length ? "bad" : undefined, sort: { acc: k.accuracy, m: k.avgMastery, r: k.reteach.length, e: k.topError?.label ?? null },
                  cells: { s: k.name, st: k.practised, a: k.answers, acc: <span className={`font-semibold ${pctTone(k.accuracy)}`}>{fmtPct(k.accuracy)}</span>, m: fmtNum(k.avgMastery), r: k.reteach.length || "—", e: <span className="text-slate-600">{k.topError?.label ?? "—"}</span> },
                }))} />
            </>
          ) : <p className="text-slate-600">No grammar practice in this window.</p>}
        </ReportSection>

        <ReportSection title="Students" icon="👩‍🎓" hint="Open a student for each skill and their recent answers.">
          <ReportTable label="Students"
            cols={[{ key: "n", label: "Student" }, { key: "a", label: "Answers", num: true, more: true }, { key: "acc", label: "Accuracy", num: true }, { key: "m", label: "Avg mastery", num: true, more: true }, { key: "s", label: "Skills", num: true, more: true }, { key: "r", label: "To reteach", num: true }, { key: "e", label: "Most common error" }]}
            rows={r.students.map((st) => ({
              id: st.studentId, flag: st.reteach ? "bad" : undefined, sort: { n: st.name, acc: st.accuracy, m: st.avgMastery, r: st.reteach, e: st.topError },
              cells: { n: <Link className="inline-flex min-h-8 items-center font-semibold text-brand-teal hover:underline" href={`/teacher/reports/grammar/${st.studentId}?days=${d}`}><bdi>{st.name}</bdi></Link>,
                a: st.answers, acc: <span className={`font-semibold ${pctTone(st.accuracy)}`}>{fmtPct(st.accuracy)}</span>, m: fmtNum(st.avgMastery), s: st.skillsPractised, r: st.reteach || "—", e: <span className="text-slate-600">{st.topError ?? "—"}</span> },
            }))} />
        </ReportSection>

        <ReportSection title="Common error types" icon="🔎" hint="From wrong answers (rapid guesses left out).">
          {r.errors.length ? (
            <ul className="space-y-2">{r.errors.slice(0, 8).map((e) => (
              <li key={e.code} className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="font-semibold text-slate-900">{e.label} <span className="text-sm font-normal text-slate-500">· {e.count} wrong answers · {e.students} students</span></p>{e.fix && <p className="mt-1 text-sm text-slate-600">{e.fix}</p>}</li>
            ))}</ul>
          ) : <p className="text-slate-600">No error types recorded in this window.</p>}
        </ReportSection>
        <ReportSummary summary={grammarClassSummary(r, classId, actor.role !== "TEACHER")} />
      </div>
    );
  }
}
