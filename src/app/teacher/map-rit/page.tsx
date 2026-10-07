import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { classLevels } from "@/server/curriculum-map/levels";
import { nationalNorm, ritView, SEASONS } from "@/server/map/rit";
import { enterRitAction, importMapScoresAction, levelsFromRitAction, updateNormsAction } from "../map-rit-actions";

const BAND_STYLE: Record<string, string> = { Low: "bg-red-100 text-red-800", LoAvg: "bg-orange-100 text-orange-800", Avg: "bg-slate-100 text-slate-700", HiAvg: "bg-teal-100 text-teal-800", High: "bg-emerald-100 text-emerald-800" };
const VS: Record<string, [string, string]> = { ABOVE: ["Above class average", "text-emerald-700"], AT: ["At class average", "text-slate-600"], BELOW: ["Below class average", "text-red-700"] };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** 🗺️ MAP Reading RIT: ranking against the national average and the class average (Grades 4–6). */
export default async function MapRitPage({ searchParams }: { searchParams: Promise<{ grade?: string; classId?: string; term?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const v = await ritView(repo, actor, { grade: Number(sp.grade) || undefined, classId: sp.classId || undefined, term: sp.term || undefined });
  const isAdmin = actor.role !== "TEACHER";
  const roster = v.classId ? await classLevels(repo, actor, v.classId) : null;
  const ritOf = new Map(v.rows.map((r) => [r.studentId, r.rit]));
  const norms = isAdmin && can(actor, "settings:school") ? await Promise.all([4, 5, 6].map(async (g) => ({ g, s: await Promise.all(SEASONS.map(async (se) => ({ se, n: await nationalNorm(repo, g, se) }))) }))) : null;
  const link = (p: Record<string, string | number | null | undefined>) => `/teacher/map-rit?${new URLSearchParams(Object.entries(p).filter(([, x]) => x !== null && x !== undefined && x !== "").map(([k, x]) => [k, String(x)]))}`;
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`;
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  const tile = (label: string, value: string, extra = "") => <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{label}</dt><dd className={`text-2xl font-bold text-brand-navy ${extra}`}>{value}</dd></div>;
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={isAdmin ? "/admin" : "/teacher"} className="text-brand-teal hover:underline">← Back</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy"><span aria-hidden="true">🗺️</span> MAP Reading · RIT</h1>
      <p className="mt-1 max-w-3xl text-slate-600">Students ranked by RIT, compared with the national average for their grade and season (NWEA norms) and with their class average (±{3} RIT counts as “at” the average).</p>
      {sp.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {v.canEdit && (
        <form action={importMapScoresAction} className="mt-4 rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-200">
          <h2 className="font-bold text-brand-navy">📥 Import MAP scores (Fall RIT + Spring Projection)</h2>
          <p className="text-sm text-slate-600">1. Download the template (your students are already listed) · 2. Fill “Fall RIT”, “Spring Projection” and, if you have it, “Fall Lexile” (from the NWEA report; the Lexile decides where adaptive curriculum practice starts) · 3. Upload. Students without a score are skipped; a second import of the same Fall replaces the old scores.</p>
          <div className="mt-2 flex flex-wrap items-end gap-3 text-sm">
            <a href={`/api/map-scores-template${v.classId ? `?classId=${v.classId}` : ""}`} className="rounded-lg px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-white">⬇ Download template</a>
            <label className="flex flex-col">Fall of year<input type="number" name="year" min={2000} max={2100} defaultValue={new Date().getFullYear()} className={`${box} w-28`} /></label>
            <label className="flex flex-col">File (CSV or Excel)<input type="file" name="file" accept=".csv,.xlsx" required className="text-sm" /></label>
            <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Import</button>
          </div>
        </form>
      )}
      <nav aria-label="Grade" className="mt-4 flex flex-wrap gap-2">
        {v.grades.map((g) => <Link key={g} href={link({ grade: g })} className={pill(v.grade === g && !v.classId)} aria-current={v.grade === g && !v.classId ? "page" : undefined}>Grade {g} (all classes)</Link>)}
      </nav>
      <nav aria-label="Class" className="mt-2 flex flex-wrap gap-2">
        {v.classes.filter((c) => c.grade === v.grade).map((c) => <Link key={c.id} href={link({ classId: c.id, term: v.term })} className={pill(v.classId === c.id)} aria-current={v.classId === c.id ? "page" : undefined}>{c.name}</Link>)}
      </nav>
      {v.terms.length > 1 && (
        <form className="mt-3 flex items-center gap-2 text-sm">
          {v.classId ? <input type="hidden" name="classId" value={v.classId} /> : <input type="hidden" name="grade" value={v.grade ?? ""} />}
          <label>Term <select name="term" defaultValue={v.term ?? ""} className={box}>{v.terms.map((t) => <option key={t}>{t}</option>)}</select></label>
          <button className="rounded-lg px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">Show</button>
        </form>
      )}
      {!v.rows.length ? <p className="mt-6 rounded-xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">No Reading RIT scores yet for this {v.classId ? "class" : "grade"}. Import the MAP file (Admin → Imports) or enter scores below.</p> : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {tile("Students", String(v.summary.students))}
            {tile(`Average RIT (${v.term})`, String(v.summary.average))}
            {tile(`National average · Grade ${v.grade} ${v.season?.toLowerCase()}`, v.norm ? String(v.norm.mean) : "—")}
            {tile("At or above national average", v.summary.atOrAboveNational === null ? "—" : `${v.summary.atOrAboveNational}%`, (v.summary.atOrAboveNational ?? 0) >= 50 ? "!text-emerald-700" : "!text-red-700")}
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">NWEA bands:</span>
            {Object.entries(v.summary.bands).map(([b, n]) => <span key={b} className={`rounded-full px-2.5 py-0.5 font-semibold ${BAND_STYLE[b]}`}>{b}: {n}</span>)}
          </div>
          {!v.classId && v.summary.classAverages.length > 1 && (
            <p className="mt-2 text-sm text-slate-700">Class averages: {v.summary.classAverages.map((c) => `${c.name} ${c.average}`).join(" · ")}</p>
          )}
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="p-3">Rank</th><th>Student</th>{!v.classId && <th>Class</th>}<th>RIT</th><th>vs national</th><th>Percentile</th><th>Band</th><th>vs class average</th><th>Spring projection</th><th>Lexile</th></tr></thead>
              <tbody>{v.rows.map((r) => (
                <tr key={r.studentId} className="border-b last:border-0">
                  <td className="p-3 font-bold tabular-nums">{r.rank}</td><td className="font-medium">{r.name}</td>{!v.classId && <td>{r.className}</td>}
                  <td className="font-semibold tabular-nums">{r.rit}</td>
                  <td className={`tabular-nums ${r.national && r.national.diff >= 0 ? "text-emerald-700" : "text-red-700"}`}>{r.national ? signed(r.national.diff) : "—"}</td>
                  <td className="tabular-nums">{r.national ? `${r.national.estimated ? "≈" : ""}${r.national.percentile}` : "—"}</td>
                  <td>{r.national && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_STYLE[r.national.band]}`}>{r.national.band}</span>}</td>
                  <td className={VS[r.vsClass][1]}>{VS[r.vsClass][0]} <span className="text-xs text-slate-500">({signed(r.diffClass)})</span></td>
                  <td className="tabular-nums">{r.projection === null ? "—" : <>{r.projection}{r.vsProjection !== null && <span className={`ms-1 text-xs font-semibold ${r.vsProjection >= 0 ? "text-emerald-700" : "text-red-700"}`}>({r.vsProjection >= 0 ? "met" : `${signed(r.vsProjection)} to go`})</span>}</>}</td>
                  <td className="tabular-nums">{r.lexile === null ? "—" : `${r.lexile}L`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">≈ percentile estimated from the national mean and SD (NWEA’s own percentile is shown when the MAP file is imported). Norms: {v.norm?.source}.</p>
          {v.classId && (
            <form action={levelsFromRitAction} className="mt-4">
              <input type="hidden" name="classId" value={v.classId} /><input type="hidden" name="term" value={v.term ?? ""} />
              <button className="rounded-xl bg-amber-100 px-4 py-2 font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200">🎯 Set student levels from the class average (Above / On / Below)</button>
            </form>
          )}
        </>
      )}
      {roster && v.canEdit && (
        <form action={enterRitAction} className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <input type="hidden" name="classId" value={roster.classId} />
          <h2 className="text-lg font-bold text-brand-navy">Enter RIT scores · {roster.className}</h2>
          <p className="text-sm text-slate-600">For schools without the MAP file. A score entered again for the same term replaces the old one; empty boxes are skipped.</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <label className="flex flex-col">Term<input name="term" required defaultValue={v.term ?? ""} placeholder="Fall 2026" pattern="(Fall|Winter|Spring) [0-9]{4}" className={box} /></label>
            <label className="flex flex-col">Test date<input type="date" name="testDate" className={box} /></label>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {roster.students.map((st) => <label key={st.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-200">{st.name}<input type="number" name={`rit:${st.id}`} min={100} max={350} defaultValue={ritOf.get(st.id) ?? ""} aria-label={`RIT of ${st.name}`} className="w-24 rounded-md border border-slate-300 px-2 py-1" /></label>)}
          </div>
          <button className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">Save RIT scores</button>
        </form>
      )}
      {norms && (
        <form action={updateNormsAction} className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">National averages (NWEA norms) · admins</h2>
          <p className="text-sm text-slate-600">Mean RIT and standard deviation for Reading. Update them when NWEA publishes new norms.</p>
          <table className="mt-3 text-sm">
            <thead><tr className="text-slate-500"><th className="pe-4 text-left">Grade</th>{SEASONS.map((se) => <th key={se} className="px-2 text-left">{se.charAt(0) + se.slice(1).toLowerCase()} (mean / SD)</th>)}</tr></thead>
            <tbody>{norms.map(({ g, s }) => (
              <tr key={g}><td className="pe-4 font-semibold">{g}</td>{s.map(({ se, n }) => (
                <td key={se} className="px-2 py-1"><input name={`mean:${g}:${se}`} type="number" step="0.1" defaultValue={n?.mean} aria-label={`Grade ${g} ${se} mean`} className="w-20 rounded-md border border-slate-300 px-2 py-1" /> / <input name={`sd:${g}:${se}`} type="number" step="0.1" defaultValue={n?.sd} aria-label={`Grade ${g} ${se} SD`} className="w-16 rounded-md border border-slate-300 px-2 py-1" /></td>
              ))}</tr>
            ))}</tbody>
          </table>
          <label className="mt-3 flex flex-col text-sm">Source<input name="source" required defaultValue={norms[0].s[0].n?.source ?? ""} className={`${box} max-w-xl`} /></label>
          <button className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">Save national averages</button>
        </form>
      )}
    </AppShell>
  );
}
