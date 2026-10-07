import type { AssignedView } from "@/server/student/assigned";

const LABEL = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETED: "Completed", OVERDUE: "Overdue" } as const;
const TONE = { NOT_STARTED: "bg-slate-100 text-slate-700", IN_PROGRESS: "bg-sky-100 text-sky-900", COMPLETED: "bg-teal-100 text-teal-900", OVERDUE: "bg-red-100 text-red-800" } as const;

/** The student's home: ONLY the skills the teacher assigned. */
export function AssignedSkills({ view, firstName, placement, area = "ALL" }: { view: AssignedView; firstName: string; placement: boolean; area?: "ALL" | "CURRICULUM" | "MAP" }) {
  const { summary } = view;
  // two areas taught in class: the book curriculum and MAP Growth preparation
  const items = area === "ALL" ? view.items : view.items.filter((i) => i.track === area);
  const open = (t: "CURRICULUM" | "MAP") => view.items.filter((i) => i.track === t && i.status !== "COMPLETED").length;
  const total = (t: "CURRICULUM" | "MAP") => view.items.filter((i) => i.track === t).length;
  const areaCard = (t: "CURRICULUM" | "MAP", icon: string, title: string, colors: string) => {
    const active = area === t;
    return (
      <a href={active ? "/student" : `/student?area=${t === "MAP" ? "map" : "curriculum"}`} aria-current={active ? "page" : undefined}
        className={`flex items-center gap-4 rounded-2xl p-5 ring-2 transition ${active ? colors : "bg-white ring-slate-200 hover:ring-brand-teal"}`}>
        <span aria-hidden="true" className="text-5xl leading-none">{icon}</span>
        <span><span className="block text-xl font-bold text-brand-navy">{title}</span>
          <span className="block text-sm text-slate-600">{total(t) === 0 ? "Nothing assigned yet" : `${open(t)} to do · ${total(t) - open(t)} done`}</span></span>
      </a>
    );
  };
  return (
    <div>
      <h1 className="text-3xl font-bold text-brand-navy">Hello, {firstName}!</h1>
      <p className="mt-1 text-slate-600">These are the skills your teacher assigned to you.</p>
      {view.newThisWeek > 0 && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 font-medium text-amber-900 ring-1 ring-amber-200">You have {view.newThisWeek} new skill{view.newThisWeek === 1 ? "" : "s"} assigned this week.</p>}
      {placement && <a href="/student/placement" className="mt-3 block rounded-xl bg-brand-navy px-4 py-3 font-semibold text-white">Your school asks you to take the placement test first →</a>}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([["Assigned", summary.assigned, "text-brand-navy"], ["Completed", summary.completed, "text-teal-800"], ["In progress", summary.inProgress, "text-sky-800"], ["Not started", summary.notStarted, "text-slate-700"], ["Overdue", summary.overdue, "text-red-700"]] as const).map(([l, v, c]) => (
          <div key={l} className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{l}</dt><dd className={`text-2xl font-bold ${c}`}>{v}</dd></div>
        ))}
      </dl>
      <a href="/student/readmaster" className="mt-6 flex items-center gap-4 rounded-2xl bg-amber-50 p-5 ring-2 ring-amber-300 hover:ring-amber-500">
        <span aria-hidden="true" className="text-5xl leading-none">⭐</span>
        <span><span className="block text-xl font-bold text-brand-navy">ReadMaster</span><span className="block text-sm text-slate-600">Articles at my reading level — my Lexile grows as I read</span></span>
      </a>
      <a href="/student/map" className="mt-3 flex items-center gap-4 rounded-2xl bg-emerald-50 p-5 ring-2 ring-emerald-300 hover:ring-emerald-500">
        <span aria-hidden="true" className="text-5xl leading-none">🗺️</span>
        <span><span className="block text-xl font-bold text-brand-navy">My MAP</span><span className="block text-sm text-slate-600">My RIT score, my goal, and practice that adapts to my level</span></span>
      </a>
      <nav aria-label="Areas" className="mt-6 grid gap-3 sm:grid-cols-2">
        {areaCard("CURRICULUM", "📘", "Curriculum skills", "bg-sky-50 ring-sky-400")}
        {areaCard("MAP", "🗺️", "MAP skills", "bg-emerald-50 ring-emerald-400")}
      </nav>
      {area !== "ALL" && <p className="mt-3 text-sm"><a href="/student" className="text-brand-teal hover:underline">Show everything</a></p>}
      {items.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-6 text-slate-700 ring-1 ring-slate-200">No skills assigned yet. When your teacher assigns a skill, it will appear here and you will get a notification.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((i) => (
            <li key={i.assignmentId} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-brand-navy"><span aria-label={i.track === "MAP" ? "MAP" : "Curriculum"} title={i.track === "MAP" ? "MAP" : "Curriculum"}>{i.track === "MAP" ? "🗺️" : "📘"}</span> {i.skill}</h2>
                  <p className="text-sm text-slate-600">{i.kind === "questions" ? `${i.questionCount} questions chosen by your teacher` : i.standard ?? "No standard"} · assigned {i.assignedAt.slice(0, 10)}{i.dueAt ? ` · due ${i.dueAt.slice(0, 10)}` : ""}</p>
                  {i.note && <p className="mt-1 text-sm text-amber-900">Teacher's note: {i.note}</p>}
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${TONE[i.status]}`}>{LABEL[i.status]}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <div className="h-2.5 w-48 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(i.progress * 100)} aria-label={`Progress on ${i.skill}`}>
                  <div className={`h-full ${i.status === "COMPLETED" ? "bg-teal-600" : "bg-brand-teal"}`} style={{ width: `${Math.round(i.progress * 100)}%` }} />
                </div>
                <span className="text-sm tabular-nums text-slate-700">{Math.round(i.progress * 100)}%</span>
                {i.startsLater ? <span className="text-sm text-slate-600">Starts {i.startAt!.slice(0, 10)}</span>
                  : i.status === "COMPLETED" ? (
                    <span className="flex gap-2">
                      <a href={`/student/assignments/${i.assignmentId}/report`} className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white">View report</a>
                      {i.kind === "skill" && <a href={`/practice/${i.skillId}`} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">Practise again</a>}
                    </span>
                  ) : <a href={i.kind === "questions" ? `/quiz/${i.assignmentId}` : `/practice/${i.skillId}`} className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white">{i.status === "NOT_STARTED" ? "Start" : "Continue"}</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
