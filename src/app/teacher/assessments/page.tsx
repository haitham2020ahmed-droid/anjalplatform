import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Meter, ReportHeader } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listTemplates, teacherTests, TEST_TYPE_NAME, TEST_TYPES } from "@/server/tests/assessments";
import { deleteTemplateAction, deleteTestAction, withdrawTestAction } from "./actions";
import { EmptyState, SourceTag, BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "Assessments" };
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");

/** 📝 Assessments: the teacher's tests (results by skill) and saved templates; "New test" opens the builder. */
export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<{ msg?: string; type?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const [allTests, templates] = await Promise.all([teacherTests(repo, actor), listTemplates(repo, actor)]);
  // 🔎 filter by type (each type its own chip, Review included — never folded into "Other")
  const types = TEST_TYPES.filter((x) => allTests.some((r) => r.type === x));
  const type = types.find((x) => x === sp.type) ?? null;
  const tests = type ? allTests.filter((r) => r.type === type) : allTests;
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher", label: "Home" }} icon="📝" title={t("Assessments")} subtitle={t("Build a test from skills, assign it, and see the results by skill.")} print={false}>
        <Link href="/teacher/student-view" className={BTN_SECONDARY}>👀 {t("Preview as student")}</Link>
        <Link href="/teacher/assessments/new" className={`${BTN_PRIMARY} rounded-2xl px-5`}>+ {t("New test")}</Link>
      </ReportHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200">{sp.msg}</p>}
      <section className="rk-section rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6">
        <h2 className="text-lg font-semibold text-brand-navy"><span aria-hidden="true">📊 </span>{t("Test results")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("Every test you assigned. Open Results to see each student and each skill.")}</p>
        {types.length > 1 && (
          <nav aria-label={t("Test type")} className="mt-3 flex flex-wrap gap-2">
            <Link href="/teacher/assessments" aria-current={!type ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${!type ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`}>{t("All")}</Link>
            {types.map((x) => <Link key={x} href={`/teacher/assessments?type=${x}`} aria-current={type === x ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${type === x ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`}>{t(TEST_TYPE_NAME[x])}</Link>)}
          </nav>
        )}
        {!tests.length ? <EmptyState compact icon="📝" title="No tests yet" text="Press “+ New test” to build your first one." className="mt-3" /> : (
          <ul className="mt-3 divide-y divide-slate-100">
            {tests.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-navy">{x.title} <SourceTag source={x.type === "CUSTOM" ? "OTHER" : x.type} /></p>
                  <p className="text-sm text-slate-600">{x.className} · {t("assigned {date}", { date: day(x.createdAt) })}{x.dueAt ? ` · ${t("Due {date}", { date: day(x.dueAt) })}` : ""} · {t("{done} of {total} finished", { done: x.completed, total: x.assigned })}</p>
                  <Meter value={x.completed} total={x.assigned} className="mt-1.5 max-w-xs" />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Link href={`/teacher/assessments/${x.id}`} className={BTN_SECONDARY}>{t("Results")}</Link>
                  {/* 🗑 r87: the teacher's own choice — stop it but keep the record, or delete it for good */}
                  <details className="text-end">
                    <summary className="cursor-pointer text-xs font-semibold text-rose-700">{t("Cancel this test")}</summary>
                    <div className="mt-2 flex max-w-xs flex-col gap-2 rounded-xl bg-slate-50 p-3 text-start text-xs ring-1 ring-slate-200">
                      <form action={withdrawTestAction} className="flex flex-col gap-1">
                        <input type="hidden" name="testId" value={x.id} />
                        <p className="text-slate-600">{t("Stop sending to students. Answers already given are kept, and you can undo this from Assigned.")}</p>
                        <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" required className="h-4 w-4" />{t("Yes, stop this test")}</label>
                        <button className="self-start rounded-lg bg-white px-3 py-1 font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50">{t("Stop (keep saved)")}</button>
                      </form>
                      <form action={deleteTestAction} className="flex flex-col gap-1 border-t border-slate-200 pt-2">
                        <input type="hidden" name="testId" value={x.id} />
                        <p className="text-slate-600">{t("Gone from here for good; no Undo. Answers already given are not deleted.")}</p>
                        <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" required className="h-4 w-4" />{t("Yes, delete permanently")}</label>
                        <button className="self-start rounded-lg bg-rose-700 px-3 py-1 font-semibold text-white hover:bg-rose-800">{t("Delete permanently")}</button>
                      </form>
                    </div>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-6 rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6">
        <h2 className="text-lg font-semibold text-brand-navy">{t("My templates")}</h2>
        {!templates.length ? <EmptyState compact icon="📋" title="No templates yet" text="In the builder, press “Save as template” to reuse a test later." className="mt-3" /> : (
          <ul className="mt-3 divide-y divide-slate-100">
            {templates.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="font-semibold text-brand-navy">{x.title} <span className="ms-1 text-sm font-normal text-slate-600">{t(x.typeName)} · {t("{n} skill(s)", { n: x.skills })}</span></p>
                <div className="flex gap-2">
                  <Link href={`/teacher/assessments/new?template=${x.id}`} className={BTN_SECONDARY}>{t("Use / Edit")}</Link>
                  <form action={deleteTemplateAction}><input type="hidden" name="id" value={x.id} /><button className="min-h-11 rounded-xl px-4 font-semibold text-rose-700 ring-1 ring-rose-200">{t("Delete")}</button></form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
