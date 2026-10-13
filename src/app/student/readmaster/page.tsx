import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, HOME_BY_ROLE, repo, requireActor } from "@/server/auth/next";
import { readMasterHome, type RmCard } from "@/server/readmaster/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import { readMasterMyReport } from "@/server/student/reading-report";
import { ProgramTabs } from "@/components/student/program-tabs";
import { autoLoadReadMasterLibrary } from "@/server/readmaster/library";

export const metadata = { title: "ReadMaster" };

/**
 * ⭐ ReadMaster — ONE page for students, teachers and admin (the same view): a tab per grade with published articles
 * (new grades appear by themselves; the student's own grade opens first), the articles grouped by Unit, each card with
 * the skill, the reading time and ✓ + score when the student already read it. Every article is open to every student
 * (no assignment). Admins get a small "Manage" link to the article editor.
 */
export default async function ReadMasterPage({ searchParams }: { searchParams: Promise<{ grade?: string; tab?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT", "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  // 📚 a school with no ReadMaster article gets the Grades 4–5 library once (in the background)
  const lib = await autoLoadReadMasterLibrary(repo, actor.schoolId).catch(() => null);
  const v = await readMasterHome(repo, actor, { grade: sp.grade ? Number(sp.grade) : null });
  const { t } = await getT();
  const student = v.viewer === "STUDENT";
  // 📊 "My report" tab (students): my own ReadMaster numbers only
  const reportTab = student && sp.tab === "report";
  const rep = reportTab && actor.studentId ? await readMasterMyReport(repo, actor.studentId) : null;
  const tab = (on: boolean) => `inline-flex min-h-11 items-center rounded-xl px-5 text-base font-semibold transition ${on ? "bg-brand-navy text-white shadow-sm" : "bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  const Card = ({ a }: { a: RmCard }) => (
    <li>
      <Link href={`/student/readmaster/${a.id}`} prefetch={false} className="lift flex h-full flex-col rounded-3xl bg-gradient-to-b from-amber-50/70 to-white p-5 shadow-card ring-1 ring-amber-100 hover:ring-brand-teal">
        <span dir="ltr" className="text-lg font-bold leading-snug text-brand-navy">{a.title}</span>
        {(a.topic || a.skill) && <span dir="ltr" className="mt-1 text-sm text-slate-600">{[a.topic, a.skill].filter(Boolean).join(" · ")}</span>}
        <span className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700"><span aria-hidden="true">⏱</span>{t("{n} min read", { n: a.minutes })}</span>
          {student && a.done && !a.done.practice && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-200"><span aria-hidden="true">✓</span>{a.done.correct}/{a.done.total} · {a.done.pct}%</span>}
          {student && a.done && a.done.practice && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-200"><span aria-hidden="true">✓</span>{t("Practice")} · {a.done.correct}/{a.done.total}</span>}
        </span>
      </Link>
    </li>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: HOME_BY_ROLE[actor.role] ?? "/", label: "Home" }} icon="⭐" title="ReadMaster"
        subtitle={t(student ? "Every article is open to you. It opens at your reading level; you can switch to a lighter or a challenge text." : "Students see this same page. Every published article is open to every student: no assignment needed.")}>
        {v.canManage && <Link href={`/admin/readmaster${v.grade ? `?grade=${v.grade}` : ""}`} prefetch={false} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"><span aria-hidden="true">🛠</span>{t("Manage")}</Link>}
      </PageHeader>
      {student && <ProgramTabs tabs={[{ href: "/student/readmaster", label: "Articles", icon: "📚", on: !reportTab }, { href: "/student/readmaster?tab=report", label: "My report", icon: "📊", on: reportTab }]} />}
      {rep ? (
        <section aria-label={t("My report")} data-testid="rm-my-report" className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([["Articles read", String(rep.articles)], ["Average score", rep.avgPct === null ? "—" : `${rep.avgPct}%`], ["Lexile", rep.lexileNow === null ? (v.lexile !== null ? `${v.lexile}L` : "—") : `${rep.lexileNow}L`], ["Growth", rep.growth === null ? "—" : `${rep.growth >= 0 ? "+" : ""}${rep.growth}L`]] as const).map(([k, val], i) => (
              <div key={k} className={`rounded-2xl p-4 shadow-card ring-1 ${["bg-amber-50 ring-amber-200", "bg-sky-50 ring-sky-200", "bg-emerald-50 ring-emerald-200", "bg-violet-50 ring-violet-200"][i]}`}><dt className="text-sm font-semibold text-slate-600">{k === "Lexile" ? "My reading Lexile" : t(k)}</dt><dd dir="ltr" className="text-3xl font-bold tabular-nums text-brand-navy">{val}</dd></div>
            ))}
          </dl>
          {rep.recent.length ? (
            <div className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80">
              <h2 className="text-lg font-semibold text-brand-navy">{t("My last reads")}</h2>
              <ul className="mt-2 divide-y divide-slate-100">{rep.recent.map((r, i) => (
                <li key={r.articleId + i} className="flex flex-wrap items-center justify-between gap-2 py-2"><Link prefetch={false} href={`/student/readmaster/${r.articleId}`} dir="ltr" className="inline-flex min-h-11 items-center font-semibold text-brand-navy hover:underline">{r.title}</Link><span className="text-sm text-slate-600"><span className="font-semibold tabular-nums text-brand-navy">{r.pct}%</span>{r.practice ? ` · ${t("Practice")}` : ""} · <span dir="ltr">{r.date}</span></span></li>
              ))}</ul>
            </div>
          ) : <EmptyState compact icon="📚" title="Nothing here yet" text="Read an article and your report starts here." />}
        </section>
      ) : (<>
      {student && v.lexile !== null && (
        <section className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-3xl bg-gradient-to-r from-amber-50 to-white px-5 py-4 shadow-card ring-1 ring-amber-200">
          <p><span dir="ltr" className="block text-sm text-slate-600">My reading Lexile</span><span dir="ltr" className="text-3xl font-bold text-brand-navy">{v.lexile}L</span></p>
          <p className="max-w-xl text-slate-700">{t("Reading at your level or higher moves your level: 75% or more moves it up. A lower level is practice.")}</p>
        </section>
      )}
      {!v.grades.length ? (lib?.status === "RUNNING" ? <EmptyState icon="⏳" title="The ReadMaster library is being added." text="Refresh the page in a minute." /> : <EmptyState icon="📚" title="No articles yet." />) : (
        <>
          <nav aria-label={t("Grades")} className="mb-5 flex flex-wrap gap-2">
            {v.grades.map((g) => <Link key={g} href={`/student/readmaster?grade=${g}`} prefetch={false} aria-current={g === v.grade ? "page" : undefined} className={tab(g === v.grade)}>{t("Grade {n}", { n: g })}{g === v.myGrade && student ? <span aria-hidden="true" className="ms-1.5">★</span> : null}</Link>)}
          </nav>
          <div className="space-y-7">
            {v.units.map((u) => (
              <section key={String(u.unit)} aria-labelledby={`unit-${u.unit ?? "other"}`}>
                <h2 id={`unit-${u.unit ?? "other"}`} className="mb-3 flex items-center gap-2 text-xl font-semibold text-brand-navy">
                  <span aria-hidden="true">📘</span>{u.unit === null ? t("Other") : u.title === `Unit ${u.unit}` ? t("Unit {n}", { n: u.unit }) : <bdi>{u.title}</bdi>}
                  <span className="text-sm font-normal text-slate-500">· {u.articles.length === 1 ? t("1 article") : t("{n} articles", { n: u.articles.length })}</span>
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{u.articles.map((a) => <Card key={a.id} a={a} />)}</ul>
              </section>
            ))}
          </div>
        </>
      )}
      </>)}
    </AppShell>
  );
}
