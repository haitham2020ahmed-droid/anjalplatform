import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CcssNote } from "@/components/ccss-note";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { gradeSkills, gradeStandards, listArticles, LEVEL_NAMES } from "@/server/readmaster/service";
import { lexileBands } from "@/server/curriculum-map/lexile";
import { createArticleAction, importReadMasterAction } from "./actions";

export const metadata = { title: "ReadMaster" };

const LV = {
  BELOW: { icon: "🟠", ring: "ring-orange-200", head: "bg-orange-50 text-orange-900", chip: "bg-orange-50 text-orange-900 ring-orange-200" },
  ON: { icon: "🔵", ring: "ring-sky-200", head: "bg-sky-50 text-sky-900", chip: "bg-sky-50 text-sky-900 ring-sky-200" },
  ABOVE: { icon: "🟢", ring: "ring-emerald-200", head: "bg-emerald-50 text-emerald-900", chip: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
} as const;

/** ⭐ ReadMaster (staff): create an article with its three versions in one form, import many, see all. */
export default async function ReadMasterAdmin({ searchParams }: { searchParams: Promise<{ grade?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const grade = [4, 5, 6].includes(Number(sp.grade)) ? Number(sp.grade) : 4;
  const [arts, skills, bands, standards] = await Promise.all([listArticles(repo, actor, grade), gradeSkills(repo, actor.schoolId!, grade), lexileBands(repo, actor.schoolId ?? null), gradeStandards(repo, grade)]);
  const b = bands[grade];
  const range = { BELOW: `< ${b.onMin}L`, ON: `${b.onMin}–${b.onMax}L`, ABOVE: `> ${b.onMax}L` } as const;
  const suggested = { BELOW: b.onMin - 100, ON: Math.round((b.onMin + b.onMax) / 2), ABOVE: b.onMax + 80 } as const;
  const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2";
  const label = "flex flex-col gap-1 text-sm font-semibold text-slate-700";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="⭐" title="ReadMaster"
        subtitle="One article, three reading levels: the same topic and skill written for Below, On and Above Level. Each student reads the version of their Lexile, which moves after every article (75%+ → +30L, under 50% → −30L).">
        <nav aria-label="Grade" className="flex gap-2">{[4, 5, 6].map((g) => <Link key={g} href={`/admin/readmaster?grade=${g}`} aria-current={g === grade ? "page" : undefined} className={`rounded-full px-5 py-2 text-sm font-bold transition ${g === grade ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}>Grade {g}</Link>)}</nav>
      </PageHeader>
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-slate-600">Grade {grade} Lexile levels:</span>
        {(["BELOW", "ON", "ABOVE"] as const).map((l) => <span key={l} className={`rounded-full px-3 py-1 font-semibold ring-1 ${LV[l].chip}`}>{LV[l].icon} {LEVEL_NAMES[l]} {range[l]}</span>)}
      </div>

      {/* one big form: the article + its three versions */}
      <Section title="New article" icon="➕" hint="Write the article once per level. You can leave a level empty and add it later.">
        <form action={createArticleAction} className="space-y-5">
          <input type="hidden" name="grade" value={grade} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className={label}>Title<input name="title" required maxLength={255} placeholder="Our Solar System" className={field} /></label>
            <label className={label}>Topic <span className="font-normal text-slate-400">(optional)</span><input name="topic" maxLength={191} placeholder="Science · Space" className={field} /></label>
            <label className={`${label} md:col-span-2`}>Common Core standard (Grade {grade})
              <select name="standard" className={field}><option value="">— choose a standard —</option>
                {standards.map((g) => <optgroup key={g.strand} label={g.strand}>{g.items.map((x) => <option key={x.code} value={x.short}>{x.short} — {x.description.length > 100 ? `${x.description.slice(0, 100)}…` : x.description}</option>)}</optgroup>)}
              </select>
            </label>
            <label className={label}>Skill name <span className="font-normal text-slate-400">(optional)</span><input name="skillName" maxLength={191} placeholder="e.g. Main Idea and Key Details" className={field} /></label>
            <div className="grid grid-cols-2 gap-4">
              <label className={label}>Platform skill <span className="font-normal text-slate-400">(optional)</span><select name="skillId" className={field}><option value="">— none —</option>{skills.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
              <label className={label}>Code <span className="font-normal text-slate-400">(optional)</span><input name="code" maxLength={60} placeholder="SOLAR-01" className={field} /></label>
            </div>
          </div>
          <CcssNote />
          <div className="grid gap-4 lg:grid-cols-3">
            {(["BELOW", "ON", "ABOVE"] as const).map((l) => (
              <fieldset key={l} className={`overflow-hidden rounded-2xl bg-white ring-2 ${LV[l].ring}`}>
                <legend className="sr-only">{LEVEL_NAMES[l]} version</legend>
                <div className={`flex items-center justify-between gap-2 px-4 py-3 ${LV[l].head}`}>
                  <span className="text-lg font-bold">{LV[l].icon} {LEVEL_NAMES[l]}</span>
                  <label className="flex items-center gap-1 text-sm font-semibold">Lexile<input type="number" name={`lexile:${l}`} min={0} max={2000} defaultValue={suggested[l]} className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1" />L</label>
                </div>
                <div className="p-3">
                  <textarea name={`body:${l}`} rows={14} placeholder={`The article written for ${LEVEL_NAMES[l]} readers (${range[l]})…`} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 leading-relaxed" />
                  <p className="mt-1 text-xs text-slate-500">{l === "BELOW" ? "Short sentences, common words." : l === "ON" ? "Grade-level vocabulary and length." : "Richer vocabulary, longer sentences."}</p>
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex justify-end"><button className="rounded-xl bg-brand-navy px-8 py-3 text-lg font-bold text-white shadow hover:bg-brand-purple">Create article</button></div>
        </form>
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section title="Import many" icon="📥" tone="amber" className="lg:col-span-1"
          hint="One row per question; the first row of each level carries the Passage and its Lexile. The template has a complete example.">
          <form action={importReadMasterAction} className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <a href="/api/readmaster-template" className="rounded-xl bg-white px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ Excel template</a>
              <a href="/api/readmaster-template?format=csv" className="rounded-xl bg-white px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ CSV</a>
            </div>
            <input type="file" name="file" accept=".csv,.xlsx" required className="block w-full text-sm" />
            <button className="w-full rounded-xl bg-brand-navy px-4 py-2.5 font-semibold text-white hover:bg-brand-purple">Import</button>
          </form>
        </Section>
        <Section title={`Grade ${grade} articles (${arts.length})`} icon="📚" className="lg:col-span-2">
          {arts.length === 0 ? <p className="text-slate-600">No articles yet. Create one above or import the template.</p> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {arts.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/readmaster/${a.id}`} className="lift block rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-lg font-bold text-brand-navy">{a.title}</p><p className="truncate text-xs text-slate-500">{[a.code, a.standard, a.skill !== a.standard ? a.skill : null, a.topic].filter(Boolean).join(" · ")}</p></div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${a.status === "PUBLISHED" ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{a.status === "PUBLISHED" ? "Published" : "Draft"}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-xs">
                      {(["BELOW", "ON", "ABOVE"] as const).map((l) => { const v = a.versions.find((x) => x.level === l); return <span key={l} className={`rounded-lg px-1 py-1.5 font-semibold ring-1 ${v ? LV[l].chip : "bg-slate-50 text-slate-400 ring-slate-200"}`}>{LV[l].icon} {v ? `${v.lexile}L · ${v.questions} Q` : "missing"}</span>; })}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{a.attempts} student result(s)</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
