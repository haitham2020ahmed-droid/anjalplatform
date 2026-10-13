import { OMR_SCANNER_LABELS } from "@/lib/omr/labels";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { answerGrid, getNafsTest, nafsClasses, testKey } from "@/server/nafs/tests";
import { getT } from "@/i18n/server";
import { NafsGradeSheets } from "@/components/nafs/grade-sheets";

export const metadata = { title: "Grade bubble sheets" };


/**
 * 🇸🇦 Grade bubble sheets: photos or scans are read IN THE BROWSER (no image is sent or stored — only the answers),
 * then the review screen (sheet preview next to the detected answers, uncertain rows highlighted, one-tap fixes)
 * saves each student's answers; graded on the server with the key and the marks. Or the fast "type answers" grid.
 */
export default async function NafsGradePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string; mode?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const me = (await getActor())!.user;
  const { t } = await getT();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const test = await getNafsTest(repo, actor, id).catch(() => null);
  if (!test) redirect("/teacher/nafs?tab=sheets");
  const classes = await nafsClasses(repo, actor);
  const klass = classes.find((c) => c.id === sp.class) ?? classes[0];
  const [grid, { key }] = await Promise.all([klass ? answerGrid(repo, actor, id, klass.id) : Promise.resolve({ students: [] }), testKey(repo, test)]);
  const written = key.map((k, i) => (k < 0 ? i + 1 : 0)).filter(Boolean);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/nafs/tests/${id}`, label: "Back" }} icon="📷" title="Grade bubble sheets" subtitle={`${test.title} · ${t("{n} questions", { n: test.questionIds.length })}`}>
        <Link href={`/teacher/nafs?tab=reports&test=${id}${klass ? `&class=${klass.id}` : ""}`} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">{t("Reports")}</Link>
      </PageHeader>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <input type="hidden" name="mode" value={sp.mode ?? ""} />
        <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Class")}<select name="class" defaultValue={klass?.id} className="min-h-10 rounded-lg bg-surface px-2 ring-1 ring-line">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className="min-h-10 rounded-lg bg-surface px-3 font-semibold text-ink ring-1 ring-line">{t("Show")}</button>
      </form>
      {written.length > 0 && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">✍ {t("Questions {list} are short written answers: leave their bubbles empty and score them in the Marking tab.", { list: written.join(", ") })} <Link href={`/teacher/nafs?tab=marking&test=${id}`} className="font-semibold underline">{t("Marking")}</Link></p>}
      {!klass ? <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">{t("You have no Grade 6 class yet.")}</p> : (
        <NafsGradeSheets testId={id} questions={Math.min(60, test.questionIds.length)} initialMode={sp.mode === "type" ? "type" : "scan"} students={grid.students}
          scannerLabels={Object.fromEntries(OMR_SCANNER_LABELS.map((w) => [w, t(w)]))} />
      )}
    </AppShell>
  );
}
