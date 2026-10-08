import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { personalPlan, BAND_RULE } from "@/server/map/personal-plan";
import { assignBandGoalsAction } from "./actions";

export const metadata = { title: "Personalized plan" };
const TONE = { BELOW: "border-orange-300 bg-orange-50/40", ON: "border-sky-300 bg-sky-50/40", ABOVE: "border-emerald-300 bg-emerald-50/40" } as const;
const TITLE = { BELOW: "🟠 Below level", ON: "🔵 On level", ABOVE: "🟢 Above level" } as const;

/** 📋 The Personalized Plan, generated from MAP: print / PDF, Word, and assign each group's goals. */
export default async function PersonalPlanPage({ searchParams }: { searchParams: Promise<{ classId?: string; subject?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = String(classes.find((c) => c.id === sp.classId)?.id ?? classes[0]?.id ?? "");
  const subject = sp.subject === "language" ? "LANGUAGE" : "READING";
  const p = classId ? await personalPlan(repo, actor, classId, subject) : null;
  const q = (o: Record<string, string>) => `/teacher/personal-plan?${new URLSearchParams({ classId, subject: subject.toLowerCase(), ...o })}`;
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-bold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="📋" title="Personalized plan"
          subtitle="Generated from the class's MAP scores: students in three groups (one percentile rule for every class), each group's goals from its weakest goal areas with the grade's skills and CCSS standards. Download it, print it, or assign each group's goals.">
          {p && <><PrintButton /><a href={`/api/personal-plan-doc?classId=${classId}&subject=${subject.toLowerCase()}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ Word</a></>}
          <Link href="/teacher/intervention" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🚨 Intervention</Link>
        </PageHeader>
        {sp.msg && <p role="status" className="animate-pop mb-4 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
        <nav className="mb-3 flex flex-wrap gap-2" aria-label="Class">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/personal-plan?classId=${c.id}&subject=${subject.toLowerCase()}`} className={pill(c.id === classId)}>{String(c.name)}</Link>)}</nav>
        <nav className="mb-5 flex gap-2" aria-label="Subject"><Link href={q({ subject: "reading" })} className={pill(subject === "READING")}>📖 Reading</Link><Link href={q({ subject: "language" })} className={pill(subject === "LANGUAGE")}>✍️ Language</Link></nav>
      </div>
      {!p ? <p className="text-slate-600">You do not teach a class yet.</p> : (
        <article className="space-y-6">
          <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none">
            <h1 className="text-2xl font-extrabold text-brand-navy">Personalized Plan – {p.className} – {subject === "READING" ? "Reading" : "Language"}</h1>
            <p className="mt-1 text-slate-600">Grade {p.grade} · Subject: L.A · Teacher: {p.teacher || "—"} · MAP term: {p.term ?? "no scores yet"}</p>
          </header>
          {p.bands.map((b) => (
            <section key={b.band} className={`break-inside-avoid rounded-3xl border-s-8 bg-white p-6 shadow-sm ring-1 ring-slate-200 ${TONE[b.band]}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-extrabold text-brand-navy">{TITLE[b.band]} {b.ritRange && <span className="text-base font-bold text-slate-500">{`{${b.ritRange}}`}</span>} <span className="text-sm font-semibold text-slate-500">· {BAND_RULE[b.band]} · {b.students.length} student(s)</span></h2>
                {b.students.length > 0 && b.goals.some((g) => g.skills.length) && (
                  <form action={assignBandGoalsAction} className="flex items-center gap-2 print:hidden">
                    <input type="hidden" name="classId" value={classId} /><input type="hidden" name="subject" value={subject} /><input type="hidden" name="band" value={b.band} />
                    <input type="date" name="dueAt" className="rounded-lg border border-slate-300 px-2 py-1 text-sm" aria-label="Due date (optional)" />
                    <button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:bg-brand-purple">⭐ Assign this group’s goals</button>
                  </form>
                )}
              </div>
              <table className="mt-3 w-full text-left text-sm">
                <thead><tr className="border-b text-slate-500"><th className="py-1.5">Names</th><th>RIT Score</th><th>Projected Spring RIT</th><th>Percentile</th></tr></thead>
                <tbody>{b.students.map((st) => <tr key={st.studentId} className="border-b last:border-0"><td className="py-1.5 font-medium">{st.name}{st.rapidGuess !== null && st.rapidGuess >= 30 && <span className="ms-1 rounded bg-red-100 px-1 text-xs font-bold text-red-800">⚠️ retest</span>}</td><td className="tabular-nums">{st.rit}</td><td className="tabular-nums">{st.projection ?? "—"}</td><td className="tabular-nums">{st.percentile ?? "—"}</td></tr>)}</tbody>
              </table>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><h3 className="font-bold text-brand-navy">🎯 Academic Goals – {subject === "READING" ? "Reading" : "Language"} + Standards</h3>
                  <ol className="mt-1 space-y-2 text-sm">{b.goals.map((g) => <li key={g.areaId}><b>{g.area}</b>{g.meanRit !== null && <span className="text-slate-500"> · mean RIT {g.meanRit}</span>}<ul className="ms-4 list-disc text-slate-700">{g.skills.map((k) => <li key={k.id}>{k.standards.length > 0 && <code className="me-1 text-xs text-emerald-800">{k.standards.join(", ")}</code>}{k.name}</li>)}</ul></li>)}</ol>
                </div>
                <div className="space-y-3 text-sm">
                  {b.strengths.length > 0 && <div><h3 className="font-bold text-brand-navy">💪 Areas of Strength</h3><ul className="ms-4 list-disc">{b.strengths.map((g) => <li key={g.areaId}>{g.area}{g.meanRit !== null && <span className="text-slate-500"> · {g.meanRit}</span>}</li>)}</ul></div>}
                  <div><h3 className="font-bold text-brand-navy">🧰 Resources</h3><ul className="ms-4 list-disc">{b.resources.map((r) => <li key={r}>{r}</li>)}</ul></div>
                  <div><h3 className="font-bold text-brand-navy">📈 Progress Monitoring</h3><ul className="ms-4 list-disc">{b.monitoring.map((r) => <li key={r}>{r}</li>)}</ul></div>
                </div>
              </div>
            </section>
          ))}
          {p.notTested.length > 0 && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">📝 Not tested yet ({subject === "READING" ? "Reading" : "Language"}): {p.notTested.join(", ")}</p>}
        </article>
      )}
    </AppShell>
  );
}
