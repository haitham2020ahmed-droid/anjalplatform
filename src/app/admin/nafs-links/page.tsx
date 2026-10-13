import Link from "next/link";
import { nafsDbGate } from "@/components/db-update-needed";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ensureNafsAreas, nafsLinks } from "@/server/nafs/nafs-links";
import { applyNafsSuggestionsAction, linkNafsFamilyAction, saveNafsAreaAction } from "./actions";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "Bank ↔ NAFS" };

/** 🔗 Every skill of the bank with its NAFS area (like Bank ↔ MAP): what is not linked yet and the suggestion. */
export default async function NafsLinksPage({ searchParams }: { searchParams: Promise<{ msg?: string; all?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:edit" });
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  await ensureNafsAreas(repo);
  const v = await nafsLinks(repo, actor);
  const missing = v.rows.filter((r) => !r.areaCode);
  const shown = sp.all ? v.rows : missing.length ? missing : v.rows;
  const nameOf = (c: string | null) => v.areas.find((a) => a.code === c)?.name ?? c ?? "";
  const confident = missing.filter((r) => r.suggested && r.confidence >= 0.8);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/skills", label: "Skills" }} icon="🔗" title="Question Bank ↔ NAFS Areas"
        subtitle={<>{t("Every question counts for its skill’s NAFS area (the same way as MAP).")} <b>{t("{n} of {total} skills have no NAFS area.", { n: missing.length, total: v.rows.length })}</b> {t("The suggestion comes from the skill’s type (Grammar, Mechanics, Writing, Vocabulary, Literature, Informational), then its MAP goal area, then its standards (RL → Literary, RI → Informational). Unsure suggestions are never applied automatically.")}</>}>
        {confident.length > 0 && <form action={applyNafsSuggestionsAction}><button className="min-h-11 rounded-xl bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700">✓ {t("Apply sure suggestions ({n})", { n: confident.length })}</button></form>}
        <Link href={sp.all ? "/admin/nafs-links" : "/admin/nafs-links?all=1"} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{t(sp.all ? "Only unlinked" : "Show all skills")}</Link>
        <Link href="/admin/skill-links" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">📝 {t("Needs review")}</Link>
        <Link href="/admin/map-links" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Bank ↔ MAP")}</Link>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!missing.length && !sp.all && <p className="mb-4 rounded-xl bg-teal-50 px-4 py-3 font-semibold text-teal-900 ring-1 ring-teal-200">✅ {t("Every skill is linked to a NAFS area.")}</p>}

      <section className="mb-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200" aria-labelledby="areas">
        <h2 id="areas" className="text-lg font-semibold text-brand-navy">{t("NAFS areas")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("The list is yours to edit: rename an area, change its order, switch it off, or add one. Areas are never deleted.")}</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {v.areas.map((a) => (
            <li key={a.id} className="py-2">
              <form action={saveNafsAreaAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={a.id} />
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">{a.code}</span>
                <input name="name" defaultValue={a.name} aria-label={t("Name of {code}", { code: a.code })} className="min-h-11 min-w-64 flex-1 rounded-lg border border-slate-300 px-3" />
                <input name="sortOrder" type="number" defaultValue={a.sortOrder} aria-label={t("Order")} className="min-h-11 w-20 rounded-lg border border-slate-300 px-2" />
                <label className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" name="isActive" value="1" defaultChecked={a.isActive} className="h-5 w-5" /> {t("In use")}</label>
                <button className="min-h-11 rounded-lg bg-brand-navy px-3 font-semibold text-white">{t("Save")}</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={saveNafsAreaAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input name="name" placeholder={t("New area name")} aria-label={t("New area name")} className="min-h-11 min-w-64 flex-1 rounded-lg border border-slate-300 px-3" />
          <button className="min-h-11 rounded-lg bg-teal-600 px-3 font-semibold text-white">+ {t("Add area")}</button>
        </form>
      </section>

      {shown.length === 0 ? <EmptyState icon="🔗" title="Nothing here yet" text="Skills appear here as soon as a grade has a curriculum." action={{ href: "/admin", label: "Home" }} /> : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full text-start text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="p-3 text-start">{t("Skill")}</th><th className="p-2 text-start">{t("Grades")}</th><th className="p-2 text-start">{t("Questions")}</th><th className="p-2 text-start">{t("Standard")}</th><th className="p-2 text-start">{t("NAFS area")}</th><th className="p-2" /></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.familyId} className="border-b last:border-0">
                <td className="p-3"><b className="text-brand-navy">{r.family}</b>{r.skills.length > 1 && <span className="block text-xs text-slate-500">{r.skills.join(" · ")}</span>}</td>
                <td className="p-2">{r.grades.join(", ")}</td><td className="p-2 tabular-nums">{r.questions}</td><td className="p-2">{r.standard ?? "—"}</td>
                <td className="p-2">
                  <form action={linkNafsFamilyAction} className="flex items-center gap-2">
                    <input type="hidden" name="familyId" value={r.familyId} />
                    <select name="area" defaultValue={r.areaCode ?? (r.confidence >= 0.8 ? r.suggested ?? "" : "")} aria-label={t("NAFS area of {name}", { name: r.family })} className="min-h-11 rounded-lg border border-slate-300 px-2">
                      <option value="">— {t("none")} —</option>
                      {v.areas.filter((a) => a.isActive || a.code === r.areaCode).map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                    </select>
                    <button className="min-h-11 rounded-lg bg-brand-navy px-3 font-semibold text-white">{t("Save")}</button>
                  </form>
                </td>
                <td className="p-2 text-xs">{r.areaCode ? <span className="text-teal-700">✓ {t(r.source === "ADMIN" ? "set by admin" : "automatic")}</span> : r.suggested ? <span className={r.confidence >= 0.8 ? "text-teal-800" : "text-amber-800"}>{t(r.confidence >= 0.8 ? "suggested" : "needs review — best guess")}: {nameOf(r.suggested)}<span className="block text-slate-500">{r.reason}</span></span> : <span className="text-amber-800">{t("needs review")}: {r.reason}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
