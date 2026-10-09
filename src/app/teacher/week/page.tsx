import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { FirstWeekChecklist } from "@/components/teacher/checklist";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { onboarding, weekSuggestions } from "@/server/teacher/week-plan";
import { classTickets, classWeek } from "@/server/teacher/classroom";
import { pickerSkills } from "@/server/teacher/worksheet";
import { classGoalAction, exitTicketAction, planNextWeekAction, rhythmAction } from "./actions";

export const metadata = { title: "My week" };

/** 📅 The teacher's week: what to do next for each class, “Plan next week” in one click, goals, rhythm, exit tickets. */
export default async function WeekPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [sug, skills, ob] = await Promise.all([weekSuggestions(repo, actor), pickerSkills(repo, actor), actor.role === "TEACHER" ? onboarding(repo, actor) : Promise.resolve(null)]);
  const classId = sug.some((c) => c.classId === sp.classId) ? String(sp.classId) : sug[0]?.classId ?? "";
  const cur = sug.find((c) => c.classId === classId);
  const [wk, tickets] = classId ? await Promise.all([classWeek(repo, actor, classId), classTickets(repo, actor, classId)]) : [null, []];
  const klass = classId ? await repo.findUnique("Class", { id: classId }) : null;
  const grade = klass ? Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0) : 0;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const box = "rounded-lg border border-slate-300 px-2 py-1.5";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="📅" title="My week" subtitle="What each class needs next week, with the plan in one click. Goals and the weekly rhythm motivate students; exit tickets show at once what the lesson left behind." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {ob && !ob.hidden && ob.done < ob.steps.length && <FirstWeekChecklist steps={ob.steps} back="/teacher/week" />}
      {!sug.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">You do not teach a class yet.</p> : (
        <>
          <nav aria-label="Classes" className="flex flex-wrap gap-2">{sug.map((c) => <Link key={c.classId} href={`/teacher/week?classId=${c.classId}`} className={chip(c.classId === classId)}>{c.className}{c.suggestions.length ? ` · ${c.suggestions.length}` : ""}</Link>)}</nav>
          {cur && (
            <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-brand-navy">💡 Suggested for next week · {cur.className}</h2>
                <form action={planNextWeekAction}><input type="hidden" name="classId" value={classId} /><button className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700">⚡ Plan next week</button></form>
              </div>
              <p className="mt-1 text-sm text-slate-500">“Plan next week” assigns the class’s weakest skills again (adaptive, Monday → Thursday) and sends the MAP plans that are ready.</p>
              {!cur.suggestions.length ? <p className="mt-3 text-emerald-800">✅ Nothing urgent: the class is doing well.</p> : (
                <ul className="mt-3 space-y-2">{cur.suggestions.map((x, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"><span>{x.kind === "RETEACH" ? "🧩" : x.kind === "MAP_PLANS" ? "📋" : x.kind === "GROUPS" ? "👥" : x.kind === "ALERTS" ? "🚨" : "📅"} {x.text}</span>{x.href && <Link href={x.href} className="text-sm font-semibold text-brand-teal underline">Open</Link>}</li>)}</ul>
              )}
            </section>
          )}
          {wk && (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="font-bold text-brand-navy">👥 Class goal this week</h2>
                {wk.goal && <p className="mt-1 text-2xl font-extrabold text-brand-navy">{wk.goal.progress} / {wk.goal.target} <span className="text-sm font-semibold text-slate-500">{wk.goal.kind.toLowerCase()}</span> {wk.goal.done ? "🎉" : ""}</p>}
                <form action={classGoalAction} className="mt-2 space-y-2 text-sm">
                  <input type="hidden" name="classId" value={classId} />
                  <div className="flex gap-2"><input name="target" type="number" min={5} max={20000} defaultValue={wk.goal?.target ?? 300} className={`${box} w-24`} aria-label="Target" />
                    <select name="kind" defaultValue={wk.goal?.kind ?? "ANSWERS"} className={box} aria-label="Kind"><option value="ANSWERS">answers</option><option value="TASKS">tasks done</option><option value="MINUTES">minutes</option></select></div>
                  <input name="title" maxLength={160} defaultValue={wk.goal?.title ?? ""} placeholder="e.g. 300 answers together!" className={`${box} w-full`} />
                  <button className="rounded-lg bg-brand-navy px-3 py-1.5 font-semibold text-white">Save goal</button>
                </form>
              </section>
              <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="font-bold text-brand-navy">📅 Weekly rhythm</h2>
                <p className="mt-1 text-sm text-slate-600">{wk.rhythm ? <>{wk.onRhythm} of {wk.members} students on rhythm this week.</> : "Short practice on several days works better than a lot at once."}</p>
                <form action={rhythmAction} className="mt-2 flex flex-wrap items-end gap-2 text-sm">
                  <input type="hidden" name="classId" value={classId} />
                  <label>Days / week<select name="days" defaultValue={wk.rhythm?.days ?? 3} className={`${box} block`}><option value="0">off</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                  <label>Minutes<input name="minutes" type="number" min={5} max={90} defaultValue={wk.rhythm?.minutes ?? 15} className={`${box} block w-20`} /></label>
                  <button className="rounded-lg bg-brand-navy px-3 py-1.5 font-semibold text-white">Save</button>
                </form>
              </section>
              <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
                <h2 className="font-bold text-brand-navy">🎫 Exit ticket</h2>
                <p className="mt-1 text-sm text-slate-600">3 quick questions at the end of the lesson; results live.</p>
                <form action={exitTicketAction} className="mt-2 space-y-2 text-sm">
                  <input type="hidden" name="classId" value={classId} />
                  <select name="skillId" required className={`${box} w-full`} aria-label="Skill"><option value="">Choose today’s skill…</option>{skills.filter((k) => k.grade === grade).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
                  <button className="rounded-lg bg-sky-700 px-3 py-1.5 font-semibold text-white">Open the exit ticket</button>
                </form>
                {tickets.length > 0 && <ul className="mt-3 space-y-1 text-sm">{tickets.slice(0, 5).map((t) => <li key={t.id}><Link href={`/teacher/exit/${t.id}`} className="text-brand-teal underline">{t.title}</Link> <span className="text-slate-500">· {t.createdAt.slice(0, 10)}{t.status === "OPEN" ? " · open" : ""}</span></li>)}</ul>}
              </section>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
