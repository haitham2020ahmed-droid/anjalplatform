import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { BANDS, mapEntryGrid, type EntrySubject } from "@/server/map/map-entry";
import type { Season } from "@/server/map/rit";
import { saveMapEntryAction } from "./actions";

export const metadata = { title: "Enter MAP scores" };

/** ✏️ MAP scores for a whole class in one table (Reading or Language Usage; Fall, Winter or Spring). */
export default async function MapEntryPage({ searchParams }: { searchParams: Promise<{ classId?: string; subject?: string; season?: string; year?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const subject: EntrySubject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const season = (["FALL", "WINTER", "SPRING"].includes(String(sp.season)) ? String(sp.season) : "FALL") as Season;
  const now = new Date();
  const schoolYearStart = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const year = Number(sp.year) || (season === "FALL" ? schoolYearStart : schoolYearStart + 1);
  const g = classId ? await mapEntryGrid(repo, actor, { classId, subject, season, year }) : null;
  const link = (p: Record<string, string | number>) => `/teacher/map-entry?${new URLSearchParams(Object.entries({ classId, subject, season, year, ...p }).map(([k, v]) => [k, String(v)]))}`;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const cell = "w-20 rounded-md border border-slate-300 px-2 py-1 text-center tabular-nums";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/map-rit", label: "MAP" }} icon="✏️" title="Enter MAP scores"
        subtitle={<>Type the scores from the NWEA report for the whole class, then press <b>Save</b>. Students are matched by their Student ID. Goal areas: write the RIT or the word on the report (Low, LoAvg, Avg, HiAvg, High). Prefer a file? <Link href="/teacher/map-rit" className="font-semibold text-brand-teal underline">Upload the template or the NWEA export</Link>.</>} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!classes.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">You do not teach any class yet.</p> : (
        <>
          <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={link({ classId: String(c.id) })} aria-current={c.id === classId ? "page" : undefined} className={chip(c.id === classId)}>{String(c.name)}</Link>)}</nav>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={link({ subject: x })} className={chip(x === subject)}>{x === "READING" ? "📖 Reading" : "✏️ Language Usage"}</Link>)}
            <span className="mx-2 h-6 w-px bg-slate-300" aria-hidden="true" />
            {(["FALL", "WINTER", "SPRING"] as const).map((x) => <Link key={x} href={link({ season: x, year: x === "FALL" ? schoolYearStart : schoolYearStart + 1 })} className={chip(x === season)}>{x === "FALL" ? "🍂 Fall" : x === "WINTER" ? "❄️ Winter" : "🌱 Spring"}</Link>)}
          </div>
          {g && (
            <form action={saveMapEntryAction} className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <input type="hidden" name="classId" value={classId} /><input type="hidden" name="subject" value={subject} /><input type="hidden" name="season" value={season} />
              {g.goals.map((x) => <input key={x.code} type="hidden" name="goal" value={x.code} />)}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-xl font-bold text-brand-navy">{g.className} · {subject === "READING" ? "Reading" : "Language Usage"} · <label className="inline-flex items-center gap-1">{season === "FALL" ? "Fall" : season === "WINTER" ? "Winter" : "Spring"} <input name="year" type="number" min={2020} max={2100} defaultValue={year} aria-label="Year of the test" className="w-24 rounded-md border border-slate-300 px-2 py-1 text-base" /></label></h2>
                <p className="text-sm text-slate-500">{g.rows.length} students · Empty rows are skipped · A saved row replaces that student’s {g.term} scores</p>
              </div>
              {g.missingNumbers > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠️ {g.missingNumbers} student(s) have no Student ID: add it in Users before entering their scores.</p>}
              <datalist id="bands">{BANDS.map((b) => <option key={b} value={b} />)}</datalist>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead><tr className="border-b text-xs text-slate-500">
                    <th className="sticky left-0 bg-white py-2 pe-3">Student</th><th className="px-1">ID</th><th className="px-1">RIT</th><th className="px-1">Percentile</th>
                    {season === "FALL" && <th className="px-1">Spring projection</th>}{subject === "READING" && <th className="px-1">Lexile</th>}
                    {g.goals.map((x) => <th key={x.code} className="px-1">{x.header}</th>)}
                  </tr></thead>
                  <tbody>{g.rows.map((r) => (
                    <tr key={r.studentId} className="border-b last:border-0">
                      <td className="sticky left-0 bg-white py-1.5 pe-3 font-medium"><input type="hidden" name="student" value={r.studentId} />{r.name}</td>
                      <td className="px-1 text-xs text-slate-500">{r.number || "—"}</td>
                      <td className="px-1"><input name={`rit:${r.studentId}`} defaultValue={r.rit} inputMode="numeric" aria-label={`RIT of ${r.name}`} className={cell} /></td>
                      <td className="px-1"><input name={`pct:${r.studentId}`} defaultValue={r.percentile} inputMode="numeric" aria-label={`Percentile of ${r.name}`} className={cell} /></td>
                      {season === "FALL" && <td className="px-1"><input name={`proj:${r.studentId}`} defaultValue={r.projection} inputMode="numeric" aria-label={`Spring projection of ${r.name}`} className={cell} /></td>}
                      {subject === "READING" && <td className="px-1"><input name={`lex:${r.studentId}`} defaultValue={r.lexile} aria-label={`Lexile of ${r.name}`} className={cell} /></td>}
                      {g.goals.map((x) => <td key={x.code} className="px-1"><input name={`g:${x.code}:${r.studentId}`} defaultValue={r.goals[x.code] ?? ""} list="bands" aria-label={`${x.header} of ${r.name}`} className={cell} /></td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <button className="mt-4 rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white hover:bg-brand-purple">💾 Save</button>
            </form>
          )}
        </>
      )}
    </AppShell>
  );
}
