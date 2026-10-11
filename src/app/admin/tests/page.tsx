import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { adminTestCounts } from "@/server/tests/assessments";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "Tests per teacher" };

/** Admin: how many tests each teacher created and how many students completed them. */
export default async function AdminTestsPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t: tr } = await getT();
  const { teachers, totals } = await adminTestCounts(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="📝" title="Tests per teacher" subtitle={`${tr("{n} test(s)", { n: totals.tests })} · ${tr("{done} of {total} completed", { done: totals.completed, total: totals.assigned })}`} />
      {!teachers.length ? <EmptyState icon="👩‍🏫" title="No teachers yet" action={{ href: "/admin", label: "Home" }} /> : (
        <div className="overflow-x-auto rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <table className="w-full min-w-[30rem]">
            <thead><tr className="text-sm text-slate-600"><th className="py-2 text-start">{tr("Teacher")}</th><th className="text-start">{tr("Tests created")}</th><th className="text-start">{tr("Students completed")}</th><th className="text-start">{tr("By type")}</th></tr></thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.teacherId} className="border-t border-slate-100">
                  <td className="py-2 font-semibold text-brand-navy">{t.name}</td>
                  <td>{t.tests}</td>
                  <td>{tr("{done} of {total}", { done: t.completed, total: t.assigned })}</td>
                  <td className="text-sm text-slate-600">{Object.entries(t.byType).map(([k, n]) => `${tr(k)} ${n}`).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
