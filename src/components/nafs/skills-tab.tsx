import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { linkableFamilies, nafsSkillCounts, nafsStandardCounts } from "@/server/nafs/bank";
import { MOE_AREAS, MOE_CITATION, NAFS_DOMAINS, SKILL_BY_CODE } from "@/server/nafs/framework";
import { linkFamilyAction } from "@/app/teacher/nafs/actions";
import { Combo } from "@/components/ui/combo";

/**
 * 🇸🇦 Skills: the 13 Ministry standards (S01–S13) with their number of questions (click → those questions in the bank),
 * then the four domains and their NAFS skills, each with the number of available questions and the platform skills it
 * is linked to. The admin reviews the links here (add / remove).
 */
export async function SkillsTab({ actor, t }: { actor: Actor; t: TFn }) {
  const admin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  const [counts, families, std] = await Promise.all([nafsSkillCounts(repo, actor), admin ? linkableFamilies(repo) : Promise.resolve([]), nafsStandardCounts(repo, actor)]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line lg:col-span-2" aria-labelledby="std-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="std-h" className="text-lg font-semibold text-ink">{t("The 13 Ministry standards")}</h2>
          <p className="text-xs text-muted">{t(MOE_CITATION)}</p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {MOE_AREAS.map((a) => (
            <div key={a.code}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{a.n}. {t(a.name)}</p>
              <ul className="mt-1.5 grid gap-1.5">
                {std.rows.filter((x) => x.area === a.code).map((x) => (
                  <li key={x.code}>
                    <Link href={`/teacher/nafs?tab=bank&std=${encodeURIComponent(x.code)}`} className="flex items-start justify-between gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-line hover:ring-teal-300">
                      <span className="min-w-0 text-sm text-ink"><b className="me-1 font-mono" dir="ltr">{x.short}</b>{t(x.text)}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ${x.questions ? "bg-teal-50 text-teal-900 ring-teal-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>{t("{n} questions", { n: x.questions })}{x.written ? ` · ${t("{n} written", { n: x.written })}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {std.notSet > 0 && <p className="mt-3 text-sm text-ink-2"><Link href="/teacher/nafs?tab=bank&std=NONE" className="font-semibold text-teal-ink underline">{t("{n} question(s) have no standard yet", { n: std.notSet })}</Link> — {t("open one and choose its standard.")}</p>}
      </section>
      {NAFS_DOMAINS.map((d) => (
        <section key={d.code} className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
          <h2 className="text-lg font-semibold text-ink">{t("Domain {n}", { n: d.n })}. {t(d.name)}</h2>
          <p className="text-sm text-muted">{t(d.about)}</p>
          <ul className="mt-3 grid gap-2">
            {counts.filter((c) => c.domain === d.code).map((c) => (
              <li key={c.code} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{t(c.name)} <span className="ms-1 font-mono text-xs text-muted" dir="ltr">{c.code}</span></p>
                    <p className="text-xs text-muted" lang="en" dir="ltr">{SKILL_BY_CODE.get(c.code)!.stems[0]}</p>
                  </div>
                  <Link href={`/teacher/nafs?tab=bank&code=${encodeURIComponent(c.code)}`} className="inline-flex min-h-10 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-teal-ink ring-1 ring-line">
                    {t("{n} questions", { n: c.questions })}{c.own ? ` · ${t("{n} of the school", { n: c.own })}` : ""}
                  </Link>
                </div>
                <p className="mt-1.5 text-xs text-ink-2">{t("Linked platform skills")}: {c.families.length ? c.families.map((f) => f.name).join(" · ") : "—"}</p>
                {admin && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.families.map((f) => (
                      <form key={f.id} action={linkFamilyAction}>
                        <input type="hidden" name="code" value={c.code} /><input type="hidden" name="familyId" value={f.id} /><input type="hidden" name="linked" value="0" />
                        <button className="min-h-8 rounded-full bg-surface px-2.5 text-xs text-ink-2 ring-1 ring-line hover:text-rose-700" title={t("Remove the link")}>{f.name} ✕</button>
                      </form>
                    ))}
                    <form action={linkFamilyAction} className="flex flex-wrap items-start gap-1.5">
                      <input type="hidden" name="code" value={c.code} /><input type="hidden" name="linked" value="1" />
                      <Combo name="familyId" required label={t("Link a platform skill")} className="w-56" options={families.filter((f) => !c.families.some((x) => x.id === f.id)).map((f) => ({ value: f.id, label: f.name }))} placeholder={t("Link a platform skill")} />
                      <button className="min-h-8 rounded-lg bg-brand-navy px-2.5 text-xs font-semibold text-white">{t("Link")}</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
