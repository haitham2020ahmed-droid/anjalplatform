import Link from "next/link";
import { nafsDbGate } from "@/components/db-update-needed";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { builderRows, isAdaptiveTest } from "@/server/nafs/build";
import { getNafsTest, givenClasses, markOf, MODE_NAME, nafsClasses } from "@/server/nafs/tests";
import { getT } from "@/i18n/server";
import { codeName, MAX_NAFS_MINUTES } from "@/server/nafs/framework";
import { Combo } from "@/components/ui/combo";
import { assignOnlineAction, deleteTestAction, nafsTimeAction, releaseAction, updateAssignmentAction } from "../../actions";
import { LiveTimePanel } from "@/components/live-time-panel";
import { RichInline } from "@/components/rich-inline";

export const metadata = { title: "NAFS test" };
const SEL = "min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line";
const LINK = "inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line";
/** ISO → the value of a datetime-local field (UTC minutes; empty when none). */
const local = (v: string | null) => (v ? v.slice(0, 16) : "");

/**
 * 🇸🇦 One NAFS test: its questions, and what to do with it — assign it to students online (a Grade 6 class or chosen
 * students; its own time and open / due dates; MCQs graded automatically, written answers to the Marking tab, results
 * released by the teacher), print the booklet, print / grade bubble sheets, type the answers, see the results.
 */
