import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { IntensityBadge, LevelBadge, StatusBadge, Tile } from "@/components/insights/badges";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { recordResultsView } from "@/server/insights/teacher-followup";
import { INTENSITY_NAME, studentProgress } from "@/server/insights/progress";
import { assignPlanAction } from "../actions";
import { commentsFor } from "@/server/teacher/classroom";
import { addCommentAction, addNoteAction, deleteCommentAction, deleteNoteAction } from "./comment-actions";
import { notesFor, quickComments } from "@/server/teacher/extras";

export const metadata = { title: "Student progress" };
const CAT: Record<string, string> = { CV: "Concept Vocabulary", ACS: "Analyze Craft & Structure", RTR: "Respond to Reading" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** 📈 One student: results, MAP progress, levels with their history, and an automatic plan. */
export default async function StudentProgressPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ subject?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  await recordResultsView(repo, actor);
  const { studentId } = await params;
  const sp = await searchParams;
  const subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const v = await studentProgress(repo, actor, studentId, subject);
  const r = v.row, m = r.map;
  const [comments, notes, quick] = await Promise.all([commentsFor(repo, actor, studentId), notesFor(repo, actor, studentId), quickComments(repo, actor)]);
  const recentWork = (await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"] })).map((x) => String(x.assignmentId));
  const works = recentWork.length ? (await repo.findMany("Assignment", { id: { in: recentWork }, deletedAt: null }, { select: ["id", "title", "createdAt"] })).sort((a, b) => new Date(b.createdAt as string | Date).getTime() - new Date(a.createdAt as string | Date).getTime()).slice(0, 15) : [];
  const maxRit = Math.max(...v.mapPoints.map((p) => p.rit), m?.springTarget ?? 0, 1), minRit = Math.min(...v.mapPoints.map((p) => p.rit), m?.springTarget ?? 999) - 5;
  const bar = (rit: number) => `${Math.max(4, Math.round(((rit - minRit) / Math.max(1, maxRit - minRit)) * 100))}%`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/progress?classId=${v.classId}&subject=${subject}`, label: v.className }} icon="📈" title={r.name}
        subtitle={<>Grade {v.grade} · {v.className}{r.number ? ` · ID ${r.number}` : ""} · <StatusBadge status={r.status} /> <span className="text-sm">{r.statusWhy}</span></>}>
        {(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={`/teacher/progress/${studentId}?subject=${x}`} className={`rounded-full px-3 py-1 text-sm font-semibold print:hidden ${x === subject ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{x === "READING" ? "📖 Reading" : "✏️ Language"}</Link>)}
        <Link href={`/teacher/progress/${studentId}/report`} className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 print:hidden">👪 Parent report</Link>
        <PrintButton />
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Answers" value={`${r.practice.answers}`} />
        <Tile label="Accuracy" value={r.practice.accuracy === null ? "—" : `${r.practice.accuracy}%`} />
        <Tile label="Skills mastered" value={`${r.mastered}`} tone="text-emerald-700" />
        <Tile label="Skills needing work" value={`${r.needsWork}`} tone={r.needsWork ? "text-amber-700" : ""} />
        <Tile label="Time: week · month" value={`${r.practice.week.minutes}m · ${r.practice.month.minutes}m`} />
        <Tile label="Tasks done · pending · late" value={`${r.work.done} · ${r.work.pending} · ${r.work.late}`} tone={r.work.late ? "text-red-700" : ""} />
      </dl>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">🗺️ MAP {subject === "READING" ? "Reading" : "Language Usage"}: Fall → now → Spring target</h2>
          {!m ? <p className="mt-2 text-slate-600">No MAP score yet. <Link href={`/teacher/map-entry?classId=${v.classId}&subject=${subject}`} className="font-semibold text-brand-teal underline">Enter scores</Link></p> : (
            <>
              <ul className="mt-3 space-y-2">
                {v.mapPoints.map((p, i) => <li key={i} className="flex items-center gap-3 text-sm"><span className="w-28 shrink-0 text-slate-600">{p.term}</span><span className="h-5 rounded-full bg-brand-teal" style={{ width: bar(p.rit) }} /><b className="tabular-nums">{p.rit}</b></li>)}
                {m.springTarget && <li className="flex items-center gap-3 text-sm"><span className="w-28 shrink-0 text-slate-600">🎯 Spring target</span><span className="h-5 rounded-full border-2 border-dashed border-brand-purple" style={{ width: bar(m.springTarget) }} /><b className="tabular-nums">{m.springTarget}</b></li>}
              </ul>
              <p className="mt-3 text-sm text-slate-600">Growth needed (projection − Fall): <b>{m.gap ?? "—"}</b> RIT · {m.latest?.percentile ? `${m.latest.percentile}th percentile` : ""}{m.lexile !== null ? ` · Lexile ${m.lexile}L` : ""}</p>
              {m.goals.length > 0 && <p className="mt-1 text-sm text-slate-600">Goal areas (weakest first): {m.goals.map((g) => `${g.name} ${g.rit}`).join(" · ")}</p>}
            </>
          )}
        </section>
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">🎯 Levels (staff only)</h2>
          <p className="mt-2 text-sm">Working level: <LevelBadge level={r.level} /> <Link href={`/teacher/levels?classId=${v.classId}`} className="ms-2 text-sm font-semibold text-brand-teal underline print:hidden">Change</Link></p>
          <ul className="mt-2 space-y-1 text-sm">{Object.entries(CAT).map(([k, n]) => <li key={k} className="flex justify-between gap-2"><span className="text-slate-600">{n}</span><LevelBadge level={r.categories[k] as "BELOW" | "ON" | "ABOVE" | undefined} /></li>)}</ul>
          <h3 className="mt-4 font-semibold text-slate-700">History</h3>
          {v.history.length === 0 ? <p className="text-sm text-slate-500">No level changes yet.</p> : (
            <ul className="mt-1 space-y-1 text-sm">{v.history.map((h, i) => <li key={i} className="text-slate-700">{day(h.at)} · {h.category ? `${CAT[h.category] ?? h.category}: ` : ""}{h.from ? `${h.from.toLowerCase()} → ` : ""}<b>{h.to.toLowerCase()}</b> <span className="text-xs text-slate-500">({h.source === "ADAPTIVE" ? "their answers" : h.source === "TEACHER" ? "teacher" : h.source.toLowerCase()}{h.outcome === "KEPT_TEACHER" ? ", kept teacher’s level" : ""})</span></li>)}</ul>
          )}
        </section>
      </div>
      <section className="mt-6 rounded-3xl bg-gradient-to-br bg-linear-to-br from-amber-50 to-white p-5 shadow-sm ring-1 ring-amber-200">
        <h2 className="text-lg font-bold text-brand-navy">📋 Plan for {r.name.split(" ")[0]} <IntensityBadge intensity={v.plan.intensity} /></h2>
        <p className="mt-1 text-sm text-slate-600">{v.plan.intensity ? `${INTENSITY_NAME[v.plan.intensity]}. ` : ""}Starts at <LevelBadge level={v.plan.startLevel} /> ({v.plan.why}) and moves up or down by their answers. Skills come from the weakest goal areas{m?.goals.length ? "" : " (no goal-area scores yet: all areas, weakest mastery first)"}.</p>
        {v.plan.areas.length === 0 ? <p className="mt-3 text-slate-600">No skills with questions for this grade yet.</p> : (
          <form action={assignPlanAction} className="mt-3">
            <input type="hidden" name="classId" value={v.classId} /><input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="subject" value={subject} />
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {v.plan.areas.map((a) => (
                <fieldset key={a.area} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <legend className="px-1 font-bold text-brand-navy">{a.area}{a.rit !== null ? <span className="ms-1 text-xs text-slate-500">RIT {a.rit}</span> : null}</legend>
                  <ul className="space-y-1 text-sm">{a.skills.map((k) => <li key={k.id}><label className="flex items-start gap-2">{v.canAssign && <input type="checkbox" name="skill" value={k.id} defaultChecked={!k.assigned} disabled={k.assigned} className="mt-1" />}<span>{k.name} <span className="text-xs text-slate-500">{k.mastery === null ? "not started" : `${k.mastery}%`}{k.assigned ? " · already assigned" : ""}</span></span></label></li>)}</ul>
                </fieldset>
              ))}
            </div>
            {v.canAssign && <div className="mt-3 flex flex-wrap items-end gap-3 print:hidden"><label className="flex flex-col text-sm">Due date (optional)<input type="date" name="dueAt" className="rounded-lg border border-slate-300 px-3 py-2" /></label><button className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">⭐ Assign the ticked skills</button></div>}
          </form>
        )}
      </section>
      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">🗓️ Recent work</h2>
        {v.recent.length === 0 ? <p className="mt-2 text-slate-600">Nothing assigned yet.</p> : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">{v.recent.map((a, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{a.title}</span><span className="text-slate-500">{a.status.replace("_", " ").toLowerCase()}{a.dueAt ? ` · due ${day(a.dueAt)}` : ""}</span></li>)}</ul>
        )}
      </section>
      <section id="comments" className="mt-6 scroll-mt-24 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">💬 Comments on {r.name.split(" ")[0]}’s work</h2>
        <p className="text-sm text-slate-500">The student and the parent can read them (the student gets a notification).</p>
        <form action={addCommentAction} className="mt-3 flex flex-wrap items-end gap-2 print:hidden">
          <input type="hidden" name="studentId" value={studentId} />
          <label className="flex min-w-[18rem] flex-1 flex-col text-sm font-semibold text-slate-700">Comment<input name="body" list="quick-comments" required maxLength={2000} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 font-normal" placeholder="Type, or pick a quick comment…" /><span className="mt-1 flex items-center gap-1 text-xs font-normal text-slate-500"><input type="checkbox" name="keep" /> save as one of my quick comments</span></label>
          <datalist id="quick-comments">{quick.map((q) => <option key={q} value={q} />)}</datalist>
          <label className="flex flex-col text-sm font-semibold text-slate-700">About (optional)<select name="assignmentId" className="mt-1 max-w-[16rem] rounded-lg border border-slate-300 px-2 py-2 font-normal"><option value="">— general —</option>{works.map((w) => <option key={String(w.id)} value={String(w.id)}>{String(w.title).slice(0, 60)}</option>)}</select></label>
          <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Send</button>
        </form>
        {comments.length > 0 && <ul className="mt-3 space-y-2">{comments.map((c) => <li key={c.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="text-slate-500">{c.author} · {c.createdAt.slice(0, 10)}{c.assignment ? ` · about “${c.assignment}”` : ""}{c.mine && <form action={deleteCommentAction} className="ms-2 inline print:hidden"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="studentId" value={studentId} /><button className="text-xs text-red-700 underline">delete</button></form>}</div><p className="mt-1 whitespace-pre-line text-slate-900">{c.body}</p></li>)}</ul>}
      </section>
      <section id="notes" className="mt-6 scroll-mt-24 rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 print:hidden">
        <h2 className="text-lg font-bold text-brand-navy">🔒 Private notes <span className="text-sm font-normal text-slate-500">· staff only — never shown to the student or the parent</span></h2>
        <form action={addNoteAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="studentId" value={studentId} />
          <input name="body" required maxLength={1000} placeholder="e.g. Sits at the front · needs instructions repeated · parent meeting on 12/10" className="min-w-[18rem] flex-1 rounded-lg border border-slate-300 px-3 py-2" />
          <button className="rounded-xl bg-slate-700 px-4 py-2 font-semibold text-white">Save note</button>
        </form>
        {notes.length > 0 && <ul className="mt-3 space-y-1 text-sm">{notes.map((n) => <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"><span><span className="text-slate-500">{n.date} · {n.author}:</span> {n.body}</span>{n.mine && <form action={deleteNoteAction}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="studentId" value={studentId} /><button className="text-xs text-red-700 underline">delete</button></form>}</li>)}</ul>}
      </section>
    </AppShell>
  );
}
