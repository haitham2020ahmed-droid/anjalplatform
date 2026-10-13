import Link from "next/link";
import type { TFn } from "@/i18n";
import { ReportSection } from "@/components/report-kit";
import { EmptyState } from "@/components/ui-kit";
import { BTN_MAIN } from "@/components/plans/plan-builder";
import { repo } from "@/server/auth/next";
import type { Actor } from "@/server/auth/rbac";
import { readableClasses } from "@/server/teacher/coordinators";
import { studentNames } from "@/server/insights/student-data";
import { DEFAULT_ITEMS, groupsOf, mapTestList, seasonFor, type TestStatus } from "@/server/map/map-test";
import type { Subject } from "@/server/map/map-plan";
import { createMapTestAction } from "./test-actions";
import { mapTestHref } from "./href";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
export const STATUS_CHIP: Record<TestStatus, string> = { open: "bg-emerald-50 text-emerald-800 ring-emerald-200", closed: "bg-slate-100 text-slate-700 ring-slate-200", draft: "bg-amber-50 text-amber-900 ring-amber-200", scheduled: "bg-sky-50 text-sky-800 ring-sky-200" };
export const STATUS_LABEL: Record<TestStatus, string> = { open: "Open", closed: "Closed", draft: "Draft", scheduled: "Not open yet" };
const box = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-2";

/**
 * MAP → MAP Test: the subject switch (the page's Reading | Language Usage pills), two big buttons — an automatic test
 * (adaptive, simulates MAP Growth) and a manual test — and the list of the teacher's MAP tests (and the admin's
 * school-wide windows). A click opens the test's own page (details and reports together).
 */
