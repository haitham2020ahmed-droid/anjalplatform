import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { listMissingPassage } from "@/server/admin/missing-passage";
import { BankTabs } from "../bank-tabs";
import { removeMissingPassageAction } from "./actions";

export const metadata = { title: "Questions that need a missing passage" };

/**
 * 🧾 Questions whose wording needs a passage, story, poem, chart or picture that is not attached (r68): the list first,
 * then one click removes them all (soft delete: hidden everywhere, students' answers kept).
 */
export default async function MissingPassagePage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const { t } = await getT();
  const { items, total } = await listMissingPassage(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Question Bank" }} icon="layers" title="Remove questions that need a missing passage"
        subtitle={t("These questions talk about a passage, story, poem, chart or picture that is not attached, so students cannot answer them. Removing hides them from the whole platform; students' answers are kept.")} />
      <BankTabs />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <p className="mb-4 text-lg font-semibold text-brand-navy" data-testid="missing-passage-total">{t("{n} questions need a passage or picture that is not attached.", { n: total.toLocaleString("en") })}</p>
      {total === 0 ? <p className="rounded-xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">{t("Nothing to remove.")}</p> : (
        <>
          <form action={removeMissingPassageAction} className="mb-4">
            <button className="min-h-11 rounded-xl bg-red-700 px-5 py-2 font-semibold text-white hover:bg-red-800" data-testid="remove-missing-passage">{t("Remove these {n} questions", { n: total.toLocaleString("en") })}</button>
          </form>
          <div className="overflow-x-auto rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-2">{t("Question")}</th><th>{t("Skill")}</th><th>{t("Why")}</th></tr></thead>
              <tbody>{items.map((r) => (
                <tr key={r.id} className="border-b align-top last:border-0">
                  <td className="max-w-md py-2 pe-3"><Link href={`/admin/questions/${r.id}`} className="text-brand-navy hover:underline">{r.stem || r.id}</Link></td>
                  <td className="pe-3 text-slate-600">{r.grade ? `G${r.grade} · ` : ""}{r.skill}</td>
                  <td className="py-2 text-slate-700">{r.reason}</td>
                </tr>
              ))}</tbody>
            </table>
            {total > items.length && <p className="mt-2 text-sm text-slate-600">{t("Showing the first {n}.", { n: items.length })}</p>}
          </div>
        </>
      )}
    </AppShell>
  );
}
