import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { nafsClasses } from "@/server/nafs/tests";
import { DEFAULT_PRACTICE_QUESTIONS, listNafsPractice, MAX_PRACTICE_QUESTIONS, nafsPracticeReport } from "@/server/nafs/practice";
import { CONTENT_SKILLS, MOE_AREAS, MOE_STANDARDS, NAFS_DOMAINS } from "@/server/nafs/framework";
import { createPracticeAction, deletePracticeAction } from "@/app/teacher/nafs/actions";
import { Combo } from "@/components/ui/combo";
import { PracticeReportView } from "./practice-report";
import { TargetChecklist } from "./target-checklist";
import { DifficultyPicker } from "./difficulty-picker";
import { nafsGroups } from "./builder-starts";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line";
const INPUT = "min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line";

/**
 * 🇸🇦 NAFS center — Tool 1: Adaptive practice. Give it (NAFS skills / Ministry standards, or the questions chosen in the
 * Question bank; a Grade 6 class or chosen students; optional number of questions, time, due date), see the list, and
 * open one: per student and skill the difficulty reached, accuracy, secure or not, time spent.
 */
export async function PracticeTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const [list, classes] = await Promise.all([listNafsPractice(repo, actor), nafsClasses(repo, actor)]);
  // the questions ticked in the Question bank (?pick=…&pick=… or a comma list)
  const raw = sp.pick as unknown;
  const picked = [...new Set((Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(",")).map((x) => x.trim()).filter(Boolean))].slice(0, 120);
  // prefilled from the Dashboard ("Assign adaptive practice on these standards"): ?class=…&target=…&sid=…
  const list0 = (v: unknown) => [...new Set((Array.isArray(v) ? v.map(String) : String(v ?? "").split(",")).map((x) => x.trim()).filter(Boolean))];
  const preTargets = new Set(list0(sp.target as unknown).slice(0, 26));
  const preClass = classes.find((c) => c.id === sp.class)?.id;
  const preSids = list0(sp.sid as unknown).filter((id) => classes.some((c) => c.id === preClass && c.students.some((x) => x.id === id)));
  const open = sp.open ? await nafsPracticeReport(repo, actor, sp.open).catch(() => null) : null;
  return (
    <div className="grid gap-4">
      {open && <PracticeReportView r={open} t={t} closeHref="/teacher/nafs?tab=practice" />}
      <section className={CARD} aria-labelledby="pl-h">
        <h2 id="pl-h" className="text-lg font-semibold text-ink">{t("Adaptive practice given")}</h2>
        {!list.length ? <p className="mt-3 rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t("No adaptive practice yet. Give the first one below.")}</p> : (
          <ul className="mt-2 divide-y divide-line">
            {list.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{x.title} {!x.open && <span className="ms-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted ring-1 ring-line">{t("Closed")}</span>}</p>
                  <p className="text-sm text-muted">{x.className} · {t("{n} students", { n: x.students })} · {t("{n} started", { n: x.started })} · {t("{n} finished", { n: x.finished })} · {t("{n} mastered every skill", { n: x.allMastered })}{x.dueAt ? ` · ${t("Due {date}", { date: new Date(x.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) })}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/teacher/nafs?tab=practice&open=${encodeURIComponent(x.id)}`} className="inline-flex min-h-10 items-center rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white">{t("Results")}</Link>
                  {x.mine && <form action={deletePracticeAction}><input type="hidden" name="id" value={x.id} /><button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">{t("Remove")}</button></form>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="give" className={`${CARD} ring-2 ring-teal-200`} aria-labelledby="give-h">
        <h2 id="give-h" className="text-lg font-semibold text-ink">🎯 {t("Give adaptive practice")}</h2>
        <p className="mt-1 text-sm text-ink-2">{t("Each student starts at Medium. A right answer → a harder question; a wrong answer → an easier one, inside the skills you choose. A skill is mastered when 4 of the last 5 answers are right (at least 2 of them Medium or Hard). The practice stops when every skill is mastered or at the number of questions. Nothing here changes the student's platform levels.")}</p>
        {!classes.length ? <p className="mt-3 rounded-xl bg-surface-2 p-4 text-sm text-muted">{t("You have no Grade 6 class yet.")}</p> : (
          <form action={createPracticeAction} className="mt-3 grid gap-4">
            {picked.map((id) => <input key={id} type="hidden" name="pick" value={id} />)}
            <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Name")}<input name="title" required maxLength={150} defaultValue={t("NAFS practice")} className={INPUT} /></label>
            {preTargets.size > 0 && !picked.length && <p className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">{t("Prefilled from the Dashboard: check the standards and the students, then give the practice.")}</p>}
            {picked.length > 0 ? (
              <p className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">{t("{n} chosen question(s) from the Question bank: the practice adapts inside them.", { n: picked.length })} <Link href="/teacher/nafs?tab=practice#give" className="font-semibold underline">{t("Clear")}</Link></p>
            ) : (
              <TargetChecklist name="target" pickName="pick" mcqOnly defaultValue={[...preTargets]} legend="What to practise"
                groups={nafsGroups({ areas: MOE_AREAS, standards: MOE_STANDARDS, domains: NAFS_DOMAINS.filter((d) => d.code !== "PIRLS"), skills: CONTENT_SKILLS }, t)} />
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-56 gap-1 text-sm font-semibold text-ink-2"><span>{t("Class")}</span>
                <Combo name="classId" required label={t("Class")} defaultValue={preClass ?? classes[0].id} options={classes.map((c) => ({ value: c.id, label: c.name, hint: t("{n} students", { n: c.students.length }) }))} />
              </div>
              <div className="grid min-w-60 flex-1 gap-1 text-sm font-semibold text-ink-2"><span>{t("Only these students (optional)")}</span>
                <Combo multiple name="sid" label={t("Only these students (optional)")} defaultValue={preSids} placeholder={t("The whole class")}
                  options={classes.flatMap((c) => c.students.map((x) => ({ value: x.id, label: x.name, group: c.name })))} />
              </div>
            </div>
            <DifficultyPicker name="difficulty" defaultValue="ADAPTIVE" allow={["ADAPTIVE", "1", "2", "3", "MIX", "ANY"]}
              adaptiveNote="Recommended: each student starts at Medium; a right answer brings a harder question, a wrong answer an easier one. A fixed difficulty keeps the practice to questions of that difficulty." />
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Questions per student")}<input type="number" name="max" min={1} max={MAX_PRACTICE_QUESTIONS} placeholder={String(DEFAULT_PRACTICE_QUESTIONS)} className={`${INPUT} w-28`} /></label>
              <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Time (minutes, optional)")}<input type="number" name="minutes" min={1} max={120} className={`${INPUT} w-28`} /></label>
              <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Due date (optional)")}<input type="date" name="dueAt" className={INPUT} /></label>
              <button className="min-h-11 rounded-xl bg-teal-700 px-6 font-semibold text-white">{t("Give the practice")}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
