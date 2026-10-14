import Link from "next/link";
import { nafsDbGate } from "@/components/db-update-needed";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { getNafsTest, nafsClasses } from "@/server/nafs/tests";
import { sheetLayout } from "@/lib/omr/layout";
import { blankSheetCode, classSheetCodes } from "@/lib/omr/sheet-ids";
import { AnswerSheet } from "@/components/omr/answer-sheet";
import { OMR_INSTRUCTION } from "@/lib/omr/labels";
import { getT } from "@/i18n/server";
import { Combo } from "@/components/ui/combo";

export const metadata = { title: "Bubble sheets" };
const CSS = `.ns-sheet{margin:0 auto 24px;width:fit-content;box-shadow:0 0 0 1px #e2e8f0}
@media print{@page{size:A4;margin:0}body{background:#fff!important}.ns-sheet{box-shadow:none;margin:0}.ns-sheet + .ns-sheet{break-before:page;page-break-before:always}}`;

/**
 * 🇸🇦 Bubble sheets for a saved NAFS test (≤ 60 questions): one A4 sheet per student of the chosen Grade 6 class (name,
 * class and the student/test code pre-printed), or blank sheets (the teacher picks the student when scanning).
 * Printed from the browser; black and white works.
 */
export default async function NafsSheetsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string; blank?: string; copies?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const me = (await getActor())!.user;
  const { t } = await getT();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const test = await getNafsTest(repo, actor, id).catch(() => null);
  if (!test) redirect("/teacher/nafs?tab=marking#sheets");
  const classes = await nafsClasses(repo, actor);
  const klass = classes.find((c) => c.id === sp.class) ?? classes[0];
  const n = test.questionIds.length;
  const layout = sheetLayout(Math.min(60, n));
  const blank = sp.blank === "1";
  const copies = Math.max(1, Math.min(60, Math.round(Number(sp.copies) || (klass?.students.length ?? 1))));
  const logo = /* eslint-disable-next-line @next/next/no-img-element */ <img src="/api/school-logo" alt="" style={{ height: "14mm", maxWidth: "40mm", objectFit: "contain" }} />;
  const sheets = blank ? Array.from({ length: copies }, (_x, i) => ({ key: `b${i}`, name: undefined as string | undefined, code: blankSheetCode(id) }))
    : ((codes) => (klass?.students ?? []).map((s) => ({ key: s.id, name: s.name, code: codes.get(s.id)! })))(classSheetCodes(id, (klass?.students ?? []).map((s) => s.id)));
  return (
    <AppShell name={String(me.displayName)}>
      <style>{CSS}</style>
      <div className="mb-4 grid gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/teacher/nafs/tests/${id}`} className="inline-flex min-h-11 items-center rounded-xl px-3 font-semibold text-ink-2 ring-1 ring-line">‹ {t("Back")}</Link>
          <PrintButton label={t("Print / Save as PDF")} />
          <Link href={`/teacher/nafs/tests/${id}/grade?class=${klass?.id ?? ""}`} className="inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-4 font-semibold text-white">📷 {t("Grade bubble sheets")}</Link>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div className="grid min-w-48 gap-1 text-xs font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="class" required label={t("Class")} defaultValue={klass?.id} options={classes.map((c) => ({ value: c.id, label: c.name }))} /></div>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="blank" value="1" defaultChecked={blank} /> {t("Blank sheets")}</label>
          <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("How many blank sheets")}<input type="number" name="copies" min={1} max={60} defaultValue={copies} className="min-h-10 w-20 rounded-lg bg-surface px-2 ring-1 ring-line" /></label>
          <button className="min-h-10 rounded-lg bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        </form>
        <p className="text-sm text-muted">{t("{n} sheet(s) · {q} questions · print at 100% (no “fit to page”) so the reader finds the corner markers.", { n: sheets.length, q: n })}</p>
        {n > 60 && <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("A bubble sheet holds 60 questions at most.")}</p>}
      </div>
      {sheets.map((s) => (
        <div key={s.key} className="ns-sheet">
          <AnswerSheet layout={layout} title={test.title} studentName={s.name} className={blank ? undefined : klass?.name} code={s.code} logo={logo} labels={{ name: t("Name"), class: t("Class"), code: t("Code"), instruction: t(OMR_INSTRUCTION) }} />
        </div>
      ))}
    </AppShell>
  );
}
