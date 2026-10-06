/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { AssignmentSummary } from "../../server/teacher/assignments";
import type { ClassOverview as Overview, GroupName } from "../../server/teacher/queries";

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-brand-navy">{value}</p>
      {note && <p className="text-sm text-slate-500">{note}</p>}
    </div>
  );
}

const GROUP_STYLE: Record<GroupName, string> = {
  Intervention: "border-amber-400",
  Developing: "border-teal-300",
  "On level": "border-teal-600",
  Advanced: "border-brand-gold",
};

export function ClassOverviewView({ o, assignments, resolveAction, heatMap }: {
  o: Overview;
  assignments: AssignmentSummary[];
  resolveAction?: (f: FormData) => void | Promise<void>;
  heatMap: React.ReactNode;
}) {
  const k = o.kpis;
  return (
    <div>
      <a href="/teacher" className="text-sm font-medium text-brand-teal hover:underline">All classes</a>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Class {o.className}</h1>
        <div className="flex flex-wrap gap-2">
          <a href={`/teacher/classes/${o.classId}/analytics`} className="rounded-xl border-2 border-brand-navy px-5 py-2 font-semibold text-brand-navy hover:bg-white">Progress and growth</a>
          <a href={`/teacher/assignments/new?classId=${o.classId}`} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">New assignment</a>
        </div>
      </div>

      <section aria-label="Class summary" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Students" value={String(k.students)} note={`${k.activeStudents} practised`} />
        <Kpi label="Questions answered" value={String(k.questions)} />
        <Kpi label="Accuracy" value={k.accuracyPct === null ? "–" : `${k.accuracyPct}%`} />
        <Kpi label="Average mastery" value={k.avgMastery === null ? "–" : String(k.avgMastery)} />
        <Kpi label="Practice time" value={fmtMin(k.minutes)} />
        <Kpi label="Skills mastered" value={String(k.skillsMastered)} />
        <Kpi label="Need support" value={String(k.needSupport)} />
      </section>

      {o.alerts.length > 0 && (
        <section aria-labelledby="alerts" className="mt-8">
          <h2 id="alerts" className="text-xl font-bold text-brand-navy">Students who may need support</h2>
          <ul className="mt-3 space-y-2">
            {o.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border-l-4 border-amber-400 bg-white p-4 ring-1 ring-slate-200">
                <div className="min-w-0">
                  <a href={`/teacher/students/${a.studentId}`} className="font-semibold text-brand-navy hover:text-brand-teal">{a.message}</a>
                  <p className="mt-1 text-sm text-slate-600">Next step: {a.nextAction}</p>
                </div>
                <form action={resolveAction}>
                  <input type="hidden" name="alertId" value={a.id} /><input type="hidden" name="classId" value={o.classId} />
                  <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Mark as handled</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="groups" className="mt-8">
        <h2 id="groups" className="text-xl font-bold text-brand-navy">Groups</h2>
        <p className="text-sm text-slate-500">Based on the placement check, or on average mastery for students who have not taken it.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {(Object.keys(o.groups) as GroupName[]).map((g) => (
            <div key={g} className={["rounded-xl border-t-4 bg-white p-4 ring-1 ring-slate-200", GROUP_STYLE[g]].join(" ")}>
              <h3 className="font-semibold text-brand-navy">{g} <span className="font-normal text-slate-500">({o.groups[g].length})</span></h3>
              <p className="mt-1 text-sm text-slate-700">{o.groups[g].length ? o.groups[g].join(", ") : "No students"}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="map" className="mt-8">
        <h2 id="map" className="text-xl font-bold text-brand-navy">Mastery by skill</h2>
        <div className="mt-3">{heatMap}</div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Skills to reteach</h2>
          <ul className="mt-2 divide-y divide-slate-100">{o.weakSkills.map((s) => <li key={s.skillId} className="flex justify-between py-2"><span>{s.name}</span><span className="tabular-nums text-slate-600">{s.avgMastery} avg, {s.students} students</span></li>)}</ul>
          {o.weakSkills.length === 0 && <p className="mt-2 text-slate-600">No skill averages below 60. Skills appear once 3 or more students have practised them.</p>}
        </section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Class strengths</h2>
          <ul className="mt-2 divide-y divide-slate-100">{o.strongSkills.map((s) => <li key={s.skillId} className="flex justify-between py-2"><span>{s.name}</span><span className="tabular-nums text-slate-600">{s.avgMastery} avg, {s.students} students</span></li>)}</ul>
          {o.strongSkills.length === 0 && <p className="mt-2 text-slate-600">No skill averages 60 or more across the class yet.</p>}
        </section>
      </div>

      {o.hardQuestions.length > 0 && (
        <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Hardest questions for this class</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {o.hardQuestions.map((q) => (
              <li key={q.questionId} className="grid gap-1 py-2 md:grid-cols-[minmax(0,1fr)_10rem]">
                <span><span className="text-sm text-slate-500">{q.skill}</span><br />{q.stem}</span>
                <span className="tabular-nums text-slate-600 md:text-right">{q.accuracyPct}% correct<br /><span className="text-sm">{q.attempts} answers</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="students" className="mt-8">
        <h2 id="students" className="text-xl font-bold text-brand-navy">Students</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>{["Student", "Group", "Placement", "Avg mastery", "Mastered", "Answered", "Accuracy", "Time", "Alerts"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {o.students.map((s) => (
                <tr key={s.studentId} className="border-t border-slate-100">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium"><a href={`/teacher/students/${s.studentId}`} className="text-brand-navy hover:text-brand-teal">{s.name}</a></th>
                  <td className="px-4 py-2.5">{s.group ?? "–"}</td>
                  <td className="px-4 py-2.5">{s.placement ?? "Not taken"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.avgMastery ?? "–"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.skillsMastered}</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.answered}</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.accuracyPct === null ? "–" : `${s.accuracyPct}%`}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fmtMin(s.minutes)}</td>
                  <td className="px-4 py-2.5">{s.openAlerts ? <span className="rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-900">{s.openAlerts}</span> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="assign" className="mt-8">
        <h2 id="assign" className="text-xl font-bold text-brand-navy">Assignments</h2>
        {assignments.length === 0 ? <p className="mt-2 text-slate-600">No assignments yet. Assign skills or a unit with a due date.</p> : (
          <ul className="mt-3 space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-brand-navy">{a.title}</span>
                  <span className="text-sm text-slate-600">{a.dueAt ? `Due ${a.dueAt.slice(0, 10)}` : "No due date"}, target mastery {a.targetMastery}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{a.counts.COMPLETED} completed, {a.counts.IN_PROGRESS} in progress, {a.counts.NOT_STARTED} not started{a.counts.OVERDUE ? `, ${a.counts.OVERDUE} overdue` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
