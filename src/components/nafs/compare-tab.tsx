import Link from "next/link";
import type { ReactNode } from "react";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { nafsClasses } from "@/server/nafs/tests";
import { studentHref } from "@/server/nafs/dashboard";
import { DIFFICULTY_NAME } from "@/server/nafs/framework";
import {
  ARROW_MARK, ARROW_NAME, ARROW_RULE, CASE_BY_KEY, CASES, COMPARE_MODES, cleanMode, compareDownload, compareHref, nafsCompareAll, nafsComparePractice, nafsCompareTests, COMPARE_TIPS as TIPS, PRACTICE_MIN, showClasses,
  type AllCompare, type Arrow, type ClassCompareRow, type CompareMode, type CompareQuery, type PracticeCompare, type TestsCompare,
} from "@/server/nafs/compare";
import { compareAllSummary, comparePracticeSummary, compareTestsSummary, oneLineAll, oneLineUpDown } from "@/lib/nafs-compare-summary";
import type { Line } from "@/lib/report-summary";
import { AtAGlance, InfoTip, ReportIntro, ReportSummary } from "@/components/report-kit";
import { PrintButton } from "@/components/plans/print-button";
import { Combo } from "@/components/ui/combo";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:break-inside-avoid print:p-2 print:shadow-none";
const SEL = "min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line";
const ARROW_CLS: Record<Arrow, string> = { UP: "bg-emerald-50 text-emerald-900 ring-emerald-300", SAME: "bg-slate-50 text-slate-700 ring-slate-300", DOWN: "bg-rose-50 text-rose-900 ring-rose-300" };
const CHANGE_CLS = (v: number | null) => (v === null ? "text-muted" : v >= 5 ? "text-emerald-700" : v <= -5 ? "text-rose-700" : "text-ink-2");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });


