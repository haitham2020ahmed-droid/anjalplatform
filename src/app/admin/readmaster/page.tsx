import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { gradeSkills, listArticles, LEVEL_NAMES } from "@/server/readmaster/service";
import { LEXILE_SOURCE, lexileBands } from "@/server/curriculum-map/lexile";
import { createArticleAction, importReadMasterAction } from "./actions";

/** ⭐ ReadMaster (staff): leveled articles — the same text in Below / On / Above versions. */
export default async function ReadMasterAdmin({ searchParams }: { searchParams: Promise<{ grade?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const grade = [4, 5, 6].includes(Number(sp.grade)) ? Number(sp.grade) : 4;
  const [arts, skills, bands] = await Promise.all([listArticles(repo, actor, grade), gradeSkills(repo, actor.schoolId!, grade), lexileBands(repo, actor.schoolId ?? null)]);
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={actor.role === "TEACHER" ? "/teacher" : "/admin"} className="text-brand-teal hover:underline">← Back</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy"><span aria-hidden="true">⭐</span> ReadMaster</h1>
      <p className="mt-1 max-w-3xl text-slate-600">One article, three reading levels: the same topic and skill written for Below, On and Above Level (different words, length and Lexile). Each student reads the version that matches their reading Lexile, which moves after every article (75%+ → +30L, under 50% → −30L).</p>
      {sp.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Grade" className="mt-4 flex gap-2">{[4, 5, 6].map((g) => <Link key={g} href={`/admin/readmaster?grade=${g}`} aria-current={g === grade ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${g === grade ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>Grade {g}</Link>)}</nav>
      <p className="mt-2 text-sm text-slate-600">Grade {grade} levels by Lexile: Below &lt; {bands[grade].onMin}L · On {bands[grade].onMin}–{bands[grade].onMax}L · Above &gt; {bands[grade].onMax}L <span className="text-slate-400">({LEXILE_SOURCE})</span></p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <form action={importReadMasterAction} className="rounded-2xl bg-amber-50/60 p-5 ring-1 ring-amber-200">
          <h2 className="font-bold text-brand-navy">📥 Import articles, versions and questions</h2>
          <p className="text-sm text-slate-600">The template has a complete example (Solar System in three levels). One row per question; the first row of each level carries the Passage and its Lexile.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <a href="/api/readmaster-template" className="rounded-lg px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-white">⬇ Excel template</a>
            <a href="/api/readmaster-template?format=csv" className="rounded-lg px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-white">⬇ CSV template</a>
            <input type="file" name="file" accept=".csv,.xlsx" required className="text-sm" />
            <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Import</button>
          </div>
        </form>
        <form action={createArticleAction} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-bold text-brand-navy">➕ New article (one by one)</h2>
          <input type="hidden" name="grade" value={grade} />
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <label className="flex flex-col">Title<input name="title" required maxLength={255} placeholder="Our Solar System" className={box} /></label>
            <label className="flex flex-col">Topic (optional)<input name="topic" maxLength={191} placeholder="Science · Space" className={box} /></label>
            <label className="flex flex-col">Skill (Grade {grade})<select name="skillId" className={box}><option value="">— none —</option>{skills.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
            <label className="flex flex-col">Code (optional)<input name="code" maxLength={60} placeholder="SOLAR-01" className={box} /></label>
          </div>
          <button className="mt-3 rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Create</button>
        </form>
      </div>
      <h2 className="mt-8 text-xl font-bold text-brand-navy">Grade {grade} articles</h2>
      {arts.length === 0 ? <p className="mt-2 text-slate-600">No articles yet.</p> : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {arts.map((a) => (
            <li key={a.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div><Link href={`/admin/readmaster/${a.id}`} className="text-lg font-bold text-brand-navy hover:underline">{a.title}</Link><p className="text-sm text-slate-600">{a.code}{a.skill ? ` · ${a.skill}` : ""}{a.topic ? ` · ${a.topic}` : ""}</p></div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.status === "PUBLISHED" ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{a.status === "PUBLISHED" ? "Published" : "Draft"}</span>
              </div>
              <p className="mt-2 flex flex-wrap gap-2 text-xs">{(["BELOW", "ON", "ABOVE"] as const).map((l) => { const v = a.versions.find((x) => x.level === l); return <span key={l} className={`rounded px-2 py-0.5 ${v ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200" : "bg-red-50 text-red-700"}`}>{LEVEL_NAMES[l]}: {v ? `${v.lexile}L · ${v.questions} Q` : "missing"}</span>; })}</p>
              <p className="mt-1 text-xs text-slate-500">{a.attempts} student result(s)</p>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
