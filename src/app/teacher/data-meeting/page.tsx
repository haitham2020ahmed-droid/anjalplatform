import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { dataMeetingSnapshot, listDataMeetings, type MeetingSnapshot } from "@/server/tiers/data-meeting";
import { saveDataMeetingAction } from "./actions";

export const metadata = { title: "Data meeting" };

const ALERT: Record<string, string> = { NO_PRACTICE: "No practice", WEAK_SKILL: "Weak skill", DROPPED: "Dropped", LATE_WORK: "Late work", MAP_RISK: "MAP risk", RAPID_GUESS: "Rapid guessing" };
const DECISION_ROWS = 5;

function Snapshot({ s }: { s: MeetingSnapshot }) {
  const box = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <article className={box}>
        <h3 className="font-bold text-brand-navy">🧭 Tiers now</h3>
        <p className="mt-1 text-sm tabular-nums">Tier 1: <b>{s.tiers[1]}</b> · Tier 2: <b>{s.tiers[2]}</b> · Tier 3: <b>{s.tiers[3]}</b> <span className="text-slate-500">of {s.students}</span></p>
        <h4 className="mt-3 text-sm font-bold text-brand-navy">Tier moves ({s.tierMoves.length})</h4>
        {s.tierMoves.length ? <ul className="mt-1 space-y-1 text-sm">{s.tierMoves.slice(0, 15).map((m, i) => <li key={i}><bdi className="font-semibold">{m.name}</bdi>: Tier {m.from} → Tier {m.to} <span className="text-xs text-slate-500">· {m.date} · {m.source === "TEACHER" ? "teacher" : "rules"}</span></li>)}</ul> : <p className="text-sm text-slate-500">None.</p>}
        {s.refer.length > 0 && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-900 ring-1 ring-red-200">⚑ Refer for further evaluation: {s.refer.join(", ")}</p>}
      </article>
      <article className={box}>
        <h3 className="font-bold text-brand-navy">📶 Level moves ({s.levelMoves.length})</h3>
        {s.levelMoves.length ? <ul className="mt-1 space-y-1 text-sm">{s.levelMoves.slice(0, 15).map((m, i) => <li key={i}><bdi className="font-semibold">{m.name}</bdi>: {m.from ?? "—"} → {m.to} <span className="text-xs text-slate-500">· {m.date}</span></li>)}</ul> : <p className="text-sm text-slate-500">None.</p>}
      </article>
      <article className={box}>
        <h3 className="font-bold text-brand-navy">🔻 Weakest skills</h3>
        {s.weakSkills.length ? <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm">{s.weakSkills.map((w) => <li key={w.skillId}><b>{w.name}</b> · average mastery {w.avgMastery} · {w.studentsBelow60} under 60</li>)}</ol> : <p className="text-sm text-slate-500">Not enough practice yet.</p>}
        <h3 className="mt-3 font-bold text-brand-navy">🚨 Open alerts ({s.alerts.total})</h3>
        <p className="text-sm text-slate-700">{Object.entries(s.alerts.byKind).map(([k, n]) => `${ALERT[k] ?? k}: ${n}`).join(" · ") || "None."}</p>
      </article>
      <article className={box}>
        <h3 className="font-bold text-brand-navy">🎯 Interventions finished</h3>
        {s.interventions.length ? <ul className="mt-1 space-y-1 text-sm">{s.interventions.map((v, i) => <li key={i}><b>{v.title}</b> ({v.skill}) · {v.improved} of {v.total} improved · average {v.avgChange > 0 ? "+" : ""}{v.avgChange} <span className="text-xs text-slate-500">· {v.endedOn}</span></li>)}</ul> : <p className="text-sm text-slate-500">None finished.</p>}
        <h3 className="mt-3 font-bold text-brand-navy">⏰ Overdue progress checks ({s.overdueChecks.length})</h3>
        {s.overdueChecks.length ? <ul className="mt-1 space-y-1 text-sm">{s.overdueChecks.map((o, i) => <li key={i}><bdi>{o.name}</bdi> · Tier {o.tier} · due {o.due}</li>)}</ul> : <p className="text-sm text-slate-500">None.</p>}
      </article>
    </div>
  );
}

/** 🗂️ Data meeting: what changed since the last one (prepared by the platform) and the team's decisions. */
export default async function DataMeetingPage({ searchParams }: { searchParams: Promise<{ class?: string; grade?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const gradeRows = classes.length ? await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => String(c.gradeId)))] } }, { select: ["id", "level"] }) : [];
  const grades = [...new Set(gradeRows.map((g) => Number(g.level)))].sort((a, b) => a - b);
  const grade = sp.grade && grades.includes(Number(sp.grade)) ? Number(sp.grade) : null;
  const klass = grade ? null : classes.find((c) => c.id === sp.class) ?? classes[0];
  const scope = klass ? { classId: String(klass.id) } : grade ? { gradeLevel: grade } : null;
  const snap = scope ? await dataMeetingSnapshot(repo, actor, scope) : null;
  const past = scope ? await listDataMeetings(repo, actor, scope, 20) : [];
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const today = new Date().toISOString().slice(0, 10);
  const input = "mt-1 block w-full rounded-lg border-slate-300 text-sm";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/tiers", label: "Support tiers" }} icon="🗂️" title="Data meeting"
        subtitle="For a class or a grade team: the platform prepares what changed since your last meeting. Agree on who needs what, how, who owns it and when you review it." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Classes and grades" className="flex flex-wrap gap-2">
        {classes.map((c) => <Link key={String(c.id)} href={`/teacher/data-meeting?class=${c.id}`} className={chip(c.id === klass?.id)}>{String(c.name)}</Link>)}
        {grades.map((g) => <Link key={g} href={`/teacher/data-meeting?grade=${g}`} className={chip(grade === g)}>Grade {g} team</Link>)}
      </nav>
      {!scope && <p className="mt-4 text-slate-600">You have no classes yet.</p>}
      {snap && scope && (
        <>
          <h2 className="mt-6 text-xl font-bold text-brand-navy">{snap.label}: since {snap.since}</h2>
          <div className="mt-3"><Snapshot s={snap} /></div>
          <form action={saveDataMeetingAction} className="mt-6 space-y-3 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-brand-navy">Record the meeting</h2>
            {"classId" in scope ? <input type="hidden" name="classId" value={scope.classId} /> : <input type="hidden" name="grade" value={String(scope.gradeLevel)} />}
            <label className="block w-48 text-sm">Held on<input type="date" name="heldOn" defaultValue={today} required className={input} /></label>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <caption className="sr-only">Decisions</caption>
                <thead className="text-left text-xs uppercase text-slate-500"><tr><th scope="col" className="p-1">Who (students or group)</th><th scope="col" className="p-1">What (support)</th><th scope="col" className="p-1">How (time, materials)</th><th scope="col" className="p-1">Owner</th><th scope="col" className="p-1">Review on</th></tr></thead>
                <tbody>{Array.from({ length: DECISION_ROWS }, (_, i) => (
                  <tr key={i}>
                    <td className="p-1"><input name="who" maxLength={300} aria-label={`Decision ${i + 1}: who`} className={input} /></td>
                    <td className="p-1"><input name="what" maxLength={500} aria-label={`Decision ${i + 1}: what`} className={input} /></td>
                    <td className="p-1"><input name="how" maxLength={500} aria-label={`Decision ${i + 1}: how`} className={input} /></td>
                    <td className="p-1"><input name="owner" maxLength={120} aria-label={`Decision ${i + 1}: owner`} className={input} /></td>
                    <td className="p-1"><input type="date" name="reviewOn" aria-label={`Decision ${i + 1}: review date`} className={input} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <label className="block text-sm">Notes<textarea name="notes" rows={3} maxLength={5000} className={input} /></label>
            <button className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">💾 Save the meeting</button>
            <p className="text-xs text-slate-500">The snapshot above is saved with the meeting, so you can compare next time.</p>
          </form>
          <section className="mt-6">
            <h2 className="text-lg font-bold text-brand-navy">Past meetings</h2>
            {past.length ? <div className="mt-2 space-y-3">{past.map((m) => (
              <details key={m.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <summary className="cursor-pointer font-semibold text-brand-navy">{m.heldOn} · {m.label} · {m.decisions.length} decision{m.decisions.length === 1 ? "" : "s"}{m.createdBy ? ` · ${m.createdBy}` : ""}</summary>
                {m.decisions.length > 0 && <ul className="mt-2 space-y-1 text-sm">{m.decisions.map((x, i) => <li key={i} className="rounded-lg bg-slate-50 p-2"><b>{x.who || "—"}</b>: {x.what}{x.how ? ` · how: ${x.how}` : ""}{x.owner ? ` · owner: ${x.owner}` : ""}{x.reviewOn ? ` · review ${x.reviewOn}` : ""}</li>)}</ul>}
                {m.notes && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{m.notes}</p>}
                {m.snapshot?.tiers && <div className="mt-3"><Snapshot s={m.snapshot} /></div>}
              </details>
            ))}</div> : <p className="mt-2 text-sm text-slate-600">No meetings recorded yet.</p>}
          </section>
        </>
      )}
    </AppShell>
  );
}
