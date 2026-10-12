import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RubricBuilder, RubricTable } from "@/components/writing/rubric-builder";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { listRubrics } from "@/server/writing/locked";
import { deleteRubricAction, saveRubricAction } from "../locked-actions";

export const metadata = { title: "Writing rubrics" };

/** 📏 Saved writing rubrics: the teacher's own and the ones shared in the school; build a new one. */
export default async function RubricsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const rubrics = await listRubrics(repo, actor);
  const admin = actor.role === "SCHOOL_ADMIN";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/writing", label: "Writing & Reading Aloud" }} icon="📏" title="Writing rubrics" subtitle={t("Your rubrics and the ones shared in your school. Tasks keep their own copy, so changes never alter a grade.")} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-3">
          {!rubrics.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("No saved rubric yet.")}</p> : rubrics.map((r) => (
            <details key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <summary className="cursor-pointer font-semibold text-brand-navy">{r.title} <span className="text-xs font-normal text-slate-500">· {t("{n} criteria", { n: r.criteria.length })} · {r.mine ? t("mine") : t("shared")}{r.mine && r.shared ? ` · ${t("shared")}` : ""}</span></summary>
              <RubricTable criteria={r.criteria} />
              {(r.mine || admin) && (
                <form action={deleteRubricAction} className="mt-2"><input type="hidden" name="rubricId" value={r.id} /><button className="text-sm font-semibold text-red-700">{t("Remove")}</button></form>
              )}
            </details>
          ))}
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="font-semibold text-brand-navy">➕ {t("Build a new rubric")}</h2>
          <form action={saveRubricAction} className="mt-2 space-y-3">
            <RubricBuilder saved={[]} buildOnly />
            <button className="inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("Save rubric")}</button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
