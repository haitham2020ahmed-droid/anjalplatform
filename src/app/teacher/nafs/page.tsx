import Link from "next/link";
import { nafsDbGate } from "@/components/db-update-needed";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { getT } from "@/i18n/server";
import { AboutTab } from "@/components/nafs/about-tab";
import { SkillsTab } from "@/components/nafs/skills-tab";
import { BankTab } from "@/components/nafs/bank-tab";
import { MarkingTab } from "@/components/nafs/marking-tab";
import { AdaptiveTab } from "@/components/nafs/adaptive-tab";
import { NafsTestTab } from "@/components/nafs/nafs-test-tab";
import { BookletsTab } from "@/components/nafs/booklets-tab";
import { OverallTab } from "@/components/nafs/overall-tab";
import { PlanTab } from "@/components/nafs/plan-tab";
import { ensureNafsBooklets } from "@/server/nafs/booklets";
import { ensureNafsPracticeSets } from "@/server/nafs/practice-sets";
import { CENTER_TABS, centerRedirect } from "@/server/nafs/center";

export const metadata = { title: "NAFS" };

/** Pages reached from inside the center (not tabs): About NAFS (the link at the top) and the standards / skills page
 * (inside Question bank). Old tab keys and old report links are redirected (centerRedirect): every capability lives in
 * ONE place. */
const EXTRA = ["about", "skills"] as const;
type Tab = (typeof CENTER_TABS)[number]["key"] | (typeof EXTRA)[number];

/**
 * 🇸🇦 The NAFS CENTER (its own menu entry; Grade 6 teachers and admins only) — independent of the platform's own
 * assessment: everything about NAFS lives here, each capability ONCE, each tool with its own report inside (owner r69):
 * 1. Adaptive (Practice · Report) · 2. NAFS test (Create · Report) · 3. Ministry booklets (open, assign one or several,
 * Report per booklet) · 4. Reports (the overall picture of everything; the old Dashboard merged in) · 5. Suggested plan
 * (from the reports, one-click assign) · Question bank (+ the 13 standards and NAFS skills) · Marking (written answers +
 * bubble sheets + typed answers); a small "About NAFS" link at the top (the Ministry guide, the 13 standards, the
 * booklet model, sources). Questions are organised by the 13 Ministry standards and the NAFS skills, each with a
 * difficulty — never by grade. The model booklets and the practice sets are loaded IN THE BACKGROUND when the center
 * opens (never awaited). The NAFS plan stays in Plans (plans?tab=nafs) and is opened from the NAFS test report
 * ("Make a NAFS plan for this group").
 */
export default async function NafsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher?msg=" + encodeURIComponent("NAFS is for Grade 6 teachers only."));
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  // old links: a tab that moved inside another one
  // old links: a tab that moved inside another one (home, dashboard, practice, tests, sheets, old report views)
  const moved = centerRedirect(sp);
  if (moved) redirect(moved);
  const tab: Tab = ([...CENTER_TABS.map((x) => x.key), ...EXTRA].find((k) => k === sp.tab) ?? "adaptive") as Tab;
  // the model booklets and the practice sets: loaded in the background when the school's center lacks them
  if (actor.schoolId) { void ensureNafsBooklets(repo, actor.schoolId, actor.userId); void ensureNafsPracticeSets(repo, actor.schoolId, actor.userId); }
  const active = tab === "skills" ? "bank" : tab;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="🇸🇦" title="NAFS"
        subtitle={t("The NAFS center: adaptive practice, NAFS tests, the Ministry booklets, reports and a suggested plan — separate from the platform's own levels.")}>
        <Link href="/teacher/nafs?tab=about" aria-current={tab === "about" ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 text-sm font-semibold text-teal-ink ring-1 ring-line">ⓘ {t("About NAFS")}</Link>
      </PageHeader>
      <nav aria-label={t("NAFS")} className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-card ring-1 ring-line print:hidden">
        {CENTER_TABS.map((x) => (
          <Link key={x.key} href={`/teacher/nafs?tab=${x.key}`} aria-current={active === x.key ? "page" : undefined}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${active === x.key ? "bg-brand-navy text-white" : "text-ink-2 hover:bg-surface-2"}`}>{t(x.label)}</Link>
        ))}
      </nav>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200">{sp.msg}</p>}
      {tab === "adaptive" && <AdaptiveTab actor={actor} t={t} sp={sp} />}
      {tab === "test" && <NafsTestTab actor={actor} t={t} sp={sp} />}
      {tab === "booklets" && <BookletsTab actor={actor} t={t} sp={sp} />}
      {tab === "reports" && <OverallTab actor={actor} t={t} sp={sp} />}
      {tab === "plan" && <PlanTab actor={actor} t={t} sp={sp} />}
      {tab === "bank" && <BankTab actor={actor} t={t} sp={sp} />}
      {tab === "marking" && <MarkingTab actor={actor} t={t} sp={sp} />}
      {tab === "about" && <AboutTab t={t} />}
      {tab === "skills" && <SkillsTab actor={actor} t={t} />}
    </AppShell>
  );
}
