import Link from "next/link";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { AssignmentSummary } from "../../server/teacher/assignments";
import type { ClassOverview as Overview, GroupName } from "../../server/teacher/queries";
import { AtAGlance, BandBar, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar, toneOfPct } from "../report-kit";

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

const GROUP_STYLE: Record<GroupName, string> = {
  Intervention: "border-amber-400",
  Developing: "border-teal-300",
  Meeting: "border-teal-600",
  Advanced: "border-brand-gold",
};

export function ClassOverviewView({ o, assignments, resolveAction, heatMap, badgeOf }: {
  o: Overview;
  /** Games Part 3: the avatar + favorite badge emblem shown next to each student's name */
  badgeOf?: Record<string, React.ReactNode>;
  assignments: AssignmentSummary[];
  resolveAction?: (f: FormData) => void | Promise<void>;
  heatMap: React.ReactNode;
}) {
  const k = o.kpis;
  return (
    <div>
      <ReportHeader back={{ href: "/teacher", label: "All classes" }} icon="🏫" title={`Class ${o.className}`}
        subtitle="Who needs help, what to reteach and how every student is doing — all from practice on the platform."
        who={o.className}>
        <Link href={`/teacher/classes/${o.classId}/analytics`} className="rounded-xl border-2 border-brand-navy px-5 py-2 font-semibold text-brand-navy hover:bg-white">Progress and growth</Link>
        <Link href={`/teacher/assignments/new?classId=${o.classId}`} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">New assignment</Link>
      </ReportHeader>

      <AtAGlance items={[
        { icon: "🙋", label: "Students", value: String(k.students), meaning: `${k.activeStudents} practised`, tone: k.activeStudents < k.students ? "warn" : "good" },
        { icon: "✍️", label: "Questions answered", value: String(k.questions), meaning: `Practice time: ${fmtMin(k.minutes)}` },
        { icon: "🎯", label: "Accuracy", value: k.accuracyPct === null ? "–" : `${k.accuracyPct}%`, meaning: "of all answers were right", tone: toneOfPct(k.accuracyPct) },
        { icon: "📈", label: "Average mastery", value: k.avgMastery === null ? "–" : String(k.avgMastery), meaning: `0–100 · ${k.skillsMastered} skills mastered` },
        { icon: "🙌", label: "Need support", value: String(k.needSupport), meaning: k.needSupport ? "students listed below" : "nobody right now", tone: k.needSupport ? "bad" : "good" },
      ]} />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Callout kind="help" items={o.alerts.slice(0, 5).map((a) => a.message)}>{!o.alerts.length ? "No student needs extra support right now." : null}</Callout>
        <Callout kind="next" items={[
          o.weakSkills[0] ? <>Reteach <b>{o.weakSkills[0].name}</b> ({o.weakSkills[0].avgMastery} average mastery, {o.weakSkills[0].students} students)</> : null,
          o.alerts[0] ? <>For {o.alerts[0].message.split(" ")[0]}: {o.alerts[0].nextAction}</> : null,
          o.hardQuestions[0] ? "Go over the hardest question below with the class." : null,
        ]}>{!o.weakSkills.length && !o.alerts.length ? "Keep the daily practice going." : null}</Callout>
      </div>

      {o.alerts.length > 0 && (
        <ReportSection title="Students Who May Need Support" icon="🙋" id="alerts">
          <ul className="space-y-2">
            {o.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border-s-4 border-amber-400 bg-white p-4 ring-1 ring-slate-200">
                <div className="min-w-0">
                  <Link href={`/teacher/students/${a.studentId}`} className="font-semibold text-brand-navy hover:text-brand-teal">{a.message}</Link>
                  <p className="mt-1 text-sm text-slate-600">Next step: {a.nextAction}</p>
                </div>
                <form action={resolveAction} className="print:hidden">
                  <input type="hidden" name="alertId" value={a.id} /><input type="hidden" name="classId" value={o.classId} />
                  <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Mark as handled</button>
                </form>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      <ReportSection title="Groups" icon="👥" hint="Based on the placement check, or on average mastery for students who have not taken it.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(o.groups) as GroupName[]).map((g) => (
            <div key={g} className={["rounded-xl border-t-4 bg-white p-4 ring-1 ring-slate-200", GROUP_STYLE[g]].join(" ")}>
              <h3 className="font-semibold text-brand-navy">{g} <span className="font-normal text-slate-500">({o.groups[g].length})</span></h3>
              <p className="mt-1 text-sm text-slate-700">{o.groups[g].length ? o.groups[g].join(", ") : "No students"}</p>
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection title="Mastery by Skill" icon="🧩" id="map">
        {heatMap}
      </ReportSection>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <ReportSection title="Skills to Reteach" icon="🔁" hint="Average mastery (0–100) of the students who practised each skill.">
          <SimpleBar unit="" items={o.weakSkills.map((s) => ({ label: s.name, value: s.avgMastery, display: `${s.avgMastery} avg, ${s.students} students`, band: s.avgMastery >= 80 ? "GOOD" : s.avgMastery >= 60 ? "OK" : "LOW" }))} />
          {o.weakSkills.length === 0 && <p className="text-slate-600">No skill averages below 60. Skills appear once 3 or more students have practised them.</p>}
        </ReportSection>
        <ReportSection title="Class Strengths" icon="💪">
          <SimpleBar unit="" items={o.strongSkills.map((s) => ({ label: s.name, value: s.avgMastery, display: `${s.avgMastery} avg, ${s.students} students`, band: s.avgMastery >= 80 ? "GOOD" : s.avgMastery >= 60 ? "OK" : "LOW" }))} />
          {o.strongSkills.length === 0 && <p className="text-slate-600">No skill averages 60 or more across the class yet.</p>}
        </ReportSection>
      </div>

      {o.hardQuestions.length > 0 && (
        <ReportSection title="Hardest Questions for This Class" icon="❗">
          <ul className="divide-y divide-slate-100">
            {o.hardQuestions.map((q) => (
              <li key={q.questionId} className="grid gap-1 py-2 md:grid-cols-[minmax(0,1fr)_10rem]">
                <span><span className="text-sm text-slate-500">{q.skill}</span><br />{q.stem}</span>
                <span className="tabular-nums text-slate-600 md:text-right">{q.accuracyPct}% correct<br /><span className="text-sm">{q.attempts} answers</span></span>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      <ReportSection title="Students" icon="👩‍🎓" id="students">
        <ReportTable label="Students"
          cols={[{ key: "n", label: "Student" }, { key: "g", label: "Group" }, { key: "p", label: "Placement" }, { key: "m", label: "Avg mastery", num: true }, { key: "ms", label: "Mastered", num: true }, { key: "a", label: "Answered", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "t", label: "Time", num: true }, { key: "al", label: "Alerts", num: true }]}
          rows={o.students.map((s) => ({
            id: s.studentId, flag: s.openAlerts ? "warn" : undefined, sort: { n: s.name, m: s.avgMastery, acc: s.accuracyPct, t: s.minutes, al: s.openAlerts },
            cells: {
              n: <span className="inline-flex items-center gap-2">{badgeOf?.[s.studentId]}<Link href={`/teacher/students/${s.studentId}`} className="text-brand-navy hover:text-brand-teal">{s.name}</Link></span>,
              g: s.group ?? "–", p: s.placement ?? "Not taken", m: s.avgMastery ?? "–", ms: s.skillsMastered, a: s.answered,
              acc: s.accuracyPct === null ? "–" : `${s.accuracyPct}%`, t: fmtMin(s.minutes),
              al: s.openAlerts ? <span className="rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-900">! {s.openAlerts}</span> : "–",
            },
          }))} />
      </ReportSection>

      <ReportSection title="Assignments" icon="📋" id="assign">
        {assignments.length === 0 ? <p className="text-slate-600">No assignments yet. Assign skills or a unit with a due date.</p> : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-brand-navy">{a.title}</span>
                  <span className="text-sm text-slate-600">{a.dueAt ? `Due ${a.dueAt.slice(0, 10)}` : "No due date"}, target mastery {a.targetMastery}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{a.counts.COMPLETED} completed, {a.counts.IN_PROGRESS} in progress, {a.counts.NOT_STARTED} not started{a.counts.OVERDUE ? `, ${a.counts.OVERDUE} overdue` : ""}</p>
                <BandBar className="mt-2" height="h-3" legend={false} parts={[{ key: "DONE", value: a.counts.COMPLETED }, { key: "OK", value: a.counts.IN_PROGRESS, label: "In progress" }, { key: "PENDING", value: a.counts.NOT_STARTED, label: "Not started" }, { key: "LATE", value: a.counts.OVERDUE ?? 0, label: "Overdue" }]} />
              </li>
            ))}
          </ul>
        )}
      </ReportSection>
    </div>
  );
}