function ArrowPill({ a, t }: { a: Arrow | null; t: TFn }) {
  if (!a) return <span className="text-xs text-muted">—</span>;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${ARROW_CLS[a]}`}><span aria-hidden="true">{ARROW_MARK[a]}</span>{t(ARROW_NAME[a])}</span>;
}
const Pct = ({ v }: { v: number | null }) => <span className="tabular-nums">{v === null ? "—" : `${v}%`}</span>;
const Change = ({ v }: { v: number | null }) => <span className={`font-semibold tabular-nums ${CHANGE_CLS(v)}`} dir="ltr">{v === null ? "—" : v > 0 ? `+${v}` : `${v}`}</span>;
const Th = ({ children, tip, start }: { children: ReactNode; tip?: string; start?: boolean }) => <th className={`py-2 ${start ? "text-start" : "text-center"}`}><span className="inline-flex items-center gap-1">{children}{tip ? <InfoTip text={tip} /> : null}</span></th>;

function OneLine({ l, t }: { l: Line; t: TFn }) {
  const tone = l.tone === "help" ? "bg-amber-50 text-amber-950 ring-amber-200" : l.tone === "good" ? "bg-emerald-50 text-emerald-950 ring-emerald-200" : "bg-surface text-ink ring-line";
  return (
    <p className={`rounded-2xl px-5 py-4 text-lg leading-snug ring-1 print:py-2 print:text-base ${tone}`} data-rk="one-line">
      <b className="me-1">{t("In one line")}:</b>{t(l.key, l.vars)}
    </p>
  );
}

/**
 * 🇸🇦 NAFS center → Reports → COMPARE (owner r75): did the students go UP or DOWN? A toggle at the top — Tests &
 * Booklets · Practice · All — then "In one line", 4 big numbers, one simple table (≤ 6 columns; the rest under "More
 * details"), and the summary with its action plan at the end. Teacher-facing only (students never see this page).
 */
export async function CompareView({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const classes = await nafsClasses(repo, actor);
  const mode = cleanMode(sp.mode);
  const classId = classes.find((c) => c.id === sp.class)?.id ?? null;
  const admin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  const opts = { classId, a: sp.a ?? null, b: sp.b ?? null, from: sp.from, to: sp.to, preset: sp.preset };
  const q = (m: CompareMode): CompareQuery => ({ mode: m, classId, a: sp.a ?? null, b: sp.b ?? null, from: sp.from ?? null, to: sp.to ?? null, preset: sp.preset ?? null });
  const many = showClasses(actor, classId, classes.length);
  const ctx = { classId, admin };
  const data = mode === "practice" ? { mode, r: await nafsComparePractice(repo, actor, opts) } as const
    : mode === "all" ? { mode, r: await nafsCompareAll(repo, actor, opts) } as const
    : { mode, r: await nafsCompareTests(repo, actor, opts) } as const;
  const tests = data.mode === "tests" ? data.r : data.mode === "all" ? data.r.tests : null;
  const practice = data.mode === "practice" ? data.r : data.mode === "all" ? data.r.practice : null;
  const intro = mode === "practice" ? "Did each student's practice go up or down? The first two weeks against the last two weeks." : mode === "all" ? "Tests and practice together: one line per student with what it means and what to do." : "Did each student go up or down between two NAFS tests or Ministry booklets? Only the standards both have are compared.";
  return (
    <div className="grid gap-4 print:gap-2 print:text-[12px]" data-testid="nafs-compare">
      <style>{"@media print { @page { size: A4; margin: 10mm } }"}</style>
      <nav aria-label={t("Compare")} className="flex flex-wrap gap-1.5 print:hidden">
        {COMPARE_MODES.map((m) => (
          <Link key={m.key} href={compareHref(q(m.key))} aria-current={mode === m.key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-xl px-5 text-base font-semibold ring-1 ${mode === m.key ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-ink-2 ring-line hover:bg-surface-2"}`}>{t(m.label)}</Link>
        ))}
      </nav>
      <ReportIntro text={intro} className="mb-0" />
      <form method="get" action="/teacher/nafs" className={`${CARD} flex flex-wrap items-end gap-3 print:hidden`}>
        <input type="hidden" name="tab" value="reports" /><input type="hidden" name="view" value="compare" /><input type="hidden" name="mode" value={mode} />
        <div className="grid min-w-52 gap-1 text-sm font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="class" label={t("Class")} defaultValue={classId ?? ""} options={[{ value: "", label: admin ? t("All Grade 6 classes (the school)") : t("All my Grade 6 classes") }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} /></div>
        {tests && tests.options.length > 0 && <>
          <div className="grid min-w-60 gap-1 text-sm font-semibold text-ink-2"><span>{t("Assessment 1 (before)")}</span><Combo name="a" label={t("Assessment 1 (before)")} defaultValue={tests.a?.id ?? ""} options={tests.options.map((x) => ({ value: x.id, label: x.title, hint: `${t(x.kind === "BOOKLET" ? "Ministry booklet" : "NAFS test")} · ${day(x.date)}` }))} /></div>
          <div className="grid min-w-60 gap-1 text-sm font-semibold text-ink-2"><span>{t("Assessment 2 (after)")}</span><Combo name="b" label={t("Assessment 2 (after)")} defaultValue={tests.b?.id ?? ""} options={tests.options.map((x) => ({ value: x.id, label: x.title, hint: `${t(x.kind === "BOOKLET" ? "Ministry booklet" : "NAFS test")} · ${day(x.date)}` }))} /></div>
        </>}
        {practice && <>
          <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Compare")}
            <select name="preset" defaultValue={practice.preset} className={SEL}><option value="edges">{t("First 2 weeks vs last 2 weeks")}</option><option value="month">{t("Last month vs this month")}</option></select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("From")}<input type="date" name="from" defaultValue={practice.preset === "edges" ? practice.range.from : ""} className={SEL} /></label>
          <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("To")}<input type="date" name="to" defaultValue={practice.preset === "edges" ? practice.range.to : ""} className={SEL} /></label>
        </>}
        <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        <a href={compareDownload("xlsx", q(mode))} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">⬇ {t("Excel")}</a>
        <a href={compareDownload("pdf", q(mode))} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">⬇ {t("PDF")}</a>
        <PrintButton label={t("Print")} />
      </form>
      {data.mode === "tests" && <TestsView r={data.r} t={t} many={many} ctx={ctx} />}
      {data.mode === "practice" && <PracticeView r={data.r} t={t} many={many} ctx={ctx} />}
      {data.mode === "all" && <AllView r={data.r} t={t} many={many} ctx={ctx} />}
      <p className="text-xs text-muted">{t("Teacher-facing only: students never see these words.")} {t(ARROW_RULE)}</p>
    </div>
  );
}

