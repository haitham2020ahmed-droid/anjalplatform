import { NameList } from "@/components/name-list";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classTextSets, progressCheckResults, type ClassResults } from "@/server/progress-checks/progress-checks";
import { cycleStatus, type CycleStatus } from "@/server/assessment-cycle/status";
import { createProgressCheckAction } from "./actions";
import { Combo } from "@/components/ui/combo";

export const metadata = { title: "Progress checks" };

const tone = (pct: number | null) => pct === null ? "bg-slate-50 text-slate-500" : pct >= 80 ? "bg-emerald-100 text-emerald-900" : pct >= 60 ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900";
const STATUS: Record<string, string> = { NOT_ASSIGNED: "—", NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETED: "Done", OVERDUE: "Overdue" };
const ICON: Record<string, string> = { PROGRESS: "📋", FLUENCY: "🎙", DIAGNOSTIC: "🩺", WEEKLY: "📅" };

/** 🧭 "Where are we in the cycle": week, open windows, due this week and overdue for the class. */
function CycleStrip({ st, classId }: { st: CycleStatus; classId: string }) {
  const c = st.classes.find((x) => x.classId === classId);
  return (
    <section aria-label="Where are we in the cycle" className="mb-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-brand-navy px-3 py-1 font-bold text-white">{st.week > 0 ? `Week ${st.week}` : "Before the school year"} · {st.cycle.year}</span>
        {st.windows.map((w) => <span key={w.title} className={`rounded-full px-3 py-1 font-semibold ${w.state === "OPEN" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>{w.state === "OPEN" ? "Open now" : "Soon"}: {w.title} ({w.opens} – {w.closes})</span>)}
        {!st.windows.length && <span className="text-slate-500">No assessment window open.</span>}
        {!st.saved && <span className="text-xs text-slate-500">(default school-year plan — the admin can change it)</span>}
      </div>
      {c && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div><h3 className="text-xs font-bold uppercase tracking-wide text-red-700">Overdue ({c.overdue.length})</h3>
            <ul className="mt-1 space-y-1 text-sm">{c.overdue.map((i, k) => <li key={k}><Link href={i.href} className="font-semibold text-red-800 hover:underline">{ICON[i.kind]} {i.title}</Link> <span className="text-slate-600">{i.detail}</span></li>)}{!c.overdue.length && <li className="text-slate-500">Nothing overdue.</li>}</ul></div>
          <div><h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Due this week ({c.due.length})</h3>
            <ul className="mt-1 space-y-1 text-sm">{c.due.map((i, k) => <li key={k}><Link href={i.href} className="font-semibold text-brand-navy hover:underline">{ICON[i.kind]} {i.title}</Link> <span className="text-slate-600">{i.detail}</span></li>)}{!c.due.length && <li className="text-slate-500">Nothing due this week.</li>}</ul></div>
        </div>
      )}
    </section>
  );
}

/** One student's progress-check scores over the year, with the 80% line (a single series: no legend). */
function StudentGraph({ r, studentId }: { r: ClassResults; studentId: string }) {
  const st = r.students.find((x) => x.id === studentId);
  if (!st) return null;
  const pts = st.cells.map((c, i) => ({ i, pct: c.pct, code: r.checks[i].code, comp: c.comprehension, voc: c.vocabulary })).filter((p) => p.pct !== null) as { i: number; pct: number; code: string; comp: number | null; voc: number | null }[];
  const W = 560, H = 180, L = 36, R = 12, T = 10, B = 28;
  const n = Math.max(1, r.checks.length - 1);
  const x = (i: number) => L + ((W - L - R) * i) / n, y = (p: number) => T + ((H - T - B) * (100 - p)) / 100;
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-bold">📈 {st.name}: progress checks over the year</h2>
      {pts.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full max-w-2xl" role="img" aria-label={`${st.name}'s progress check scores: ${pts.map((p) => `${p.code} ${p.pct}%`).join(", ")}`}>
          {[0, 50, 100].map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeWidth={1} /><text x={L - 6} y={y(g) + 4} textAnchor="end" fontSize="10" fill="#64748b">{g}%</text></g>)}
          <line x1={L} x2={W - R} y1={y(80)} y2={y(80)} stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" /><text x={W - R} y={y(80) - 4} textAnchor="end" fontSize="10" fill="#334155">Pass 80%</text>
          <polyline points={pts.map((p) => `${x(p.i)},${y(p.pct)}`).join(" ")} fill="none" stroke="#1F3A68" strokeWidth={2} strokeLinejoin="round" />
          {pts.map((p) => <g key={p.i}><circle cx={x(p.i)} cy={y(p.pct)} r={5} fill="#1F3A68" stroke="#fff" strokeWidth={2}><title>{`${p.code}: ${p.pct}% (Comprehension ${p.comp ?? "–"}%, Vocabulary ${p.voc ?? "–"}%)`}</title></circle><circle cx={x(p.i)} cy={y(p.pct)} r={12} fill="transparent"><title>{`${p.code}: ${p.pct}%`}</title></circle></g>)}
          {r.checks.map((c, i) => <text key={c.id} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#64748b">{c.code.replace(/^G\d-/, "")}</text>)}
        </svg>
      ) : <p className="mt-2 text-sm text-slate-600">No completed progress checks yet.</p>}
    </section>
  );
}

/** 📋 Text-set progress checks: give one, see the class grid across the year, reteach what was missed. */
export default async function ProgressChecksPage({ searchParams }: { searchParams: Promise<{ class?: string; lesson?: string; check?: string; student?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const k = classes.find((c) => c.id === sp.class) ?? classes[0];
  if (!k) {
    return <AppShell name={String(me.displayName)}><PageHeader back={{ href: "/teacher", label: "Home" }} icon="📋" title="Progress checks" /><p className="text-slate-600">You have no classes yet.</p></AppShell>;
  }
  const classId = String(k.id);
  const [strip, sets, res] = await Promise.all([cycleStatus(repo, actor, new Date(), { classId }).catch(() => null), classTextSets(repo, actor, classId), progressCheckResults(repo, actor, classId)]);
  const check = res.checks.find((c) => c.id === sp.check) ?? res.checks[res.checks.length - 1];
  const ci = check ? res.checks.indexOf(check) : -1;
  const q = (o: Record<string, string>) => `/teacher/progress-checks?${new URLSearchParams({ class: classId, ...o })}`;
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="📋" title="Progress checks"
        subtitle="A short check at the end of each text set: about 10 questions on the skills just taught, a Comprehension and a Vocabulary score, 80% to pass. Results feed the support tiers." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-200">{sp.msg}</p>}
      <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/progress-checks?class=${String(c.id)}`} aria-current={c.id === k.id ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === k.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}</nav>
      {strip && <CycleStrip st={strip} classId={classId} />}

      {actor.role === "TEACHER" && (
        <form action={createProgressCheckAction} className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <input type="hidden" name="classId" value={classId} />
          <label className="text-sm font-semibold">Text set
            <Combo name="lessonId" required label="Text set" defaultValue={sp.lesson ?? sets.find((t) => !t.checks)?.lessonId ?? ""} options={sets.map((t) => ({ value: t.lessonId, label: `${t.code} · ${t.title}`, hint: t.checks ? `✓ (${t.checks} form${t.checks === 1 ? "" : "s"})` : undefined }))} className="mt-1 w-80 max-w-full font-normal" /></label>
          <label className="text-sm font-semibold">Due<input type="date" name="dueAt" defaultValue={due} className="mt-1 block rounded-lg border-slate-300 text-sm" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="retake" value="1" /> New form (retake)</label>
          <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">📋 Assign progress check</button>
          {!sets.length && <p className="text-sm text-slate-600">No text sets in this class's curriculum.</p>}
        </form>
      )}

      <section className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="p-3 text-left font-bold">Class grid: students × progress checks (green 80%+ pass · amber 60–79% · red under 60%)</caption>
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th scope="col" className="p-2">Student</th>
            {res.checks.map((c) => <th key={c.id} scope="col" className="p-2"><Link href={q({ check: c.id })} className={`font-bold hover:underline ${c.id === check?.id ? "text-brand-navy underline" : ""}`} title={c.title}>{c.code || "Check"}</Link><div className="font-normal">{c.completed}/{c.assigned} done{c.avgPct !== null ? ` · avg ${c.avgPct}%` : ""}</div></th>)}
            <th scope="col" className="p-2">Average</th></tr></thead>
          <tbody>{res.students.map((st) => (
            <tr key={st.id} className="border-t border-slate-100">
              <th scope="row" className="p-2 text-left font-semibold"><Link href={q({ ...(check ? { check: check.id } : {}), student: st.id })} className="hover:underline">{st.name}</Link></th>
              {st.cells.map((c, i) => <td key={i} className="p-1"><span className={`block rounded-md px-2 py-1 text-center tabular-nums ${tone(c.pct)}`} title={c.pct !== null ? `Comprehension ${c.comprehension ?? "–"}% · Vocabulary ${c.vocabulary ?? "–"}%` : STATUS[c.status]}>{c.pct !== null ? `${c.pct}%${c.pass ? " ✓" : ""}` : STATUS[c.status]}</span></td>)}
              <td className="p-2 tabular-nums">{st.avgPct !== null ? `${st.avgPct}% (${st.checksPassed}/${st.checksDone} passed)` : "—"}</td>
            </tr>))}
            {!res.checks.length && <tr><td colSpan={2} className="p-4 text-slate-600">No progress checks yet: give the first one above.</td></tr>}
          </tbody>
        </table>
      </section>

      {check && (
        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200 lg:col-span-2">
            <table className="w-full text-sm">
              <caption className="p-3 text-left font-bold">{check.title} — {check.items} questions ({check.comprehensionItems} comprehension, {check.vocabularyItems} vocabulary){check.passRate !== null ? ` · ${check.passRate}% passed` : ""}</caption>
              <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th scope="col" className="p-2">Student</th><th scope="col" className="p-2">Total</th><th scope="col" className="p-2">Comprehension</th><th scope="col" className="p-2">Vocabulary</th><th scope="col" className="p-2">Result</th><th scope="col" className="p-2">Missed skills</th></tr></thead>
              <tbody>{res.students.map((st) => { const c = st.cells[ci]; return (
                <tr key={st.id} className="border-t border-slate-100 tabular-nums">
                  <th scope="row" className="p-2 text-left font-semibold">{st.name}</th>
                  <td className="p-2">{c.pct !== null ? `${c.pct}%` : `${c.answered}/${c.total}`}</td><td className="p-2">{c.comprehension ?? "–"}{c.comprehension !== null ? "%" : ""}</td><td className="p-2">{c.vocabulary ?? "–"}{c.vocabulary !== null ? "%" : ""}</td>
                  <td className="p-2">{c.pct === null ? STATUS[c.status] : c.pass ? "✓ Pass" : "✗ Reteach"}</td>
                  <td className="p-2 text-xs">{c.missedSkills.map((m) => `${m.name} (${m.missed})`).join(", ") || (c.pct !== null ? "—" : "")}</td>
                </tr>); })}</tbody>
            </table>
          </div>
          <aside className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <h2 className="font-bold">🔁 Reteach suggestions</h2>
            <p className="text-xs text-slate-600">Skills missed by students under 80% on this check. Open a skill to assign practice from the question bank.</p>
            <ul className="mt-2 space-y-2 text-sm">{res.reteach.filter((x) => x.checkId === check.id).map((x) => (
              <li key={x.skillId}><Link href={x.href} className="font-semibold text-brand-navy hover:underline">{x.name}</Link> <span className="text-slate-600">— {x.students.length} student{x.students.length === 1 ? "" : "s"}: <NameList items={x.students.slice(0, 6)} sep=", " />{x.students.length > 6 ? "…" : ""}</span></li>
            ))}{!res.reteach.some((x) => x.checkId === check.id) && <li className="text-slate-500">Nothing to reteach yet.</li>}</ul>
          </aside>
        </section>
      )}
      {sp.student && <StudentGraph r={res} studentId={sp.student} />}
    </AppShell>
  );
}
