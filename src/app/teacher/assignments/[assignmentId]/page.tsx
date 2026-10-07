import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { assignmentDetail, type AssignmentDetail } from "@/server/teacher/assign";

const LABEL = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETED: "Completed", OVERDUE: "Overdue" } as const;
const TONE = { NOT_STARTED: "bg-slate-100 text-slate-700", IN_PROGRESS: "bg-sky-100 text-sky-900", COMPLETED: "bg-teal-100 text-teal-900", OVERDUE: "bg-red-100 text-red-800" } as const;

/** One assignment: every student's status and results. */
export default async function AssignmentResultsPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  let a: AssignmentDetail;
  try { a = await assignmentDetail(repo, actor, (await params).assignmentId); } catch { notFound(); }
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/teacher/assignments" className="text-brand-teal hover:underline">← Weekly assignments</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">{a.skill}</h1>
      <p className="mt-1 text-slate-600">{a.className} · {a.startAt ? `starts ${a.startAt.slice(0, 10)} · ` : ""}{a.dueAt ? `due ${a.dueAt.slice(0, 10)}` : "no due date"} · completed at {a.targetMastery}% mastery after 10+ answers</p>
      {a.note && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Note: {a.note}</p>}
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="p-3">Student</th><th>Status</th><th>Progress</th><th>Answered</th><th>Accuracy</th><th>Last activity</th><th /></tr></thead>
          <tbody>{a.students.map((s) => (
            <tr key={s.studentId} className="border-b last:border-0">
              <td className="p-3"><Link href={`/teacher/students/${s.studentId}`} className="font-medium text-brand-teal hover:underline">{s.name}</Link></td>
              <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[s.status]}`}>{LABEL[s.status]}</span></td>
              <td className="tabular-nums">{Math.round(s.progress * 100)}%</td>
              <td className="tabular-nums">{s.answered}</td>
              <td className="tabular-nums">{s.accuracy === null ? "—" : `${s.accuracy}%`}</td>
              <td>{s.completedAt ? `completed ${s.completedAt.slice(0, 10)}` : s.lastActivity ? s.lastActivity.slice(0, 10) : "—"}</td>
              <td className="pe-3"><Link href={`/teacher/assignments/${a.id}/report/${s.studentId}`} className="text-brand-teal hover:underline">Report</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </AppShell>
  );
}
