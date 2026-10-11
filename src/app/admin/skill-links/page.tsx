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

export const metadata = { title: "Skill links: needs review" };

/** 📝 Links the platform could not make confidently: the admin decides (nothing is ever guessed silently). */
export default async function SkillLinksReviewPage({ searchParams }: { searchParams: Promise<{ msg?: string; kind?: string; page?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const kind = (REVIEW_KINDS as readonly string[]).includes(sp.kind ?? "") ? sp.kind : undefined;
  const v = await listReviews(repo, actor, { kind, page: Number(sp.page) || 1 });
  const [mapAreas, nafs] = await Promise.all([repo.findMany("MapGoalArea", {}, { select: ["code", "name"] }), nafsAreas(repo, { activeOnly: true })]);
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const totalOpen = Object.values(v.open).reduce((a, b) => a + b, 0);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/skills", label: "Skills" }} icon="📝" title="Skill links: needs review"
        subtitle={t("Questions and skills the platform could not link with confidence. Nothing here was guessed silently: check the best guess, pick another skill or area, or leave it as it is.")}>
        <Link href="/admin/nafs-links" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Bank ↔ NAFS")}</Link>
        <Link href="/admin/map-links" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Bank ↔ MAP")}</Link>
      </PageHeader>
      <SortQuestions />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label={t("Kind")} className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/skill-links" className={chip(!kind)}>{t("All")} ({totalOpen})</Link>
        {REVIEW_KINDS.map((k) => <Link key={k} href={`/admin/skill-links?kind=${k}`} className={chip(kind === k)}>{t(KIND_LABEL[k])} ({v.open[k] ?? 0})</Link>)}
      </nav>
      {v.rows.length === 0 ? <EmptyState icon="✅" title="Nothing to review" text="Every link was made with confidence." action={{ href: "/admin", label: "Home" }} /> : (
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
                    <input type="hidden" name="id" value={r.id} />{kind && <input type="hidden" name="kind" value={kind} />}<input type="hidden" name="page" value={v.page} />
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
                  <input type="hidden" name="id" value={r.id} />{kind && <input type="hidden" name="kind" value={kind} />}<input type="hidden" name="page" value={v.page} />
                  <button className="min-h-11 rounded-lg bg-white px-4 font-semibold text-slate-700 ring-1 ring-slate-300">{t("Leave as it is")}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {v.pages > 1 && (
        <nav aria-label={t("Pages")} className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: Math.min(v.pages, 20) }, (_, i) => i + 1).map((p) => <Link key={p} href={`/admin/skill-links?${new URLSearchParams({ ...(kind ? { kind } : {}), page: String(p) })}`} className={chip(p === v.page)}>{p}</Link>)}
        </nav>
      )}
    </AppShell>
  );
}