export async function TestTab({ actor, t, sp, subject }: { actor: Actor; t: TFn; sp: SP; classId: string; subject: Subject }) {
  const [rows, classes] = await Promise.all([mapTestList(repo, actor, subject), readableClasses(repo, actor)]);
  const own = classes.map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const members = own.length ? await repo.findMany("ClassMembership", { classId: { in: own.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"], take: 3000 }) : [];
  const names = await studentNames(repo, [...new Set(members.map((m) => String(m.studentId)))]);
  const roster = own.map((c) => ({ ...c, students: members.filter((m) => m.classId === c.id).map((m) => ({ id: String(m.studentId), name: names.get(String(m.studentId))?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)) }));
  const open = one(sp.new);
  const today = new Date().toISOString().slice(0, 10), in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const groups = groupsOf(subject);
  const even = Math.floor(100 / groups.length);
  const season = seasonFor(new Date());

  const who = (
    <fieldset className="sm:col-span-3">
      <legend className="font-semibold">{t("Who")}</legend>
      <div className="mt-1 flex flex-wrap gap-3">{roster.map((c) => <label key={c.id} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" name="classIds" value={c.id} defaultChecked={roster.length === 1} /> <bdi>{c.name}</bdi></label>)}</div>
      <details className="mt-1">
        <summary className="cursor-pointer text-sm text-slate-600">{t("Only some students (leave empty for the whole class)")}</summary>
        <div className="mt-2 grid gap-1 sm:grid-cols-3">{roster.flatMap((c) => c.students.map((st) => <label key={`${c.id}${st.id}`} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="studentIds" value={st.id} /> <bdi>{st.name}</bdi> <span className="text-xs text-slate-500">{c.name}</span></label>))}</div>
      </details>
    </fieldset>
  );
  const dates = (
    <>
      <label className="font-semibold">{t("Opens")}<input name="opensAt" type="date" defaultValue={today} required className={box} /></label>
      <label className="font-semibold">{t("Closes")}<input name="closesAt" type="date" defaultValue={in14} required className={box} /></label>
    </>
  );
  const big = "flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-lg font-bold";

  return (
    <>
      <div className="mb-5 grid gap-3 md:grid-cols-2 print:hidden">
        <details open={open === "auto"} className="rounded-3xl bg-white shadow-card ring-1 ring-slate-200 open:md:col-span-2">
          <summary className={`${big} bg-brand-navy text-white`}><span>🧭 {t("Automatic MAP test (simulates MAP Growth)")}</span><span aria-hidden="true">＋</span></summary>
          <form action={createMapTestAction} className="grid gap-3 p-5 text-sm sm:grid-cols-3">
            <input type="hidden" name="kind" value="AUTO" /><input type="hidden" name="subject" value={subject} />
            <p className="text-slate-600 sm:col-span-3">{t("Like MAP Growth: it starts at each student's latest MAP RIT, every answer moves the estimate, the next question is the closest one inside the goal-area blueprint. One question per screen, no going back, no right / wrong, untimed, two sittings allowed, rapid guesses flagged.")}</p>
            <label className="font-semibold sm:col-span-2">{t("Title")}<input name="title" placeholder={t("MAP Test · before Winter")} className={box} /></label>
            <label className="font-semibold">{t("Questions")}<input name="items" type="number" min={20} max={60} defaultValue={DEFAULT_ITEMS[subject]} className={box} /></label>
            {who}
            {dates}
            <label className="font-semibold">{t("Before")}<select name="season" defaultValue={season} className={box}><option value="WINTER">{t("Winter MAP")}</option><option value="SPRING">{t("Spring MAP")}</option><option value="FALL">{t("Fall MAP")}</option></select></label>
            <fieldset className="sm:col-span-3"><legend className="font-semibold">{t("Share of each goal area (%)")}</legend>
              <div className="mt-1 flex flex-wrap gap-3">{groups.map((g, i) => <label key={g.key} className="text-sm">{g.icon} {t(g.name)}<input name={`share_${g.key}`} type="number" min={0} max={100} defaultValue={even + (i < 100 - even * groups.length ? 1 : 0)} className="mt-1 block min-h-11 w-24 rounded-lg border border-slate-300 px-2" /></label>)}</div>
            </fieldset>
            <p className="text-xs text-slate-500 sm:col-span-3">{t("After it is made you can see the pool of each goal area and take any question out.")}</p>
            <button className={`${BTN_MAIN} sm:col-span-3 sm:justify-self-start`}>{t("Make the automatic test")}</button>
          </form>
        </details>
        <details open={open === "manual"} className="rounded-3xl bg-white shadow-card ring-1 ring-slate-200 open:md:col-span-2">
          <summary className={`${big} bg-white text-brand-navy ring-2 ring-brand-navy`}><span>📝 {t("Manual test")}</span><span aria-hidden="true">＋</span></summary>
          <form action={createMapTestAction} className="grid gap-3 p-5 text-sm sm:grid-cols-3">
            <input type="hidden" name="kind" value="MANUAL" /><input type="hidden" name="subject" value={subject} />
            <p className="text-slate-600 sm:col-span-3">{t("A fixed MAP-style test: choose the goal areas, the number of questions and a RIT band; “Suggest for me” builds it from the bank's MAP questions, then you can replace, remove, reorder or add questions, preview it as students see it, and assign it online or print it.")}</p>
            <label className="font-semibold sm:col-span-3">{t("Title")}<input name="title" placeholder={t("MAP Test · before Winter")} className={box} /></label>
            <fieldset className="sm:col-span-3"><legend className="font-semibold">{t("Goal areas")}</legend>
              <div className="mt-1 flex flex-wrap gap-3">{groups.map((g) => <label key={g.key} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" name="areas" value={g.key} defaultChecked /> {g.icon} {t(g.name)}</label>)}</div>
            </fieldset>
            <label className="font-semibold">{t("Questions")}<input name="count" type="number" min={5} max={60} defaultValue={20} className={box} /></label>
            <label className="font-semibold">{t("RIT from")}<input name="ritLow" type="number" min={120} max={320} defaultValue={190} className={box} /></label>
            <label className="font-semibold">{t("RIT to")}<input name="ritHigh" type="number" min={120} max={320} defaultValue={225} className={box} /></label>
            {who}
            {dates}
            <label className="font-semibold">{t("Before")}<select name="season" defaultValue={season} className={box}><option value="WINTER">{t("Winter MAP")}</option><option value="SPRING">{t("Spring MAP")}</option><option value="FALL">{t("Fall MAP")}</option></select></label>
            <button className={`${BTN_MAIN} sm:col-span-3 sm:justify-self-start`}>✨ {t("Suggest for me")}</button>
          </form>
        </details>
      </div>

      <ReportSection title="My MAP tests" icon="🗂️" hint={t("Click a test to see its details, progress and reports.")}>
        {!rows.length ? <EmptyState compact icon="🧭" title="No MAP tests yet" text="Make an automatic or a manual MAP test above." /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-start text-sm">
              <thead><tr className="border-b text-xs text-slate-500"><th className="py-2 pe-3 text-start">{t("Test")}</th><th className="px-2 text-start">{t("Type")}</th><th className="px-2 text-start">{t("Class")}</th><th className="px-2 text-start">{t("Dates")}</th><th className="px-2 text-start">{t("Status")}</th><th className="px-2 text-start">{t("Finished")}</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-b align-top last:border-0">
                  <td className="py-2 pe-3"><Link href={mapTestHref(r.id, { subject })} className="font-semibold text-brand-navy hover:underline"><bdi>{r.title}</bdi></Link>{r.schoolWide && <span className="ms-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t("School-wide")}</span>}</td>
                  <td className="px-2">{r.kind === "AUTO" ? t("Automatic") : t("Manual")}</td>
                  <td className="px-2"><bdi>{r.classes.join(", ")}</bdi></td>
                  <td className="px-2 tabular-nums" dir="ltr">{r.opensAt.slice(0, 10)} → {r.closesAt.slice(0, 10)}</td>
                  <td className="px-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_CHIP[r.status]}`}>{t(STATUS_LABEL[r.status])}</span></td>
                  <td className="px-2 tabular-nums">{t("{x} of {y}", { x: r.finished, y: r.total })}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </ReportSection>
      <p className="mt-2 text-xs text-slate-500">{t("Estimated RIT — NWEA items and calibration are not available")}</p>
    </>
  );
}