type Ctx = { classId: string | null; admin: boolean };

function ClassesTable({ rows, t, before = "Before", after = "After" }: { rows: ClassCompareRow[]; t: TFn; before?: string; after?: string }) {
  if (rows.length < 2) return null;
  return (
    <section className={CARD} aria-labelledby="cmp-cls">
      <h2 id="cmp-cls" className="text-lg font-semibold text-ink">{t("Classes compared")}</h2>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[30rem] text-sm">
        <thead><tr className="text-xs text-muted"><Th start>{t("Class")}</Th><Th>{t("Students compared")}</Th><Th tip={TIPS.before}>{t(before)}</Th><Th tip={TIPS.after}>{t(after)}</Th><Th>{ARROW_MARK.UP} {t("Went up")}</Th><Th>{ARROW_MARK.DOWN} {t("Went down")}</Th></tr></thead>
        <tbody className="divide-y divide-line">{rows.map((c) => <tr key={c.classId}><td className="py-2 font-semibold text-ink">{c.name}</td><td className="text-center tabular-nums">{c.compared}</td><td className="text-center"><Pct v={c.before} /></td><td className="text-center"><Pct v={c.after} /></td><td className="text-center tabular-nums text-emerald-800">{c.improved}</td><td className="text-center tabular-nums text-rose-800">{c.dropped}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}

function Counts({ r, t, label, meaning }: { r: { avgBefore: number | null; avgAfter: number | null; improved: number; same: number; dropped: number }; t: TFn; label: string; meaning: string }) {
  return (
    <AtAGlance title={null} className="mb-0" items={[
      { label, icon: "📊", value: `${r.avgBefore ?? "—"}% → ${r.avgAfter ?? "—"}%`, meaning: t(meaning), tone: "info" },
      { label: "Went up", icon: ARROW_MARK.UP, value: r.improved, meaning: t("5 points or more higher"), tone: r.improved ? "good" : "neutral" },
      { label: "Same", icon: ARROW_MARK.SAME, value: r.same, meaning: t("less than 5 points apart"), tone: "neutral" },
      { label: "Went down", icon: ARROW_MARK.DOWN, value: r.dropped, meaning: t("5 points or more lower"), tone: r.dropped ? "bad" : "neutral" },
    ]} />
  );
}

function TestsView({ r, t, many, ctx }: { r: TestsCompare; t: TFn; many: boolean; ctx: Ctx }) {
  if (r.options.length < 2) return <><OneLine l={oneLineUpDown(r)} t={t} /><p className={`${CARD} text-sm text-muted`}>{t("Two NAFS tests or booklets with results are needed to compare. Give a second one, then come back.")}</p></>;
  const total = r.shared.length + r.onlyA.length + r.onlyB.length;
  return (
    <>
      <OneLine l={oneLineUpDown(r)} t={t} />
      <p className="text-sm text-ink-2">{t("Comparing")} <b>{r.a?.title}</b> ({day(r.a!.date)}) → <b>{r.b?.title}</b> ({day(r.b!.date)}) · {t("Standards in both")}: <b dir="ltr">{r.shared.map((c) => c.replace("MOE.", "")).join(", ") || "—"}</b> <InfoTip text={TIPS.shared} /></p>
      {r.fewShared && <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-300" data-testid="few-shared">⚠️ {r.shared.length ? t("Careful: the two share only {n} of {total} standards, so the change uses those {n} only.", { n: r.shared.length, total }) : t("Careful: the two share no standard, so the whole-test scores are compared.")}</p>}
      <Counts r={r} t={t} label="Class average" meaning="before → after" />
      <section className={CARD} aria-labelledby="cmp-st">
        <h2 id="cmp-st" className="text-lg font-semibold text-ink">{t("Students")} <span className="text-sm font-normal text-muted">({t("lowest change first")})</span></h2>
        {!r.rows.length ? <p className="mt-2 text-sm text-muted">{t("No student has results in both yet.")}</p> : (
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[32rem] text-sm">
            <thead><tr className="text-xs text-muted"><Th start>{t("Student")}</Th><Th tip={TIPS.before}>{t("Before")}</Th><Th tip={TIPS.after}>{t("After")}</Th><Th tip={TIPS.change}>{t("Change")}</Th><Th tip={TIPS.arrow}>{t("Up or down")}</Th><Th tip={TIPS.whole}>{t("Whole test change")}</Th></tr></thead>
            <tbody className="divide-y divide-line">{r.rows.map((x) => (
              <tr key={x.id} data-arrow={x.arrow ?? ""}>
                <td className="py-2"><Link href={studentHref(x.id)} className="font-semibold text-ink hover:underline">{x.name}</Link>{many ? <span className="block text-xs text-muted">{x.className}</span> : null}</td>
                <td className="text-center"><Pct v={x.before} /></td><td className="text-center"><Pct v={x.after} /></td>
                <td className="text-center"><Change v={x.change} /></td><td className="text-center"><ArrowPill a={x.arrow} t={t} /></td>
                <td className="text-center"><Change v={x.wholeChange} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {r.rows.length > 0 && <details className="mt-3 print:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-ink">{t("More details")}: {t("the whole test and the shared standards")}</summary>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[36rem] text-sm">
            <thead><tr className="text-xs text-muted"><Th start>{t("Student")}</Th><Th>{t("Class")}</Th><Th>{t("Whole test before")}</Th><Th>{t("Whole test after")}</Th><Th>{t("Shared standards before")}</Th><Th>{t("Shared standards after")}</Th></tr></thead>
            <tbody className="divide-y divide-line">{r.rows.map((x) => <tr key={x.id}><td className="py-2 text-ink">{x.name}</td><td className="text-center text-xs">{x.className}</td><td className="text-center"><Pct v={x.wholeBefore} /></td><td className="text-center"><Pct v={x.wholeAfter} /></td><td className="text-center"><Pct v={x.sharedBefore} /></td><td className="text-center"><Pct v={x.sharedAfter} /></td></tr>)}</tbody>
          </table></div>
        </details>}
      </section>
      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2 print:gap-2">
        <section className={CARD} aria-labelledby="cmp-std">
          <h2 id="cmp-std" className="text-lg font-semibold text-ink">{t("Standards")}</h2>
          <p className="mt-2 text-sm text-ink-2"><b className="text-emerald-800">{ARROW_MARK.UP} {t("Most improved standard")}:</b> {r.mostImproved ? <><b dir="ltr">{r.mostImproved.short}</b> {t(r.mostImproved.text)} (<Pct v={r.mostImproved.before} /> → <Pct v={r.mostImproved.after} />)</> : t("none went up by 5 points or more")}</p>
          <p className="mt-1 text-sm text-ink-2"><b className="text-rose-800">{ARROW_MARK.DOWN} {t("Most dropped standard")}:</b> {r.mostDropped ? <><b dir="ltr">{r.mostDropped.short}</b> {t(r.mostDropped.text)} (<Pct v={r.mostDropped.before} /> → <Pct v={r.mostDropped.after} />)</> : t("none went down by 5 points or more")}</p>
        </section>
        <section className={CARD} aria-labelledby="cmp-only">
          <h2 id="cmp-only" className="flex items-center gap-1 text-lg font-semibold text-ink">{t("Took only one of the two")} <InfoTip text={TIPS.only} /></h2>
          {!r.onlyOne.length ? <p className="mt-2 text-sm text-muted">{t("Everyone took both.")}</p> : <ul className="mt-2 grid gap-1 text-sm" data-testid="only-one">{r.onlyOne.map((x) => <li key={x.id}><b className="text-ink">{x.name}</b> <span className="text-muted">· {t("took")} {(x.took === "A" ? r.a?.title : r.b?.title) ?? "—"} (<Pct v={x.pct} />)</span></li>)}</ul>}
          {r.neither.length > 0 && <p className="mt-2 text-xs text-muted">{t("{n} students took neither.", { n: r.neither.length })}</p>}
        </section>
      </div>
      {many && <ClassesTable rows={r.classes} t={t} />}
      <ReportSummary summary={compareTestsSummary(r, ctx)} />
    </>
  );
}

const lvl = (x: number, t: TFn) => (x ? t(DIFFICULTY_NAME[x as 1 | 2 | 3]) : "—");

function PracticeView({ r, t, many, ctx }: { r: PracticeCompare; t: TFn; many: boolean; ctx: Ctx }) {
  return (
    <>
      <OneLine l={oneLineUpDown(r)} t={t} />
      <p className="text-sm text-ink-2">{t("Period 1 (before)")}: <b dir="ltr">{r.a.from} → {r.a.to}</b> · {t("Period 2 (after)")}: <b dir="ltr">{r.b.from} → {r.b.to}</b>{r.guesses + r.unreliable > 0 ? <> · {t("{n} answers were left out (quick guesses).", { n: r.guesses + r.unreliable })}</> : null}</p>
      <Counts r={r} t={t} label="Accuracy" meaning="class average, before → after" />
      <section className={CARD} aria-labelledby="cmp-pst">
        <h2 id="cmp-pst" className="text-lg font-semibold text-ink">{t("Students")} <span className="text-sm font-normal text-muted">({t("lowest change first")})</span></h2>
        {!r.rows.length ? <p className="mt-2 text-sm text-muted">{t("No student practised enough in both periods yet.")}</p> : (
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[34rem] text-sm">
            <thead><tr className="text-xs text-muted"><Th start>{t("Student")}</Th><Th tip={TIPS.accuracy}>{t("Accuracy")}</Th><Th tip={TIPS.change}>{t("Change")}</Th><Th tip={TIPS.arrow}>{t("Up or down")}</Th><Th tip={TIPS.level}>{t("Hardest level")}</Th><Th tip={TIPS.mastered}>{t("Mastered")}</Th></tr></thead>
            <tbody className="divide-y divide-line">{r.rows.map((x) => (
              <tr key={x.id} data-arrow={x.arrow ?? ""}>
                <td className="py-2"><Link href={studentHref(x.id)} className="font-semibold text-ink hover:underline">{x.name}</Link>{many ? <span className="block text-xs text-muted">{x.className}</span> : null}</td>
                <td className="text-center whitespace-nowrap"><Pct v={x.a.pct} /> → <Pct v={x.b.pct} /></td>
                <td className="text-center"><Change v={x.change} /></td><td className="text-center"><ArrowPill a={x.arrow} t={t} /></td>
                <td className="text-center whitespace-nowrap">{lvl(x.a.best, t)} → {lvl(x.b.best, t)}</td>
                <td className="text-center tabular-nums">{x.a.mastered} → {x.b.mastered}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {r.rows.length > 0 && <details className="mt-3 print:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-ink">{t("More details")}: {t("answers and quick guesses per period")}</summary>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[34rem] text-sm">
            <thead><tr className="text-xs text-muted"><Th start>{t("Student")}</Th><Th>{t("Class")}</Th><Th>{t("Answers before")}</Th><Th>{t("Answers after")}</Th><Th>{t("Quick guesses left out")}</Th></tr></thead>
            <tbody className="divide-y divide-line">{r.rows.map((x) => <tr key={x.id}><td className="py-2 text-ink">{x.name}</td><td className="text-center text-xs">{x.className}</td><td className="text-center tabular-nums">{x.a.answers}</td><td className="text-center tabular-nums">{x.b.answers}</td><td className="text-center tabular-nums">{x.a.guesses + x.b.guesses}</td></tr>)}</tbody>
          </table></div>
        </details>}
      </section>
      {r.tooFew.length > 0 && <section className={CARD} aria-labelledby="cmp-few">
        <h2 id="cmp-few" className="text-lg font-semibold text-ink">{t("Not enough practice to compare yet")}</h2>
        <p className="text-sm text-muted">{t("At least {n} careful answers are needed in each period.", { n: PRACTICE_MIN })}</p>
        <p className="mt-2 text-sm text-ink">{r.tooFew.map((x) => `${x.name} (${x.a.answers} → ${x.b.answers})`).join(" · ")}</p>
      </section>}
      {many && <ClassesTable rows={r.classes} t={t} />}
      <ReportSummary summary={comparePracticeSummary(r, ctx)} />
    </>
  );
}

const CASE_CLS: Record<string, string> = { EXCELLENT: "ring-emerald-300 bg-emerald-50", NOT_USED: "ring-sky-300 bg-sky-50", LESS_PRACTICE: "ring-amber-300 bg-amber-50", SUPPORT: "ring-rose-300 bg-rose-50", SAME: "ring-line bg-surface", TOO_EARLY: "ring-line bg-surface-2" };

function AllView({ r, t, many, ctx }: { r: AllCompare; t: TFn; many: boolean; ctx: Ctx }) {
  return (
    <>
      <OneLine l={oneLineAll(r)} t={t} />
      <p className="text-sm text-ink-2">{t("Tests")}: <b>{r.tests.a?.title ?? "—"}</b> → <b>{r.tests.b?.title ?? "—"}</b> · {t("Practice")}: <b dir="ltr">{r.practice.a.from}–{r.practice.a.to} → {r.practice.b.from}–{r.practice.b.to}</b> <InfoTip text={TIPS.cases} /></p>
      <section aria-label={t("Summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="case-cards">
        {CASES.slice(0, 4).map((c) => (
          <div key={c.key} className={`rounded-2xl p-4 ring-1 print:p-2 ${CASE_CLS[c.key]}`} data-case={c.key}>
            <p className="text-3xl font-bold tabular-nums text-ink">{r.counts[c.key]}</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{t(c.name)}</p>
            <p className="text-xs text-ink-2">👉 {t(c.action)}</p>
          </div>
        ))}
      </section>
      <p className="text-xs text-muted">{t("Same level")}: {r.counts.SAME} · {t("Too early to judge")}: {r.counts.TOO_EARLY}</p>
      {r.groups.map((g) => {
        const c = CASE_BY_KEY.get(g.key)!;
        return (
          <section key={g.key} className={`${CARD}`} aria-labelledby={`case-${g.key}`} data-group={g.key}>
            <h2 id={`case-${g.key}`} className="text-lg font-semibold text-ink">{t(c.name)} <span className="text-sm font-normal text-muted">({g.rows.length})</span></h2>
            <p className="text-sm text-ink-2">👉 <b>{t("What to do")}:</b> {t(c.action)}</p>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[28rem] text-sm">
              <thead><tr className="text-xs text-muted"><Th start>{t("Student")}</Th><Th tip={TIPS.change}>{t("Tests")}</Th><Th tip={TIPS.accuracy}>{t("Practice")}</Th><Th>{t("What to do")}</Th></tr></thead>
              <tbody className="divide-y divide-line">{g.rows.map((x) => (
                <tr key={x.id}>
                  <td className="py-2"><Link href={studentHref(x.id)} className="font-semibold text-ink hover:underline">{x.name}</Link>{many ? <span className="block text-xs text-muted">{x.className}</span> : null}</td>
                  <td className="text-center"><ArrowPill a={x.tests} t={t} /> <Change v={x.testChange} /></td>
                  <td className="text-center"><ArrowPill a={x.practice} t={t} /> <Change v={x.practiceChange} /></td>
                  <td className="text-center text-xs text-ink-2">{t(c.action)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
        );
      })}
      {many && r.classes.length > 1 && (
        <section className={CARD} aria-labelledby="cmp-acls">
          <h2 id="cmp-acls" className="text-lg font-semibold text-ink">{t("Classes compared")}</h2>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[30rem] text-sm">
            <thead><tr className="text-xs text-muted"><Th start>{t("Class")}</Th>{CASES.slice(0, 4).map((c) => <Th key={c.key}>{t(c.name)}</Th>)}<Th>{t("Too early to judge")}</Th></tr></thead>
            <tbody className="divide-y divide-line">{r.classes.map((c) => <tr key={c.classId}><td className="py-2 font-semibold text-ink">{c.name}</td>{CASES.slice(0, 4).map((k) => <td key={k.key} className="text-center tabular-nums">{c.cases[k.key]}</td>)}<td className="text-center tabular-nums">{c.cases.TOO_EARLY}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
      <ReportSummary summary={compareAllSummary(r, ctx)} />
    </>
  );
}
