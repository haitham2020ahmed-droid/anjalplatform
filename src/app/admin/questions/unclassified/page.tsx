import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { unclassifiedQuestions } from "@/server/curriculum-map/questions";
import { classifyAction } from "./actions";
import { AutoClassify } from "./auto-classify";
import { PageHeader } from "@/components/page-header";
import { Combo } from "@/components/ui/combo";
import { BankTabs } from "../bank-tabs";
import { RichInline } from "@/components/rich-inline";

export const metadata = { title: "Classify questions" };

const PER = 50;

/**
 * Questions not under a platform skill (on a grade's hidden “Unclassified” skill): auto-classify them in batches, or
 * give each a skill of its grade. 50 rows per page, read by the database (the count is the Question Bank banner's).
 */
export default async function UnclassifiedPage({ searchParams }: { searchParams: Promise<{ msg?: string; page?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, skills } = await unclassifiedQuestions(repo, actor.schoolId!, { page, per: PER });
  const pages = Math.max(1, Math.ceil(total / PER));
  const byGrade = new Map<number, { value: string; label: string }[]>();
  for (const k of skills) byGrade.set(k.grade, [...(byGrade.get(k.grade) ?? []), { value: k.id, label: k.name }]);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Question Bank" }} icon="layers" title="Classify Curriculum Questions"
        subtitle={t("These questions have no platform skill yet. Give each a skill of its grade: they then count in practice, skill reports and MAP. Their place on the Curriculum Map does not change.")} />
      <BankTabs />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <p className="mb-4 text-lg font-semibold text-brand-navy" data-testid="unclassified-total">{t("{n} questions are not under a skill.", { n: total.toLocaleString("en") })}</p>
      {total === 0 ? <p className="rounded-xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">{t("Nothing to classify.")}</p> : (
        <>
          <AutoClassify total={total} />
          <form action={classifyAction} className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <input type="hidden" name="page" value={page} />
            <p className="text-sm text-slate-600">{t("Choose a skill for the ones you want, then save (empty = leave for later).")}</p>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full min-w-[40rem] text-left text-sm">
                <thead><tr className="border-b text-slate-500"><th className="py-2">{t("Question")}</th><th>{t("Place")}</th><th>{t("Skill")}</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.id} className="border-b align-top last:border-0">
                    <td className="max-w-md py-2 pe-3"><Link href={`/admin/questions/${r.id}`} className="text-brand-navy hover:underline">{r.stem ? <RichInline text={r.stem} /> : r.id}</Link></td>
                    <td className="pe-3"><code className="text-xs">{r.mapCode ?? "—"}</code></td>
                    <td className="py-1"><Combo name={`skill:${r.id}`} label={t("Skill")} defaultValue="" placeholder={t("Choose (Grade {g})", { g: r.grade })} options={byGrade.get(r.grade) ?? []} className="w-64" dir="ltr" /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="min-h-11 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">{t("Save skills")}</button>
              <nav aria-label={t("Pages")} className="ms-auto flex items-center gap-3 text-sm">
                {page > 1 && <Link href={`/admin/questions/unclassified?page=${page - 1}`} className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300">‹ {t("Previous")}</Link>}
                <span>{t("Page {n} of {m}", { n: page, m: pages })}</span>
                {page < pages && <Link href={`/admin/questions/unclassified?page=${page + 1}`} className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300">{t("Next")} ›</Link>}
              </nav>
            </div>
          </form>
        </>
      )}
    </AppShell>
  );
}
