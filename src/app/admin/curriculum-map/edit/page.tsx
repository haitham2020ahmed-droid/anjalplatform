import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { curriculumMapView, LEVEL_TARGET, type MapViewNode } from "@/server/curriculum-map/view";
import { can } from "@/server/auth/rbac";
import { respondCodes } from "@/server/curriculum-map/respond";
import { fixName } from "@/server/curriculum-map/lesson-details";

export const metadata = { title: "Curriculum Map" };

/**
 * Edit (admin): the full Curriculum Map tree (Grade → Unit → Text Set / Selection → Category → Level) with the
 * question counts of each place and the admin tools (Import, Coverage, Respond to Reading, Bridge, Add questions).
 * Teachers use the simple Curriculum Map page (/admin/curriculum-map).
 */
export default async function CurriculumMapEditPage({ searchParams }: { searchParams: Promise<{ grade?: string; unit?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const v = await curriculumMapView(repo, actor, Number(sp.grade) || undefined);
  const respond = await respondCodes(repo, actor.schoolId!);
  const units = v.book?.children ?? [];
  const unitIx = Math.min(Math.max(0, (Number(sp.unit) || 1) - 1), Math.max(0, units.length - 1));
  const canAdd = can(actor, "questions:edit");
  const badge = (n: MapViewNode) => n.acceptsQuestions && (
    <span className="ms-2 inline-flex flex-wrap items-center gap-1.5 text-xs">
      <code className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-800 ring-1 ring-emerald-300" title="Accepts questions">{n.code}</code>
      <Link prefetch={false} href={`/admin/questions?status=PUBLISHED&map=${n.code}`}
        className={`rounded-full px-2 py-0.5 font-bold ring-1 ${n.level ? (n.counts.adaptive >= LEVEL_TARGET ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : n.counts.adaptive > 0 ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-red-50 text-red-800 ring-red-300") : "text-brand-navy ring-slate-300"} hover:ring-brand-teal`}
        title="Adaptive questions: published and marked automatically">{n.counts.adaptive} adaptive</Link>
      {n.counts.teacher > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-800 ring-1 ring-violet-200">{n.counts.teacher} teacher-scored</span>}
      {n.counts.waiting > 0 && <Link prefetch={false} href={`/admin/questions?status=DRAFT&map=${n.code}`} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">{n.counts.waiting} waiting</Link>}
      {canAdd && <Link prefetch={false} href={`/admin/curriculum-map/place/${n.code}`} className="rounded-full bg-brand-navy px-2 py-0.5 font-semibold text-white hover:bg-brand-purple">Add questions</Link>}
    </span>
  );
  const catColor: Record<string, string> = { CONCEPT_VOCABULARY: "border-sky-300 bg-sky-50/50", ANALYZE_CRAFT_AND_STRUCTURE: "border-amber-300 bg-amber-50/50", RESPOND_TO_READING: "border-violet-300 bg-violet-50/50", REVIEW: "border-emerald-300 bg-emerald-50/50" };
  const link = "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/admin/curriculum-map?grade=${v.level ?? ""}`, label: "Back" }} title="Edit (admin)" subtitle="Questions are placed only on the places with an ID; they are also in the Question Bank.">
        <Link prefetch={false} href="/admin/questions/import?to=curriculum" className={link}>Import</Link>
        <Link href={`/admin/question-intelligence?tab=coverage&grade=${v.level ?? 4}`} className={link}>Coverage</Link>
        <Link href="/admin/curriculum-map/respond" className={link}>Respond to Reading</Link>
        <Link href={`/admin/curriculum-map/bridge?grade=${v.level ?? 5}`} className={link}>Bridge</Link>
      </PageHeader>
      {v.grades.length === 0 ? <p className="mt-6 rounded-xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">The Curriculum Map has not been created yet.</p> : (
        <>
          <nav aria-label="Grades" className="flex flex-wrap gap-2">
            {v.grades.map((g) => (
              <Link key={g.level} href={`/admin/curriculum-map/edit?grade=${g.level}`} aria-current={g.level === v.level ? "page" : undefined}
                className={`min-h-11 rounded-full px-5 py-2 font-semibold ${g.level === v.level ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>Grade {g.level}</Link>
            ))}
          </nav>
          {v.book && (<nav aria-label="Units" className="mt-2 flex flex-wrap gap-2">
            {units.map((u, i) => (
              <Link key={u.id} href={`/admin/curriculum-map/edit?grade=${v.level}&unit=${i + 1}`} prefetch={false} aria-current={i === unitIx ? "page" : undefined}
                className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${i === unitIx ? "bg-brand-teal text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}>{u.title.split(":")[0]}</Link>
            ))}
          </nav>)}
          {v.book && (
            <section className="mt-5">
              <p className="text-lg font-bold text-brand-navy">Grade {v.level} <span className="text-sm font-normal text-slate-500">· {v.attachmentNodes} places · {v.questions} adaptive questions</span></p>
              {v.coverage.some((c) => c.places) && (
                <div className="mt-2 space-y-1.5 text-sm" aria-label="Adaptive questions per level">
                  {[...new Set(v.coverage.map((c) => c.category))].map((cat) => (
                    <div key={cat} className="flex flex-wrap items-center gap-2">
                      <span className="w-56 text-slate-700">{cat}</span>
                      {v.coverage.filter((c) => c.category === cat).map((c) => (
                        <span key={c.level} className={`rounded-full px-2.5 py-0.5 font-bold ring-1 ${c.atTarget === c.places ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : c.atTarget ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-red-50 text-red-800 ring-red-300"}`}>
                          {c.level === "BELOW" ? "Below" : c.level === "ON" ? "On" : "Above"} {c.atTarget}/{c.places}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {units.slice(unitIx, unitIx + 1).map((u) => (
                <div key={u.id} className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200">
                  <h2 className="px-5 py-3 text-lg font-bold text-brand-navy">{u.title} <span className="text-sm font-normal text-slate-500">· {u.children.length} {u.children[0]?.kind === "SELECTION" ? "selections" : "text sets"}</span></h2>
                  <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
                    {u.children.map((s) => (
                      <article key={s.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold text-slate-900">{fixName(s.heading ?? s.title)}</h3>{s.genre && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{s.genre}</span>}</div>
                        {s.sharedRead && <p className="mt-0.5 text-sm text-slate-500">{s.sharedRead}</p>}
                        <ul className="mt-3 space-y-2">
                          {s.children.map((c) => (
                            <li key={c.id} className={`rounded-lg border-s-4 p-3 ${catColor[c.categoryType ?? ""] ?? ""}`}>
                              <p className="font-semibold text-slate-900">{c.title}{c.skills && <span className="font-normal"> ({c.skills})</span>}{badge(c)}</p>
                              {c.children.length > 0 && (
                                <ul className="mt-2 flex flex-wrap gap-2">
                                  {c.children.map((l) => <li key={l.id} className="rounded-lg bg-white px-2.5 py-1 text-sm ring-1 ring-slate-200">
                                    {c.categoryType === "RESPOND_TO_READING"
                                      ? <Link prefetch={false} href={`/admin/curriculum-map/respond/${c.code}?level=${l.level}`} className="font-semibold text-violet-900 hover:underline" title="Open this level's activity page">{respond.has(l.code) ? "" : "+ "}{l.title}</Link>
                                      : l.title}
                                    {badge(l)}</li>)}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
