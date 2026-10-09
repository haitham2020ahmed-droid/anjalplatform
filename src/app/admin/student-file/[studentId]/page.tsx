import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { DESC_STYLE, StatusChip, subjectName } from "@/components/map/map-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studentFile } from "@/server/insights/student-file";

export const metadata = { title: "Student file" };

/** 🗂️ Everything about one student on one page (read only). */
export default async function StudentFilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  let f; try { f = await studentFile(repo, actor, studentId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const box = "rounded-3xl bg-white p-5 ring-1 ring-slate-200 break-inside-avoid";
  const tile = (l: string, v: string | number, tone = "text-brand-navy") => <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs text-slate-500">{l}</p><p className={`text-2xl font-extrabold ${tone}`}>{v}</p></div>;
  const p = f.practice;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/student-file", label: "Find a student" }} icon="🗂️" title={f.name}
        subtitle={<>Grade {f.grade} · {f.className || "no class"} · ID {f.number} · {f.username}{f.teachers.length ? ` · teacher: ${f.teachers.join(", ")}` : ""} · last sign-in {f.lastLogin ? f.lastLogin.slice(0, 10) : "never"} ({f.signIns30} in 30 days)</>}>
        <Link href={`/admin/student-file/${f.id}/view`} className="rounded-xl bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-800 print:hidden">👁 See it as the student does</Link>
        <Link href={`/teacher/progress/${f.id}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 print:hidden">📈 Progress page</Link>
        <Link href={`/teacher/progress/${f.id}/report`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 print:hidden">👪 Parent report{f.reportShared ? " ✓" : ""}</Link>
        <PrintButton />
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {tile("Answers", p.answers)}{tile("Correct", p.accuracy === null ? "—" : `${p.accuracy}%`)}{tile("Minutes this month", p.month.minutes)}
        {tile("Tasks done / late", `${f.work.done} / ${f.work.late}`, f.work.late ? "text-red-700" : "text-brand-navy")}{tile("Skills mastered", `${f.skills.mastered} / ${f.skills.started}`)}{tile("Level", f.level ? f.level.toLowerCase() : "—")}
      </div>

      <section className={`${box} mt-5`}>
        <h2 className="text-lg font-bold text-brand-navy">🗺️ MAP</h2>
        {!f.map.length ? <p className="mt-1 text-slate-600">No MAP scores yet.</p> : (
          <div className="mt-2 grid gap-4 md:grid-cols-2">{f.map.map((m) => (
            <div key={m.subject} className="rounded-2xl bg-slate-50 p-4">
              <p className="font-bold">{subjectName(m.subject)} · {m.term}</p>
              <p className="text-3xl font-extrabold text-brand-navy">{m.overall?.rit} <span className="text-sm font-semibold text-slate-500">band {m.overall?.band}</span> {m.overall?.descriptor && <span className={`rounded-full px-2 py-0.5 text-xs ${DESC_STYLE[m.overall.descriptor]}`}>{m.overall.descriptor}</span>}</p>
              <p className="text-sm text-slate-600">{m.fall ? `Fall ${m.fall.rit} → Spring goal ${m.fall.projection ?? "?"}` : ""}{m.overall?.rapidGuessPct ? ` · rapid guessing ${m.overall.rapidGuessPct}%` : ""}</p>
              {m.history.length > 1 && <p className="text-sm text-slate-600">{m.history.map((h) => `${h.term} ${h.rit}`).join(" → ")}</p>}
              <ul className="mt-2 flex flex-wrap gap-1 text-xs">{m.areas.map((a) => <li key={a.group} className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">{a.icon} {a.name}: {a.rit ?? "—"} <StatusChip status={a.status} /></li>)}</ul>
            </div>
          ))}</div>
        )}
        <p className="mt-3 text-sm text-slate-700">Plans sent: {f.plans.length ? f.plans.map((d) => <Link key={d.id} href={`/map-plan/${d.id}`} className="me-2 font-semibold text-brand-teal underline">{subjectName(d.subject)} {d.term}</Link>) : "none"}{f.draftPlans ? ` · ${f.draftPlans} draft(s) waiting for the teacher` : ""}</p>
        {f.tests.length > 0 && <ul className="mt-2 text-sm">{f.tests.map((t, i) => <li key={i}>🧭 {t.title} · {subjectName(t.subject)}: {t.status === "DONE" ? <b>{t.rit} ({t.low}–{t.high})</b> : `in progress ${t.answered}/${t.total}`}{t.rapid && t.answered ? ` · rapid ${Math.round((100 * t.rapid) / t.answered)}%` : ""}</li>)}</ul>}
      </section>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section className={box}>
          <h2 className="text-lg font-bold text-brand-navy">🧩 Skills</h2>
          <p className="mt-1 text-sm font-semibold text-emerald-700">Strong</p><ul className="text-sm">{f.skills.strong.length ? f.skills.strong.map((k) => <li key={k.name}>{k.name} — {k.pct}% ({k.answers})</li>) : <li className="text-slate-500">—</li>}</ul>
          <p className="mt-2 text-sm font-semibold text-red-700">Needs work</p><ul className="text-sm">{f.skills.weak.length ? f.skills.weak.map((k) => <li key={k.name}>{k.name} — {k.pct}% ({k.answers})</li>) : <li className="text-slate-500">—</li>}</ul>
          <p className="mt-2 text-sm text-slate-600">🔁 Review: {f.review.due} due · {f.review.learned} learned · 📒 {f.words.count} words looked up{f.words.recent.length ? ` (${f.words.recent.slice(0, 6).join(", ")}…)` : ""}</p>
        </section>
        <section className={box}>
          <h2 className="text-lg font-bold text-brand-navy">📝 Recent work</h2>
          <ul className="mt-2 space-y-1 text-sm">{f.work10.length ? f.work10.map((w, i) => <li key={i} className="flex justify-between gap-2"><Link href={w.href} className="truncate text-brand-navy hover:underline">{w.title}</Link><span className={w.status === "OVERDUE" ? "text-red-700" : w.status === "COMPLETED" ? "text-emerald-700" : "text-slate-600"}>{w.status.replace("_", " ").toLowerCase()} · {w.progress}%</span></li>) : <li className="text-slate-500">Nothing assigned.</li>}</ul>
          {f.exitTickets.length > 0 && <p className="mt-2 text-sm text-slate-600">🎫 Exit tickets: {f.exitTickets.slice(0, 5).map((t) => `${t.score}/${t.total}`).join(" · ")}</p>}
        </section>
        <section className={box}>
          <h2 className="text-lg font-bold text-brand-navy">✍️ Writing & reading aloud</h2>
          <ul className="mt-2 space-y-1 text-sm">{f.writing.length ? f.writing.map((w) => <li key={w.taskId} className="flex justify-between gap-2"><Link href={`/teacher/writing?classId=${f.classId}&task=${w.taskId}`} className="text-brand-navy hover:underline">{w.kind === "READ_ALOUD" ? "🎙" : "✍️"} {w.title}</Link><span>{w.status === "SCORED" ? `${w.total}/${w.max}` : w.status.toLowerCase()}</span></li>) : <li className="text-slate-500">None yet.</li>}</ul>
        </section>
        <section className={box}>
          <h2 className="text-lg font-bold text-brand-navy">🏅 Badges</h2>
          <p className="mt-2 text-2xl">{f.badges.length ? f.badges.map((b) => <span key={b.name} title={`${b.name}${b.earnedAt ? ` · ${b.earnedAt.slice(0, 10)}` : ""}`} className="me-2">{b.icon}</span>) : <span className="text-sm text-slate-500">None yet.</span>}</p>
        </section>
      </div>

      <section className={`${box} mt-5`}>
        <h2 className="text-lg font-bold text-brand-navy">🚨 Alerts and what was done</h2>
        {!f.alerts.length ? <p className="mt-1 text-slate-500">No alerts.</p> : <ul className="mt-2 space-y-1 text-sm">{f.alerts.map((a, i) => <li key={i} className="rounded-lg bg-slate-50 px-3 py-1.5">{a.date} · {a.icon} <b>{a.title}</b>: {a.detail} — {a.status === "HANDLED" ? <span className="text-emerald-700">✅ {a.action}</span> : <span className="text-red-700">not handled</span>}</li>)}</ul>}
      </section>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section className={box}><h2 className="text-lg font-bold text-brand-navy">💬 Comments to the student</h2>{!f.comments.length ? <p className="mt-1 text-slate-500">None.</p> : <ul className="mt-2 space-y-1 text-sm">{f.comments.map((c) => <li key={c.id}><span className="text-slate-500">{c.createdAt.slice(0, 10)} · {c.author}:</span> {c.body}</li>)}</ul>}</section>
        <section className={`${box} bg-slate-50`}><h2 className="text-lg font-bold text-brand-navy">🔒 Private notes (staff)</h2>{!f.notes.length ? <p className="mt-1 text-slate-500">None.</p> : <ul className="mt-2 space-y-1 text-sm">{f.notes.map((n, i) => <li key={i}><span className="text-slate-500">{n.date} · {n.author}:</span> {n.body}</li>)}</ul>}</section>
      </div>
    </AppShell>
  );
}