export default async function NafsTestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const me = (await getActor())!.user;
  const { t } = await getT();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const test = await getNafsTest(repo, actor, id).catch(() => null);
  if (!test) redirect("/teacher/nafs?tab=test");
  const [rows, classes, given] = await Promise.all([builderRows(repo, actor, test.questionIds), nafsClasses(repo, actor), givenClasses(repo, actor, id)]);
  const total = Math.round(test.questionIds.reduce((a, q) => a + markOf(test.marks, q), 0) * 100) / 100;
  const first = classes[0]?.id ?? "";
  const written = rows.filter((r) => r.kind === "WRITTEN").length;
  const adaptive = isAdaptiveTest(test.settings);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/nafs?tab=test", label: "NAFS test" }} icon="🇸🇦" title={test.title}
        subtitle={`${t(MODE_NAME[test.mode])} · ${t("{n} questions", { n: rows.length })} · ${t("{n} marks", { n: total })}${test.timeLimitMin ? ` · ${t("{n} minutes", { n: test.timeLimitMin })}` : ""}`}>
        <Link href={`/teacher/nafs/tests/new?id=${id}`} className={LINK}>{t(test.locked || !test.canEdit ? "Make a copy" : "Change")}</Link>
        <Link href={`/teacher/nafs?tab=test&sub=report&test=${id}`} className="inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Reports")}</Link>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200">{sp.msg}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
          <h2 className="text-lg font-semibold text-ink">💻 {t("Assign to students (online)")}</h2>
          {adaptive && <p className="mt-1 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900 ring-1 ring-teal-200">↕ {t("Adaptive test: online, each student starts at Medium and the next question is harder after a right answer, easier after a wrong one, inside the test's standards (results under Practice). Printed, it is the Mixed list below.")}</p>}
          <p className="mt-1 text-sm text-ink-2">{t("Students solve it on the platform (My Tests): a timer, the passage with its questions, a warning about unanswered questions, no hints. Multiple-choice answers are graded automatically; written answers go to the Marking tab; results go to Reports. Students see their score after you release the results.")}</p>
          {!classes.length ? <p className="mt-3 text-sm text-muted">{t("You have no Grade 6 class yet.")}</p> : (
            <div className="mt-3 grid gap-2">
              {classes.map((c, ci) => (
                <details key={c.id} open={ci === 0 && !given.length} className="rounded-xl bg-surface-2 ring-1 ring-line">
                  <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 font-semibold text-ink">{c.name} <span className="text-xs font-normal text-muted">{t("{n} students", { n: c.students.length })}{given.some((g) => g.classId === c.id) ? ` · ${t("assigned")}` : ""}</span></summary>
                  <form action={assignOnlineAction} className="grid gap-3 border-t border-line p-3">
                    <input type="hidden" name="testId" value={id} /><input type="hidden" name="classId" value={c.id} />
                    <fieldset className="grid gap-1.5">
                      <legend className="text-xs font-semibold text-ink-2">{t("Who")}</legend>
                      <label className="flex items-center gap-2 text-sm text-ink"><input type="radio" name="who" value="class" defaultChecked className="h-4 w-4" /> {t("The whole class")}</label>
                      <label className="flex items-center gap-2 text-sm text-ink"><input type="radio" name="who" value="some" className="h-4 w-4" /> {t("Only the students I tick")}</label>
                      <Combo multiple name="sid" label={t("Only the students I tick")} options={c.students.map((x) => ({ value: x.id, label: x.name }))} />
                    </fieldset>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Time (minutes)")}<input type="number" name="minutes" required min={1} max={MAX_NAFS_MINUTES} defaultValue={test.timeLimitMin ?? ""} className={`${SEL} w-24`} /></label>
                      <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Opens (optional)")}<input type="datetime-local" name="openAt" className={SEL} /></label>
                      <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Due (optional)")}<input type="datetime-local" name="dueAt" className={SEL} /></label>
                      <button className="min-h-11 rounded-xl bg-teal-700 px-4 font-semibold text-white">{t("Assign online")}</button>
                    </div>
                  </form>
                </details>
              ))}
            </div>
          )}
          {given.length > 0 && (
            <ul className="mt-4 grid gap-2">
              {given.map((g) => (
                <li key={g.classId} className="rounded-xl p-3 text-sm ring-1 ring-line">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink"><b>{g.className}</b> · {g.chosen ? t("{n} chosen student(s)", { n: g.chosen.length }) : t("whole class")} · {t("{done} of {total} finished", { done: g.done, total: g.students })}</span>
                    <form action={releaseAction}>
                      <input type="hidden" name="testId" value={id} /><input type="hidden" name="classId" value={g.classId} /><input type="hidden" name="release" value={g.releasedAt ? "0" : "1"} />
                      <button className={`min-h-10 rounded-lg px-3 font-semibold ${g.releasedAt ? "text-ink-2 ring-1 ring-line" : "bg-brand-navy text-white"}`}>{t(g.releasedAt ? "Hide the results" : "Release the results")}</button>
                    </form>
                  </div>
                  {g.chosen && <p className="mt-1 text-xs text-muted">{g.chosen.join(", ")}</p>}
                  <form action={updateAssignmentAction} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="testId" value={id} /><input type="hidden" name="classId" value={g.classId} />
                    <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Time (minutes)")}<input type="number" name="minutes" required min={1} max={MAX_NAFS_MINUTES} defaultValue={g.minutes ?? ""} className={`${SEL} w-24`} /></label>
                    <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Opens (optional)")}<input type="datetime-local" name="openAt" defaultValue={local(g.openAt)} className={SEL} /></label>
                    <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Due (optional)")}<input type="datetime-local" name="dueAt" defaultValue={local(g.dueAt)} className={SEL} /></label>
                    <button className="min-h-10 rounded-lg px-3 font-semibold text-ink ring-1 ring-line">{t("Save the changes")}</button>
                  </form>
                  <LiveTimePanel t={t} action={nafsTimeAction} hidden={{ testId: id, classId: g.classId }} id={`time-${g.classId}`} minutes={g.minutes} endsAt={g.endsAt} extra={g.extra} roster={g.roster} inProgress={g.inProgress} />
                </li>
              ))}
            </ul>
          )}
          {written > 0 && <p className="mt-3 text-sm text-ink-2">✍ {t("{n} short written answer(s) in this test: score them in the Marking tab.", { n: written })} <Link href={`/teacher/nafs?tab=marking&test=${id}`} className="font-semibold text-teal-ink underline">{t("Marking")}</Link></p>}
        </section>
        <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
          <h2 className="text-lg font-semibold text-ink">🖨 {t("On paper")}</h2>
          <p className="mt-1 text-sm text-ink-2">{t("Print the booklet and one bubble sheet per student, then grade the sheets with the phone camera or type the answers.")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/teacher/nafs/tests/${id}/print`} className={LINK}>📘 {t("Print test")}</Link>
            <Link href={`/teacher/nafs/tests/${id}/print?key=1`} className={LINK}>🔑 {t("Answer key")}</Link>
          </div>
          {classes.length > 0 && (
            <form method="get" action="/teacher/nafs/sheets" className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="test" value={id} />
              <div className="grid min-w-48 gap-1 text-xs font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="class" required label={t("Class")} defaultValue={first} options={classes.map((c) => ({ value: c.id, label: c.name, hint: t("{n} students", { n: c.students.length }) }))} /></div>
              <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Print bubble sheets")}</button>
              <button name="blank" value="1" className={LINK}>{t("Blank sheets")}</button>
              <button name="go" value="grade" className="min-h-11 rounded-xl bg-teal-700 px-4 font-semibold text-white">📷 {t("Grade bubble sheets")}</button>
              <button name="go" value="type" className={LINK}>⌨ {t("Type answers")}</button>
            </form>
          )}
        </section>
      </div>
      <section className="mt-4 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <h2 className="text-lg font-semibold text-ink">{t("The questions")}</h2>
        <ol className="mt-2 divide-y divide-line">
          {rows.map((r, i) => (
            <li key={r.id} className="py-2">
              {r.passageId && rows[i - 1]?.passageId !== r.passageId && <p className="text-xs font-semibold text-teal-ink">📄 {r.passageTitle}</p>}
              <p className="text-sm text-ink" lang="en" dir="ltr"><b>{r.n}.</b> <RichInline text={r.stem} /></p>
              <p className="text-xs text-muted">{r.standard ? <b className="me-1 text-ink-2">{codeName(r.standard, t)} ·</b> : null}{t(r.skill)} · {codeName(r.process, t)} · {r.kind === "WRITTEN" ? `✍ ${t("Short written answer")}` : `${t("Answer")}: ${"ABCD"[r.correct]}`} · {t("{n} marks", { n: markOf(test.marks, r.id) })}</p>
            </li>
          ))}
        </ol>
      </section>
      {test.canEdit && (
        <form action={deleteTestAction} className="mt-4">
          <input type="hidden" name="id" value={id} />
          <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">{t("Remove this test")}</button>
        </form>
      )}
    </AppShell>
  );
}
