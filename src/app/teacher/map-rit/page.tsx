import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { classLevels } from "@/server/curriculum-map/levels";
import { nationalNorm, ritView, SEASONS } from "@/server/map/rit";
import { addNormGradeAction, enterRitAction, importMapScoresInline, levelsFromRitAction, updateNormsAction } from "../map-rit-actions";
import { MapImportBox } from "@/components/map/import-box";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "MAP RIT" };

const BAND_STYLE: Record<string, string> = { Low: "bg-red-100 text-red-800", LoAvg: "bg-orange-100 text-orange-800", Avg: "bg-slate-100 text-slate-700", HiAvg: "bg-teal-100 text-teal-800", High: "bg-emerald-100 text-emerald-800" };
const VS: Record<string, [string, string]> = { ABOVE: ["Above class average", "text-emerald-700"], AT: ["At class average", "text-slate-600"], BELOW: ["Below class average", "text-red-700"] };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** 🗺️ MAP Reading RIT: ranking against the national average and the class average (Grades 4–6). */
export default async function MapRitPage({ searchParams }: { searchParams: Promise<{ grade?: string; classId?: string; term?: string; msg?: string; subject?: string; extraGrades?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const subject = sp.subject === "language" ? "LANGUAGE" : "READING";
  const v = await ritView(repo, actor, { grade: Number(sp.grade) || undefined, classId: sp.classId || undefined, term: sp.term || undefined, subject });
  const isAdmin = actor.role !== "TEACHER";
  const roster = v.classId ? await classLevels(repo, actor, v.classId) : null;
  const ritOf = new Map(v.rows.map((r) => [r.studentId, r.rit]));
  // 🐛 fix (audit finding, Oct 2026): was hardcoded to [4, 5, 6] and Reading only, so a grade outside 4–6 (e.g.
  // Grade 11, which already has real MAP scores on the platform) could never get a national norm — `bandOf` in
  // personal-plan.ts then silently showed every such student as "On level" instead of a real percentile. Every
  // grade that actually has a class (v.grades, from ritView's own accessibleClasses — at least 4/5/6 always shown
  // even with none yet) now gets its own row, for both subjects.
  // ✨ feature (requested, Oct 2026): `extraGrades` (?extraGrades=7,8) adds rows for a grade with no class yet
  // (e.g. preparing ahead of a grade the school is about to open) — see addNormGradeAction's "Add a grade" box below.
  const extraGrades = (sp.extraGrades ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const gradeList = [...new Set([4, 5, 6, ...v.grades, ...extraGrades])].sort((a, b) => a - b);
  const norms = isAdmin && can(actor, "settings:school") ? await Promise.all(gradeList.map(async (g) => ({
    g,
    s: await Promise.all(SEASONS.map(async (se) => ({ se, reading: await nationalNorm(repo, g, se, "READING"), language: await nationalNorm(repo, g, se, "LANGUAGE") }))),
  }))) : null;
  const link = (p0: Record<string, string | number | null | undefined>) => { const p = { ...p0, subject: subject === "LANGUAGE" ? "language" : undefined }; return `/teacher/map-rit?${new URLSearchParams(Object.entries(p).filter(([, x]) => x !== null && x !== undefined && x !== "").map(([k, x]) => [k, String(x)]))}`; };
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`;
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  const tile = (label: string, value: string, extra = "") => <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{label}</dt><dd className={`text-2xl font-bold text-brand-navy ${extra}`}>{value}</dd></div>;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/map-center?tab=results", label: "MAP" }} icon="🗺️" title="MAP Reading · RIT" subtitle={<>Students ranked by RIT, compared with the national average for their grade and season (NWEA norms) and with their class average (±{3} RIT counts as “at” the average).</>}><Link href="/teacher/map-entry" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">✏️ Enter MAP data</Link>
          <Link href="/teacher/alerts?view=flags" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🚨 Intervention</Link></PageHeader>
      {sp.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {v.canEdit && (
        <MapImportBox classId={v.classId} className={v.classes.find((c) => c.id === v.classId)?.name ?? null} run={importMapScoresInline} />
      )}
      <nav aria-label="Subject" className="mt-4 flex flex-wrap gap-2">
        {([["READING", "📖 Reading"], ["LANGUAGE", "✍️ Language Usage"]] as const).map(([k, l]) => <Link key={k} href={`/teacher/map-rit?${new URLSearchParams({ ...(v.classId ? { classId: v.classId } : v.grade ? { grade: String(v.grade) } : {}), ...(k === "LANGUAGE" ? { subject: "language" } : {}) })}`} aria-current={subject === k ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${subject === k ? "bg-emerald-600 text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>{l}</Link>)}
      </nav>
      <nav aria-label="Grade" className="mt-4 flex flex-wrap gap-2">
        {v.grades.map((g) => <Link key={g} href={link({ grade: g })} className={pill(v.grade === g && !v.classId)} aria-current={v.grade === g && !v.classId ? "page" : undefined}>Grade {g} (all classes)</Link>)}
      </nav>
      <nav aria-label="Class" className="mt-2 flex flex-wrap gap-2">
        {v.classes.filter((c) => c.grade === v.grade).map((c) => <Link key={c.id} href={link({ classId: c.id, term: v.term })} className={pill(v.classId === c.id)} aria-current={v.classId === c.id ? "page" : undefined}>{c.name}</Link>)}
      </nav>
      {v.terms.length > 1 && (
        <form className="mt-3 flex items-center gap-2 text-sm">
          {v.classId ? <input type="hidden" name="classId" value={v.classId} /> : <input type="hidden" name="grade" value={v.grade ?? ""} />}{subject === "LANGUAGE" && <input type="hidden" name="subject" value="language" />}
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
                  <td className="font-semibold tabular-nums">{r.rit}{r.rapidGuess !== null && r.rapidGuess >= 15 && <span className={`ms-1 rounded px-1 text-xs font-bold ${r.rapidGuess >= 30 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`} title={`Rapid guessing ${r.rapidGuess}% — ${r.rapidGuess >= 30 ? "NWEA suggests a retest: the score may be lower than the student’s real level" : "interpret with care"}`}>{r.rapidGuess >= 30 ? "⚠️" : "⚑"} {r.rapidGuess}%</span>}</td>
                  <td className={`tabular-nums ${r.national && r.national.diff >= 0 ? "text-emerald-700" : "text-red-700"}`}>{r.national ? signed(r.national.diff) : "—"}</td>
                  <td className="tabular-nums">{r.national?.percentile != null ? `${r.national.estimated ? "≈" : ""}${r.national.percentile}` : "—"}</td>
                  <td>{r.national?.band && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_STYLE[r.national.band]}`}>{r.national.band}</span>}</td>
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
              <button className="rounded-xl bg-amber-100 px-4 py-2 font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200">🎯 Set student levels from the class average (Exceeding / Meeting / Approaching)</button>
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
          <h2 className="text-lg font-bold text-brand-navy">National Averages (NWEA Norms) · Admins</h2>
          <p className="text-sm text-slate-600">Mean RIT and standard deviation, Reading and Language Usage, for every grade with students. Update them when NWEA publishes new norms, or fill in a grade that's missing one (e.g. a grade above 6) — leave a box empty to leave that grade/season/subject with no national comparison rather than guess at a number.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="text-sm">
              <thead><tr className="text-slate-500"><th className="pe-4 text-left">Grade</th>{SEASONS.flatMap((se) => [
                <th key={`${se}-r`} className="whitespace-nowrap px-2 text-left">{se.charAt(0) + se.slice(1).toLowerCase()} 📖 Reading (mean / SD)</th>,
                <th key={`${se}-l`} className="whitespace-nowrap px-2 text-left">{se.charAt(0) + se.slice(1).toLowerCase()} ✍️ Language (mean / SD)</th>,
              ])}</tr></thead>
              <tbody>{norms.map(({ g, s }) => (
                <tr key={g}><td className="pe-4 font-semibold">{g}</td>{s.flatMap(({ se, reading, language }) => [
                  <td key={`${se}-r`} className="whitespace-nowrap px-2 py-1"><input name={`mean:READING:${g}:${se}`} type="number" step="0.1" defaultValue={reading?.mean} aria-label={`Grade ${g} ${se} Reading mean`} className="w-16 rounded-md border border-slate-300 px-1 py-1" /> / <input name={`sd:READING:${g}:${se}`} type="number" step="0.1" defaultValue={reading?.sd} aria-label={`Grade ${g} ${se} Reading SD`} className="w-14 rounded-md border border-slate-300 px-1 py-1" /></td>,
                  <td key={`${se}-l`} className="whitespace-nowrap px-2 py-1"><input name={`mean:LANGUAGE:${g}:${se}`} type="number" step="0.1" defaultValue={language?.mean} aria-label={`Grade ${g} ${se} Language mean`} className="w-16 rounded-md border border-slate-300 px-1 py-1" /> / <input name={`sd:LANGUAGE:${g}:${se}`} type="number" step="0.1" defaultValue={language?.sd} aria-label={`Grade ${g} ${se} Language SD`} className="w-14 rounded-md border border-slate-300 px-1 py-1" /></td>,
                ])}</tr>
              ))}</tbody>
            </table>
          </div>
          <label className="mt-3 flex flex-col text-sm">Source<input name="source" required defaultValue={norms[0]?.s[0]?.reading?.source ?? norms[0]?.s[0]?.language?.source ?? ""} className={`${box} max-w-xl`} /></label>
          <button className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">Save national averages</button>
        </form>
      )}
      {/* ✨ feature (requested, Oct 2026): a grade with no class yet (e.g. a grade the school is about to open) never
       * appears via v.grades, so there's no row to fill in for it above. This separate form (a different server
       * action, so it can't be nested inside the "Save national averages" form) adds an empty row for any grade
       * 1–13; it's remembered via `extraGrades` in the URL only, not saved anywhere — once real numbers are entered
       * and saved for that grade, nationalNorm() finds them on its own regardless of whether it's still listed here. */}
      {norms && (
        <form action={addNormGradeAction} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <input type="hidden" name="extraGrades" value={extraGrades.join(",")} />
          <label className="flex flex-col text-sm">
            Add a grade (no class yet)
            <input type="number" name="grade" min={1} max={13} placeholder="e.g. 7" className={`${box} w-32`} />
          </label>
          <button className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">➕ Add a grade</button>
        </form>
      )}
    </AppShell>
  );
}
