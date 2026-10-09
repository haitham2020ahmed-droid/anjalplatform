import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentMap } from "@/server/map/student-map";
import { myMap } from "@/server/map/map-more";
import { assignedSkills } from "@/server/student/assigned";
import { mySkillPlan } from "@/server/map/skill-plan";
import { PageHeader } from "@/components/page-header";
import { DESC_STYLE, StatusChip, subjectName } from "@/components/map/map-ui";

export const metadata = { title: "My MAP" };

/**
 * 🗺️ My MAP — everything about MAP in one place: my results (Fall, Winter, Spring), my goal and how many RIT points
 * are left, my goal areas in the order to practise them, my plan from my teacher (PDF), and my MAP work.
 */
export default async function StudentMapPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [m, work, old, mine] = await Promise.all([myMap(repo, actor), assignedSkills(repo, actor), studentMap(repo, actor), mySkillPlan(repo, actor)]);
  const mapWork = work.items.filter((i) => i.track === "MAP");
  const todo = mapWork.filter((w) => w.status !== "COMPLETED");
  const withScores = m.subjects.filter((x) => x.profile.term);
  const hrefOf = (w: (typeof mapWork)[number]) => (w.status === "COMPLETED" ? `/student/assignments/${w.assignmentId}/report` : w.kind === "questions" ? `/quiz/${w.assignmentId}` : `/practice/${w.skillId}`);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="🗺️" title="My MAP" subtitle="My MAP Growth results, my goal, my plan and my MAP work — all here.">
        <Link href="/student/map-test" className="rounded-xl bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-800">🧭 MAP practice test</Link>
        {actor.studentId && <Link href={`/map-report/study-plan/${actor.studentId}`} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">📑 My Study Plan</Link>}
        {actor.studentId && <Link href={`/map-report/family/${actor.studentId}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📈 My MAP Report</Link>}
      </PageHeader>

      {/* 🎯 my MAP at a glance: where I started, where I am going, how far is left */}
      <section aria-label="My MAP at a glance" className="mb-6 grid gap-4 md:grid-cols-2">
        {(["READING", "LANGUAGE"] as const).map((subj) => {
          const sub = m.subjects.find((x) => x.subject === subj);
          const g = sub?.goal ?? null, o = sub?.profile.overall ?? null;
          const fall = g?.from ?? sub?.profile.history.find((h) => /fall/i.test(h.term))?.rit ?? null;
          const pct = g ? Math.max(0, Math.min(100, Math.round((100 * (g.now - g.from)) / Math.max(1, g.target - g.from)))) : 0;
          return (
            <div key={subj} className="rounded-3xl bg-gradient-to-br from-brand-navy to-indigo-800 p-5 text-white shadow-md">
              <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{subj === "READING" ? "📖" : "✏️"} {subjectName(subj)}</h2>{g?.reached && <span className="rounded-full bg-emerald-400 px-3 py-0.5 text-sm font-bold text-emerald-950">🎉 Goal reached</span>}</div>
              {!sub || (!o && fall === null) ? <p className="mt-3 text-white/80">No MAP results yet. They appear here when your school adds them.</p> : (
                <>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-2xl bg-white/10 p-2"><dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Fall</dt><dd className="text-2xl font-extrabold tabular-nums">{fall ?? "—"}</dd></div>
                    <div className="rounded-2xl bg-white/10 p-2"><dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Now</dt><dd className="text-2xl font-extrabold tabular-nums">{g ? `${g.nowIsEstimate ? "~" : ""}${g.now}` : o?.rit ?? "—"}</dd></div>
                    <div className="rounded-2xl bg-amber-400/90 p-2 text-amber-950"><dt className="text-[11px] font-semibold uppercase tracking-wide">Spring goal</dt><dd className="text-2xl font-extrabold tabular-nums">{g?.target ?? "—"}</dd></div>
                    <div className="rounded-2xl bg-white/10 p-2"><dt className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Points left</dt><dd className="text-2xl font-extrabold tabular-nums">{g ? (g.reached ? "0" : g.left) : "—"}</dd></div>
                  </dl>
                  {g ? (
                    <div className="mt-3">
                      <div className="h-3 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${subjectName(subj)}: progress to my Spring goal`}><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-400" style={{ width: `${pct}%` }} /></div>
                      <p className="mt-1 text-xs text-white/80">{pct}% of the way from Fall to my Spring goal{g.nowIsEstimate ? " · “now” is estimated from my practice" : ""}</p>
                    </div>
                  ) : <p className="mt-3 text-xs text-white/80">Your Spring goal appears when your teacher adds the Fall projection.</p>}
                </>
              )}
            </div>
          );
        })}
      </section>

      {todo.length > 0 && (
        <section className="mb-6 rounded-3xl bg-gradient-to-br bg-linear-to-br from-emerald-50 to-white p-5 ring-1 ring-emerald-200">
          <h2 className="text-xl font-bold text-brand-navy">📝 My MAP work ({todo.length} to do)</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {todo.map((w) => {
              const late = w.status === "OVERDUE";
              return (
                <li key={w.assignmentId}><Link href={hrefOf(w)} className={`lift flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ${late ? "ring-red-300" : "ring-emerald-200"}`}>
                  <span><span className="block font-bold text-brand-navy">{w.skill}</span><span className={`block text-xs ${late ? "font-semibold text-red-700" : "text-slate-500"}`}>{Math.round(w.progress * 100)}% · {late ? "late — you can still finish it" : w.dueAt ? `due ${w.dueAt.slice(0, 10)}` : "from my teacher"}</span></span>
                  <span className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white">{w.status === "NOT_STARTED" ? "Start ▶" : "Continue ▶"}</span>
                </Link></li>
              );
            })}
          </ul>
        </section>
      )}

      {!withScores.length && <p className="mb-6 rounded-2xl bg-white p-5 text-slate-700 ring-1 ring-slate-200">Your MAP results are not on the platform yet. Until then, practise below: the areas are in order of how you do on the platform.</p>}

      {withScores.map((sub) => {
        const p = sub.profile, o = p.overall!;
        const g = sub.goal;
        const pct = g ? Math.max(0, Math.min(100, Math.round((100 * (g.now - g.from)) / Math.max(1, g.target - g.from)))) : 0;
        return (
          <section key={sub.subject} className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <h2 className="text-2xl font-extrabold text-brand-navy">{sub.subject === "READING" ? "📖" : "✏️"} {subjectName(sub.subject)} <span className="text-base font-normal text-slate-500">· {p.term}</span></h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-500">My RIT</p>
                <p className="text-5xl font-bold text-brand-navy">{o.rit}</p>
                <p className="mt-1 text-sm text-slate-600">band {o.band}{o.lexile ? ` · Lexile ${o.lexile}L` : ""}</p>
                {o.descriptor && <p className="mt-2"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${DESC_STYLE[o.descriptor]}`}>{o.descriptor}{o.percentile !== null ? ` · percentile ${o.percentile}` : ""}</span></p>}
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 md:col-span-2">
                <p className="text-sm font-semibold text-amber-900">My Spring goal</p>
                {g ? (
                  <>
                    <p className="text-3xl font-extrabold text-brand-navy">{g.reached ? "🎉 Goal reached!" : `${g.left} RIT point${g.left === 1 ? "" : "s"} to my goal`}</p>
                    <p className="text-sm text-slate-700">Fall {g.from} → goal <b>{g.target}</b> · now {g.nowIsEstimate ? "about " : ""}<b>{g.now}</b>{g.nowIsEstimate ? " (from my practice)" : ""}</p>
                    <div className="mt-3 h-4 overflow-hidden rounded-full bg-white ring-1 ring-amber-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to my goal"><div className="h-full rounded-full bg-gradient-to-r bg-linear-to-r from-amber-400 to-emerald-500" style={{ width: `${pct}%` }} /></div>
                  </>
                ) : <p className="mt-1 text-slate-700">My goal appears when my teacher adds my Fall score with its projection.</p>}
                {g && g.now > g.from && <p className="mt-2 font-semibold text-emerald-700">🚀 You grew {g.now - g.from} RIT point{g.now - g.from === 1 ? "" : "s"} since Fall. Keep going!</p>}
                {p.history.length > 1 && <p className="mt-3 text-sm text-slate-700">My scores: {p.history.map((h) => `${h.term} ${h.rit}`).join(" → ")}</p>}
              </div>
            </div>
            <h3 className="mt-5 font-bold text-brand-navy">My goal areas <span className="text-sm font-normal text-slate-500">· {sub.orderedBy === "MAP" ? "in order of my MAP scores (weakest first)" : "in order of my practice on the platform"}</span></h3>
            <ul className="mt-2 grid gap-3 md:grid-cols-3">
              {sub.areas.map((a, i) => (
                <li key={a.group} className={`rounded-2xl p-4 ring-1 ${i === 0 && a.status === "FOCUS" ? "bg-red-50/40 ring-red-200" : "ring-slate-200"}`}>
                  <p className="font-bold text-brand-navy">{a.icon} {a.name}</p>
                  <p className="text-sm text-slate-600">{a.rit !== null ? `RIT ${a.rit} · band ${a.band}` : "No MAP score"}{a.accuracy !== null ? ` · ${a.accuracy}% correct here` : ""}</p>
                  <div className="mt-1 flex flex-wrap gap-1">{a.descriptor && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DESC_STYLE[a.descriptor]}`}>{a.descriptor}</span>}<StatusChip status={a.status} /></div>
                  {a.next && <Link href={`/practice/${a.next}?from=map`} className="mt-3 inline-block rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">Practise ▶</Link>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {m.plans.length > 0 && (
        <section className="mb-6 rounded-3xl bg-gradient-to-br bg-linear-to-br from-violet-50 to-white p-5 ring-1 ring-violet-200">
          <h2 className="text-xl font-bold text-brand-navy">📋 My MAP Plan</h2>
          {m.plans.map((d) => (
            <div key={d.id} className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-brand-navy">{subjectName(d.subject)} · {d.term}{d.dueAt ? ` · finish by ${d.dueAt.slice(0, 10)}` : ""}</p>
                <Link href={`/map-plan/${d.id}?print=1`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ Download my plan (PDF)</Link>
              </div>
              {d.note && <p className="mt-1 text-sm text-amber-900">💬 {d.note}</p>}
              <ol className="mt-2 space-y-2">{d.items.map((it, i) => (
                <li key={it.group} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <span>{i + 1}. {it.icon} <b>{it.name}</b> <span className="text-sm text-slate-600">· {it.count} questions at my level{it.skills.length ? ` · ${it.skills.join(", ")}` : ""}</span></span>
                  {it.assignmentId ? <Link href={it.done ? `/student/assignments/${it.assignmentId}/report` : `/quiz/${it.assignmentId}`} className={`rounded-lg px-3 py-1 text-sm font-semibold ${it.done ? "bg-emerald-100 text-emerald-800" : "bg-brand-navy text-white"}`}>{it.done ? "✅ Done" : `${it.progress ?? 0}% · Go ▶`}</Link> : null}
                </li>
              ))}</ol>
            </div>
          ))}
        </section>
      )}

      {!withScores.length && old.areas.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xl font-bold text-brand-navy">Practise for MAP</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {old.areas.map((a) => (
              <li key={a.code} className="rounded-2xl bg-white p-4 ring-1 ring-emerald-200">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold text-brand-navy">{a.name}</p><p className="text-sm text-slate-600">{a.skills.length} skill(s) · {a.mastery === null ? "not started" : `mastery ${a.mastery}%`}</p></div>
                  {a.next && <Link href={`/practice/${a.next}?from=map`} className="shrink-0 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">Practise ▶</Link>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-bold text-brand-navy">🧭 Skills at My Level</h2>
          <p className="text-sm text-slate-600">For each MAP goal area: your RIT range and skills to practise there, easiest first. Tap one to practise it.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {mine.map((g) => (
              <div key={g.group} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="font-bold text-brand-navy">{g.icon} {g.name}</p>
                <p className="text-xs text-slate-500">{g.subject === "READING" ? "Reading" : "Language Usage"} · my RIT {g.rit} · range {g.range}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">{g.skills.map((k) => <li key={k.id}><Link href={`/practice/${k.id}?from=map`} className="inline-block rounded-lg bg-slate-50 px-2.5 py-1 text-sm text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">{k.name}</Link></li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {mapWork.some((w) => w.status === "COMPLETED") && (
        <section className="mb-6">
          <h2 className="text-lg font-bold text-brand-navy">✅ Finished MAP Work</h2>
          <ul className="mt-2 flex flex-wrap gap-2">{mapWork.filter((w) => w.status === "COMPLETED").map((w) => <li key={w.assignmentId}><Link href={hrefOf(w)} className="inline-block rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 hover:ring-brand-teal">{w.skill} · report</Link></li>)}</ul>
        </section>
      )}
    </AppShell>
  );
}
