import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { KIND_LABEL, listReviews, REVIEW_KINDS } from "@/server/questions/link-review";
import { nafsAreas } from "@/server/nafs/nafs-links";
import { approveReviewAction, dismissReviewAction } from "./actions";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import { SortQuestions } from "./sort-questions";
import { AcceptConfident, GroupView, ImproveWithAi } from "./bulk-review";
import { reviewGroups } from "@/server/questions/link-review-bulk";

export const metadata = { title: "Skill links: needs review" };

/** 📝 Links the platform could not make confidently: the admin decides (nothing is ever guessed silently). */
export default async function SkillLinksReviewPage({ searchParams }: { searchParams: Promise<{ msg?: string; kind?: string; page?: string; view?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const kind = (REVIEW_KINDS as readonly string[]).includes(sp.kind ?? "") ? sp.kind : undefined;
  const v = await listReviews(repo, actor, { kind, page: Number(sp.page) || 1 });
  const [mapAreas, nafs] = await Promise.all([repo.findMany("MapGoalArea", {}, { select: ["code", "name"] }), nafsAreas(repo, { activeOnly: true })]);
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const totalOpen = Object.values(v.open).reduce((a, b) => a + b, 0);
  // QUESTION rows: “By suggested skill” (default) or the one-by-one list
  const grouped = kind === "QUESTION" && sp.view !== "list";
  const groups = grouped ? await reviewGroups(repo, actor) : [];
  const reviewed = await repo.count("SkillLinkReview", { schoolId: actor.schoolId, kind: "QUESTION", status: "APPROVED" });
  const tab = (on: boolean) => `inline-flex min-h-11 items-center border-b-2 px-4 font-semibold ${on ? "border-brand-navy text-brand-navy" : "border-transparent text-slate-600 hover:text-brand-navy"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/skills", label: "Skills" }} icon="📝" title="Skill links: needs review"
        subtitle={t("Questions and skills the platform could not link with confidence. Nothing here was guessed silently: check the best guess, pick another skill or area, or leave it as it is.")}>
        <Link href="/admin/nafs-links" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Bank ↔ NAFS")}</Link>
        <Link href="/admin/map-links" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Bank ↔ MAP")}</Link>
      </PageHeader>
      {reviewed > 0 && (
        <section aria-labelledby="next-publish" className="mb-6 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
          <h2 id="next-publish" className="text-lg font-semibold text-emerald-900">{t("Next: publish the questions")}</h2>
          <p className="text-sm text-emerald-900">{t("Questions linked to their skills reach students once they are published. Use “Publish all drafts” on the data clean-up page.")}</p>
          <Link href="/admin/data-cleanup" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">{t("Go to data clean-up")}</Link>
        </section>
      )}
      <SortQuestions />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label={t("Kind")} className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/skill-links" className={chip(!kind)}>{t("All")} ({totalOpen})</Link>
        {REVIEW_KINDS.map((k) => <Link key={k} href={`/admin/skill-links?kind=${k}`} className={chip(kind === k)}>{t(KIND_LABEL[k])} ({v.open[k] ?? 0})</Link>)}
      </nav>
      {kind === "QUESTION" && (v.open.QUESTION ?? 0) > 0 && (
        <section className="mb-4 grid gap-3 md:grid-cols-2">
          <ImproveWithAi />
          <AcceptConfident />
        </section>
      )}
      {kind === "QUESTION" && (
        <nav aria-label={t("View")} className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
          <Link href="/admin/skill-links?kind=QUESTION" aria-current={grouped ? "page" : undefined} className={tab(grouped)}>{t("By suggested skill")}</Link>
          <Link href="/admin/skill-links?kind=QUESTION&view=list" aria-current={!grouped ? "page" : undefined} className={tab(!grouped)}>{t("One by one")}</Link>
        </nav>
      )}
      {grouped ? (groups.length ? <GroupView groups={groups} /> : <EmptyState icon="✅" title="Nothing to review" text="Every link was made with confidence." action={{ href: "/admin", label: "Home" }} />) : v.rows.length === 0 ? <EmptyState icon="✅" title="Nothing to review" text="Every link was made with confidence." action={{ href: "/admin", label: "Home" }} /> : (
        <ul className="space-y-3">
          {v.rows.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700">{t(KIND_LABEL[r.kind])}</span>
                {r.grade ? <span className="rounded-full bg-slate-100 px-2.5 py-0.5">{t("Grade {n}", { n: r.grade })}</span> : null}
                {r.currentSkill && <span className="text-slate-500">{t("now:")} {r.currentSkill}</span>}
                <span className="text-slate-500">{t("sure: {n}%", { n: Math.round(r.confidence * 100) })}</span>
              </div>
              <p className="mt-2 text-slate-900" data-content lang="en">{r.excerpt}</p>
              <p className="mt-1 text-sm text-slate-600">{r.guessLabel ? <>{t("Best guess:")} <b>{r.guessLabel}</b> — </> : null}{r.reason}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.kind !== "READRISE" && (
                  <form action={approveReviewAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />{kind && <input type="hidden" name="kind" value={kind} />}<input type="hidden" name="page" value={v.page} />{kind === "QUESTION" && <input type="hidden" name="view" value="list" />}
                    <select name="choice" defaultValue={r.guessId ?? ""} aria-label={t("Choose")} className="min-h-11 max-w-xs rounded-lg border border-slate-300 px-2">
                      <option value="">— {t("choose")} —</option>
                      {r.kind === "QUESTION" && (v.skillsByGrade[r.grade ?? 0] ?? []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                      {r.kind === "FAMILY_NAFS" && nafs.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                      {r.kind === "FAMILY_MAP" && mapAreas.map((a) => <option key={String(a.code)} value={String(a.code)}>{String(a.name)}</option>)}
                    </select>
                    <button className="min-h-11 rounded-lg bg-brand-navy px-4 font-semibold text-white">{t("Save")}</button>
                  </form>
                )}
                <form action={dismissReviewAction}>
                  <input type="hidden" name="id" value={r.id} />{kind && <input type="hidden" name="kind" value={kind} />}<input type="hidden" name="page" value={v.page} />{kind === "QUESTION" && <input type="hidden" name="view" value="list" />}
                  <button className="min-h-11 rounded-lg bg-white px-4 font-semibold text-slate-700 ring-1 ring-slate-300">{t("Leave as it is")}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!grouped && v.pages > 1 && (
        <nav aria-label={t("Pages")} className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: Math.min(v.pages, 20) }, (_, i) => i + 1).map((p) => <Link key={p} href={`/admin/skill-links?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(kind === "QUESTION" ? { view: "list" } : {}), page: String(p) })}`} className={chip(p === v.page)}>{p}</Link>)}
        </nav>
      )}
    </AppShell>
  );
}
