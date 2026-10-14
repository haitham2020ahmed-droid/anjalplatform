import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { listNafsTests, nafsClasses } from "@/server/nafs/tests";
import { cleanCuts, LEVEL_MARK, LEVEL_NAME, LEVELS, MIN_ITEMS, nafsAcrossReport, nafsStudentHistory, nafsTestReport, nafsTrend, ROUNDING_RULE, type Cuts, type Level, type StudentStd, type Summary } from "@/server/nafs/reports";
import { codeName, MOE_AREA_NAME, MOE_BY_CODE, PROCESSES } from "@/server/nafs/framework";
import { PrintButton } from "@/components/plans/print-button";
import { Combo } from "@/components/ui/combo";
import { CodeHead } from "./code-name";
import { ClassLineCards, LineCells, LineHeads } from "./student-line";
import { RichInline } from "@/components/rich-inline";
import { stripMarks } from "@/lib/inline-marks";

const SEL = "min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line";
const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:break-inside-avoid print:shadow-none";
const L = ["A", "B", "C", "D"];
const tone = (p: number | null | undefined, cuts: Cuts) => (p === null || p === undefined ? "text-muted" : p >= cuts.hi ? "text-emerald-700" : p >= cuts.lo ? "text-amber-700" : "text-rose-700");
const P = ({ v, cuts }: { v: number | null | undefined; cuts: Cuts }) => <span className={`tabular-nums font-semibold ${tone(v, cuts)}`}>{v === null || v === undefined ? "—" : `${v}%`}</span>;
const LEVEL_CLS: Record<Level, string> = { MASTERED: "bg-emerald-50 text-emerald-900 ring-emerald-200", DEVELOPING: "bg-amber-50 text-amber-900 ring-amber-200", SUPPORT: "bg-rose-50 text-rose-900 ring-rose-200", FEW: "bg-surface-2 text-muted ring-line" };

function Bar({ label, v, sub, cuts }: { label: string; v: number | null; sub?: string; cuts: Cuts }) {
  return (
    <li>
      <div className="flex justify-between gap-2 text-sm text-ink-2"><span>{label}{sub ? <span className="ms-1 text-xs text-muted">{sub}</span> : null}</span><P v={v} cuts={cuts} /></div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2 print:ring-1 print:ring-black" aria-hidden="true"><div className={`h-full rounded-full ${v === null ? "" : v >= cuts.hi ? "bg-emerald-500" : v >= cuts.lo ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${v ?? 0}%` }} /></div>
    </li>
  );
}

/**
 * 🇸🇦 NAFS center → NAFS test → REPORT (teacher-facing): one test or every test together; per class, per student, per
 * Ministry standard, NAFS skill, PIRLS process, content area and text type; the student × standard heat map; each
 * student's level per standard with the teacher's cut-offs (Mastered / Developing / Needs support — never shown to
 * students); item analysis with discrimination, distractors and flags; groups needing support → "Make a NAFS plan for
 * this group"; classes compared; progress across tests; Excel (a sheet per view) / PDF. Online, bubble-sheet and typed
 * answers together. (Adaptive practice results live in Adaptive → Report; the overall picture in Reports.)
 */
export async function ReportsTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const [tests, classes] = await Promise.all([listNafsTests(repo, actor), nafsClasses(repo, actor)]);
  const view = sp.view === "trend" || sp.view === "student" || sp.view === "across" ? sp.view : "test";
  const testId = tests.find((x) => x.id === sp.test)?.id ?? tests.find((x) => x.results > 0)?.id ?? tests[0]?.id;
  const classId = classes.find((c) => c.id === sp.class)?.id ?? "";
  const cuts = cleanCuts(sp.hi, sp.lo);
  const keep = (extra: Record<string, string>) => `/teacher/nafs?${new URLSearchParams({ tab: "test", sub: "report", ...(testId ? { test: testId } : {}), ...(classId ? { class: classId } : {}), hi: String(cuts.hi), lo: String(cuts.lo), ...extra })}`;
  const views = [{ k: "test", label: "One test" }, { k: "across", label: "All tests together" }, { k: "trend", label: "Progress across simulations" }, { k: "student", label: "One student" }];
  if (!tests.length || !classes.length) return <p className={`${CARD} text-sm text-muted`}>{t(!classes.length ? "You have no Grade 6 class yet." : "No NAFS tests yet. Start with a NAFS simulation.")}</p>;
  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1.5 print:hidden" aria-label={t("Reports")}>
        {views.map((x) => <Link key={x.k} href={keep({ view: x.k })} className={`min-h-10 rounded-full px-4 py-2 text-sm font-semibold ring-1 ${view === x.k ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-ink-2 ring-line"}`}>{t(x.label)}</Link>)}
      </nav>
      <form method="get" action="/teacher/nafs" className={`${CARD} flex flex-wrap items-end gap-3 print:hidden`}>
        <input type="hidden" name="tab" value="test" /><input type="hidden" name="sub" value="report" /><input type="hidden" name="view" value={view} />
        {view === "test" && <div className="grid min-w-60 gap-1 text-sm font-semibold text-ink-2"><span>{t("Test")}</span><Combo name="test" label={t("Test")} defaultValue={testId} options={tests.map((x) => ({ value: x.id, label: x.title, hint: x.results ? t("{n} result(s)", { n: x.results }) : undefined }))} /></div>}
        <div className="grid min-w-52 gap-1 text-sm font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="class" label={t("Class")} defaultValue={classId} options={[...(view !== "trend" ? [{ value: "", label: t("All my Grade 6 classes") }] : []), ...classes.map((c) => ({ value: c.id, label: c.name }))]} /></div>
        {view === "student" && <div className="grid min-w-60 gap-1 text-sm font-semibold text-ink-2"><span>{t("Student")}</span><Combo name="student" label={t("Student")} defaultValue={sp.student ?? ""} options={classes.filter((c) => !classId || c.id === classId).flatMap((c) => c.students.map((x) => ({ value: x.id, label: x.name, group: c.name })))} /></div>}
        <CutFields t={t} cuts={cuts} />
        <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        <PrintButton label={t("Print")} />
      </form>
      <Legend t={t} cuts={cuts} />
      {view === "test" && testId && <TestReport actor={actor} t={t} testId={testId} classId={classId || null} cuts={cuts} />}
      {view === "across" && <Across actor={actor} t={t} classId={classId || null} cuts={cuts} />}
      {view === "trend" && <Trend actor={actor} t={t} classId={classId || classes[0].id} cuts={cuts} />}
      {view === "student" && (sp.student ? <Student actor={actor} t={t} studentId={sp.student} cuts={cuts} /> : <p className={`${CARD} text-sm text-muted`}>{t("Choose a student.")}</p>)}
    </div>
  );
}

/** The teacher's cut-offs (the same fields in every NAFS test report form). */
export function CutFields({ t, cuts }: { t: TFn; cuts: Cuts }) {
  return (
    <fieldset className="flex items-end gap-2">
      <legend className="mb-1 text-sm font-semibold text-ink-2">{t("Cut-offs")}</legend>
      <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Mastered from")} %<input type="number" name="hi" min={1} max={100} defaultValue={cuts.hi} className={`${SEL} w-20`} /></label>
      <label className="grid gap-1 text-xs font-semibold text-ink-2">{t("Developing from")} %<input type="number" name="lo" min={0} max={99} defaultValue={cuts.lo} className={`${SEL} w-20`} /></label>
    </fieldset>
  );
}

export function Legend({ t, cuts }: { t: TFn; cuts: Cuts }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
      {LEVELS.map((l) => <span key={l} className={`rounded-full px-2.5 py-1 ring-1 ${LEVEL_CLS[l]}`}>{LEVEL_MARK[l]} {t(LEVEL_NAME[l])}{l === "MASTERED" ? ` ≥ ${cuts.hi}%` : l === "DEVELOPING" ? ` ≥ ${cuts.lo}%` : l === "SUPPORT" ? ` < ${cuts.lo}%` : ` (< ${MIN_ITEMS})`}</span>)}
      <span className="text-muted">{t("Teacher-facing only: students never see these words.")} {t(ROUNDING_RULE)}</span>
    </div>
  );
}

function Cell({ c, t }: { c: StudentStd | undefined; t: TFn }) {
  if (!c) return <td className="px-1 text-center text-muted">—</td>;
  return (
    <td className="p-0.5 text-center">
      <span className={`block rounded-md px-1 py-1 text-xs tabular-nums ring-1 ${LEVEL_CLS[c.level]}`} title={`${t(LEVEL_NAME[c.level])} · ${t("{n} items", { n: c.n })}`}>
        {c.pct === null ? "—" : `${c.pct}%`}<span className="block text-[10px] opacity-80">({c.n}) {LEVEL_MARK[c.level]}</span>
      </span>
    </td>
  );
}

/** The views shared by one test and every test together. */
function SummaryViews({ t, sum, students, cuts }: { t: TFn; sum: Summary; students: { id: string; name: string; className: string; standards: Record<string, StudentStd> }[]; cuts: Cuts }) {
  const name = (code: string) => codeName(code, t);
  if (!sum.standards.length) return <p className={`${CARD} text-sm text-muted`}>{t("No question of these results has a Ministry standard yet: set the standard in the Question bank (the model booklets have one).")}</p>;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={CARD}>
          <h2 className="text-lg font-semibold text-ink">{t("Class summary")}</h2>
          <p className="mt-2 text-sm text-ink-2"><b className="text-emerald-800">{t("Strongest")}:</b> {sum.strongest.map(name).join(" · ") || "—"}</p>
          <p className="mt-1 text-sm text-ink-2"><b className="text-rose-800">{t("Weakest")}:</b> {sum.weakest.map(name).join(" · ") || "—"}</p>
          {sum.notSet > 0 && <p className="mt-2 text-xs text-muted">{t("{n} question(s) have no standard yet", { n: sum.notSet })}.</p>}
        </section>
        <section className={CARD}>
          <h2 className="text-lg font-semibold text-ink">{t("Content areas")}</h2>
          <ul className="mt-3 grid gap-2.5">{sum.areas.map((a) => <Bar key={a.key} label={t(a.name)} sub={t("{n} questions", { n: a.questions })} v={a.pct} cuts={cuts} />)}</ul>
        </section>
        <section className={CARD}>
          <h2 className="text-lg font-semibold text-ink">{t("Text types")}</h2>
          <ul className="mt-3 grid gap-2.5">{sum.texts.map((a) => <Bar key={a.key} label={t(a.name)} sub={t("{n} questions", { n: a.questions })} v={a.pct} cuts={cuts} />)}</ul>
        </section>
      </div>
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-ink">{t("Ministry standards (S01–S13)")}</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Standard")}</th><th className="text-start">{t("Content area")}</th><th>{t("Questions")}</th><th>{t("Class %")}</th>{LEVELS.map((l) => <th key={l}>{LEVEL_MARK[l]} {t(LEVEL_NAME[l])}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {sum.standards.map((x) => (
                <tr key={x.key}>
                  <td className="py-2 text-ink"><b className="me-1 font-mono" dir="ltr">{x.short}</b>{t(x.text)}</td>
                  <td className="text-xs text-ink-2">{x.area ? t(MOE_AREA_NAME[x.area]) : "—"}</td>
                  <td className="text-center tabular-nums">{x.questions}</td>
                  <td className="text-center"><P v={x.pct} cuts={cuts} /></td>
                  {LEVELS.map((l) => <td key={l} className="text-center tabular-nums">{x.counts[l]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-ink">{t("Student × standard heat map")}</h2>
        <p className="text-sm text-muted">{t("Each cell: percent correct, (the number of items behind it) and the level mark — readable in black and white.")}</p>
        {!students.length ? <p className="mt-3 text-sm text-muted">{t("No results yet.")}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-sm">
              <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Student")}</th>{sum.standards.map((x) => <th key={x.key} className="px-0.5 align-bottom"><CodeHead code={x.key} t={t} /></th>)}</tr></thead>
              <tbody>
                {students.map((st) => (
                  <tr key={st.id}>
                    <td className="py-1 pe-2"><Link href={`/teacher/nafs?tab=test&sub=report&view=student&student=${st.id}&hi=${cuts.hi}&lo=${cuts.lo}`} className="font-semibold text-ink hover:underline">{st.name}</Link><span className="block text-xs text-muted">{st.className}</span></td>
                    {sum.standards.map((x) => <Cell key={x.key} c={st.standards[x.key]} t={t} />)}
                  </tr>
                ))}
                <tr className="font-semibold"><td className="py-1 text-xs text-ink-2">{t("Class %")}</td>{sum.standards.map((x) => <td key={x.key} className="text-center text-xs"><P v={x.pct} cuts={cuts} /></td>)}</tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-ink">{t("Groups needing support per standard")}</h2>
        {!sum.groups.length ? <p className="mt-2 text-sm text-muted">{t("No student needs support on a standard.")}</p> : (
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {sum.groups.map((g) => g.classes.map((c) => (
              <li key={`${g.code}:${c.classId}`} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                <p className="text-sm font-semibold text-ink"><b className="me-1 font-mono" dir="ltr">{g.short}</b>{t(g.text)} <span className="text-xs font-normal text-muted">· {c.className}</span></p>
                {c.support.length > 0 && <p className="mt-1 text-sm text-rose-900">{LEVEL_MARK.SUPPORT} {t("Needs support")}: {c.support.map((x) => x.name).join(", ")}</p>}
                {c.developing.length > 0 && <p className="mt-1 text-sm text-amber-900">{LEVEL_MARK.DEVELOPING} {t("Developing")}: {c.developing.map((x) => x.name).join(", ")}</p>}
                {c.support.length > 0 && <Link href={c.planHref} className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white print:hidden">🧾 {t("Make a NAFS plan for this group")}</Link>}
              </li>
            )))}
          </ul>
        )}
      </section>
      {sum.classCompare.length > 1 && (
        <section className={CARD}>
          <h2 className="text-lg font-semibold text-ink">{t("Classes compared")}</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Class")}</th><th>{t("Students")}</th><th>{t("Overall")}</th>{sum.standards.map((x) => <th key={x.key} className="px-0.5 align-bottom"><CodeHead code={x.key} t={t} /></th>)}</tr></thead>
              <tbody className="divide-y divide-line">{sum.classCompare.map((c) => <tr key={c.classId}><td className="py-2 font-semibold text-ink">{c.name}</td><td className="text-center tabular-nums">{c.taken}</td><td className="text-center"><P v={c.pct} cuts={cuts} /></td>{sum.standards.map((x) => <td key={x.key} className="text-center"><P v={c.standards[x.key]} cuts={cuts} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Exports({ t, q }: { t: TFn; q: URLSearchParams }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a href={`/api/nafs/export?${q}&format=xlsx`} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">⬇ {t("Excel")}</a>
      <a href={`/api/nafs/export?${q}&format=pdf`} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">⬇ {t("PDF")}</a>
    </div>
  );
}

export async function TestReport({ actor, t, testId, classId, cuts }: { actor: Actor; t: TFn; testId: string; classId: string | null; cuts: Cuts }) {
  const r = await nafsTestReport(repo, actor, testId, classId, new Date(), cuts);
  const q = new URLSearchParams({ testId, ...(classId ? { classId } : {}), hi: String(cuts.hi), lo: String(cuts.lo) });
  const missed = [...r.items].filter((x) => x.pct !== null).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).slice(0, 5);
  const flagged = r.items.filter((x) => x.flags.length);
  return (
    <>
      <ClassLineCards c={r.cls} t={t} />
      <section className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
        <div className="text-center"><p className="text-2xl font-bold text-ink tabular-nums">{r.avgPoints ?? "—"}<span className="text-sm text-muted"> / {r.maxPoints}</span></p><p className="text-xs text-muted">{t("Average marks")}</p></div>
        <Exports t={t} q={q} />
      </section>
      {r.pending > 0 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 print:hidden">✍ {t("{n} written answer(s) waiting for marking: they count once scored.", { n: r.pending })} <Link href={`/teacher/nafs?tab=marking&test=${testId}`} className="font-semibold underline">{t("Marking")}</Link></p>}
      {!r.taken ? <p className={`${CARD} text-sm text-muted`}>{t("No results yet: give the test online, or grade bubble sheets.")}</p> : (
        <>
          <SummaryViews t={t} sum={r.summary} students={r.students} cuts={cuts} />
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={CARD}>
              <h2 className="text-lg font-semibold text-ink">{t("PIRLS reading processes")}</h2>
              <ul className="mt-3 grid gap-2.5">{r.processes.map((p) => <Bar key={p.code} label={`${p.code} · ${t(p.name)}`} sub={t("{n} questions", { n: p.questions })} v={p.pct} cuts={cuts} />)}</ul>
            </section>
            <section className={CARD}>
              <h2 className="text-lg font-semibold text-ink">{t("NAFS skills")}</h2>
              <ul className="mt-3 grid gap-2.5">{r.skills.map((k) => <Bar key={k.code} label={t(k.name)} sub={t("{n} questions", { n: k.questions })} v={k.pct} cuts={cuts} />)}</ul>
              <p className="mt-3 text-xs text-muted">{t("Domains")}: {r.domains.map((d) => `${t(d.name)} ${d.pct ?? "—"}%`).join(" · ")}</p>
            </section>
          </div>
          <section className={CARD} data-testid="nafs-students">
            <h2 className="text-lg font-semibold text-ink">{t("Students")}</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Student")}</th><LineHeads t={t} /><th>{t("Marks")}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {r.students.map((x) => (
                    <tr key={x.id}>
                      <td className="py-2"><Link href={`/teacher/nafs?tab=test&sub=report&view=student&student=${x.id}&hi=${cuts.hi}&lo=${cuts.lo}`} className="font-semibold text-ink hover:underline">{x.name}</Link><span className="block text-xs text-muted">{x.className}{x.blanks ? ` · ${t("{n} blank", { n: x.blanks })}` : ""}{x.pending ? ` · ✍ ${t("{n} to mark", { n: x.pending })}` : ""}</span></td>
                      <LineCells x={x} t={t} />
                      <td className="text-center tabular-nums text-ink-2">{x.points}/{x.maxPoints}</td>
                    </tr>
                  ))}
                  {r.notTaken.map((x) => (
                    <tr key={x.id} className="text-muted">
                      <td className="py-2"><span className="font-semibold">{x.name}</span><span className="block text-xs">{x.className}</span></td>
                      <td className="text-center">—</td><td className="text-center">—</td><td className="text-center">—</td><td className="text-center">{t(x.started ? "No (started)" : "No (not started)")}</td><td>—</td><td>—</td><td className="text-center">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <details className={CARD}>
            <summary className="cursor-pointer text-sm font-semibold text-ink">{t("More details")}: {t("reading processes, content areas and text types per student")}</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead><tr className="text-start text-xs text-muted"><th className="py-2 text-start">{t("Student")}</th><th className="text-start">{t("Score")}</th><th className="text-start">{t("Marks")}</th>{PROCESSES.map((p) => <th key={p} className="text-start">{p}</th>)}<th className="text-start">{t("Vocabulary")}</th><th className="text-start">{t("Comprehension and analysis")}</th><th className="text-start">{t("Evaluation")}</th><th className="text-start">{t("Informational")}</th><th className="text-start">{t("Literary")}</th><th className="text-start">{t("From")}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {r.students.map((x) => (
                    <tr key={x.id}>
                      <td className="py-2"><Link href={`/teacher/nafs?tab=test&sub=report&view=student&student=${x.id}&hi=${cuts.hi}&lo=${cuts.lo}`} className="font-semibold text-ink hover:underline">{x.name}</Link><span className="block text-xs text-muted">{x.className}{x.blanks ? ` · ${t("{n} blank", { n: x.blanks })}` : ""}{x.pending ? ` · ✍ ${t("{n} to mark", { n: x.pending })}` : ""}</span></td>
                      <td><P v={x.pct} cuts={cuts} /></td><td className="tabular-nums text-ink-2">{x.points}/{x.maxPoints}</td>
                      {PROCESSES.map((p) => <td key={p}><P v={x.processes[p]} cuts={cuts} /></td>)}
                      <td><P v={x.areas.VOC} cuts={cuts} /></td><td><P v={x.areas.CA} cuts={cuts} /></td><td><P v={x.areas.EV} cuts={cuts} /></td><td><P v={x.texts.INFO} cuts={cuts} /></td><td><P v={x.texts.LIT} cuts={cuts} /></td>
                      <td className="text-xs text-muted">{t(x.source === "ONLINE" ? "Online" : x.source === "SHEET" ? "Bubble sheet" : "Typed")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <section className={CARD}>
            <h2 className="text-lg font-semibold text-ink">{t("Item analysis")}</h2>
            <p className="text-sm text-muted">{t("% correct, discrimination D (upper 27% minus lower 27% of the students: 0.20 or more is good), the most chosen wrong option, and flags for items to review.")} {missed.length ? `${t("Most missed")}: ${missed.map((x) => `#${x.n}`).join(", ")}` : ""}</p>
            {flagged.length > 0 && <p className="mt-1 text-sm text-amber-900">⚑ {t("To review")}: {flagged.map((x) => `#${x.n}`).join(", ")}</p>}
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead><tr className="text-xs text-muted"><th className="py-2 text-start">#</th><th className="text-start">{t("Question")}</th><th className="text-start">{t("Standard")}</th><th className="text-start">{t("Skill")}</th><th className="text-start">{t("Correct")}</th><th>D</th>{L.map((l) => <th key={l}>{l}</th>)}<th>{t("Blank")}</th><th className="text-start">{t("Review")}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {r.items.map((x) => (
                    <tr key={x.id}>
                      <td className="py-2 font-semibold text-ink">{x.n}</td>
                      <td className="max-w-xs truncate text-ink-2" lang="en" dir="ltr" title={stripMarks(x.stem)}>{x.kind === "WRITTEN" ? "✍ " : ""}<RichInline text={x.stem} /></td>
                      <td className="max-w-[14rem] text-xs text-ink-2">{x.standard ? codeName(x.standard, t) : "—"}</td>
                      <td className="text-xs text-ink-2">{t(x.skill)} · {codeName(x.process, t)}</td>
                      <td><P v={x.pct} cuts={cuts} />{x.pending ? <span className="block text-[11px] text-muted">{t("{n} to mark", { n: x.pending })}</span> : null}</td>
                      <td className={`text-center tabular-nums ${x.d !== null && x.d < 0.2 ? "font-bold text-rose-700" : "text-ink-2"}`}>{x.d === null ? "—" : x.d.toFixed(2)}</td>
                      {x.kind === "WRITTEN" ? <td colSpan={5} className="text-center text-xs text-muted">{t("Written (rubric)")}</td> : <>
                        {x.counts.map((c, i) => <td key={i} className={`text-center tabular-nums ${i === x.key ? "font-bold text-emerald-700" : i === x.topWrong ? "rounded bg-rose-50 font-bold text-rose-700" : "text-ink-2"}`}>{c}{i === x.key ? " ✓" : i === x.topWrong ? " ✗" : ""}</td>)}
                        <td className="text-center tabular-nums text-muted">{x.blank}</td>
                      </>}
                      <td className="text-xs text-amber-900">{x.flags.map((f) => t(f)).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

async function Across({ actor, t, classId, cuts }: { actor: Actor; t: TFn; classId: string | null; cuts: Cuts }) {
  const r = await nafsAcrossReport(repo, actor, classId, cuts);
  const q = new URLSearchParams({ view: "across", ...(classId ? { classId } : {}), hi: String(cuts.hi), lo: String(cuts.lo) });
  if (!r.tests.length) return <p className={`${CARD} text-sm text-muted`}>{t("No NAFS results yet.")}</p>;
  return (
    <>
      <ClassLineCards c={r.cls} t={t} finishedLabel="Took a NAFS test" />
      <section className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
        <p className="text-sm text-ink-2">{t("Every NAFS test of these classes together ({n} tests): each student's items pooled.", { n: r.tests.length })}</p>
        <Exports t={t} q={q} />
      </section>
      {r.pending > 0 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 print:hidden">✍ {t("{n} written answer(s) waiting for marking: they count once scored.", { n: r.pending })} <Link href="/teacher/nafs?tab=marking" className="font-semibold underline">{t("Marking")}</Link></p>}
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-ink">{t("Trend across tests")}</h2>
        <ul className="mt-3 grid gap-2.5">{r.tests.map((x) => <Bar key={x.id} label={x.title} sub={`${new Date(x.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${t("{n} taken", { n: x.taken })}`} v={x.pct} cuts={cuts} />)}</ul>
      </section>
      <SummaryViews t={t} sum={r.summary} students={r.students} cuts={cuts} />
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-ink">{t("Students (all tests)")}</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Student")}</th><th title={t("NAFS tests handed in")}>{t("Tests finished")}</th><LineHeads t={t} finished={false} /></tr></thead>
            <tbody className="divide-y divide-line">{r.students.map((x) => <tr key={x.id}><td className="py-2"><Link href={`/teacher/nafs?tab=test&sub=report&view=student&student=${x.id}&hi=${cuts.hi}&lo=${cuts.lo}`} className="font-semibold text-ink hover:underline">{x.name}</Link><span className="block text-xs text-muted">{x.className} · {t("{n} items", { n: x.n })}</span></td><td className="text-center tabular-nums">{x.tests}</td><LineCells x={x} t={t} finished={false} /></tr>)}</tbody>
          </table>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">{t("More details")}: {t("reading processes and content areas per student")}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Student")}</th><th>{t("Overall")}</th>{PROCESSES.map((p) => <th key={p}>{p}</th>)}<th>{t("Vocabulary")}</th><th>{t("Comprehension and analysis")}</th><th>{t("Evaluation")}</th></tr></thead>
            <tbody className="divide-y divide-line">{r.students.map((x) => <tr key={x.id}><td className="py-2 font-semibold text-ink">{x.name}</td><td className="text-center"><P v={x.pct} cuts={cuts} /></td>{PROCESSES.map((p) => <td key={p} className="text-center"><P v={x.processes[p]} cuts={cuts} /></td>)}<td className="text-center"><P v={x.areas.VOC} cuts={cuts} /></td><td className="text-center"><P v={x.areas.CA} cuts={cuts} /></td><td className="text-center"><P v={x.areas.EV} cuts={cuts} /></td></tr>)}</tbody>
          </table>
        </div>
        </details>
      </section>
    </>
  );
}

async function Trend({ actor, t, classId, cuts }: { actor: Actor; t: TFn; classId: string; cuts: Cuts }) {
  const points = await nafsTrend(repo, actor, classId);
  if (!points.length) return <p className={`${CARD} text-sm text-muted`}>{t("No NAFS results for this class yet.")}</p>;
  const stds = [...new Set(points.flatMap((p) => Object.entries(p.standards).filter(([, v]) => v !== null).map(([k]) => k)))].sort();
  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold text-ink">{t("Progress across simulations")}</h2>
      <ol className="mt-4 flex items-end gap-3 overflow-x-auto pb-2" aria-label={t("Class average per test")}>
        {points.map((p) => (
          <li key={p.testId} className="flex w-20 shrink-0 flex-col items-center gap-1">
            <P v={p.pct} cuts={cuts} />
            <div className="flex h-36 w-8 items-end rounded-lg bg-surface-2 print:ring-1 print:ring-black" aria-hidden="true"><div className="w-full rounded-lg bg-teal-500" style={{ height: `${p.pct ?? 0}%` }} /></div>
            <span className="line-clamp-2 text-center text-xs text-ink-2">{p.title}</span>
            <span className="text-[11px] text-muted">{new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Test")}</th><th className="text-start">{t("Taken")}</th><th className="text-start">{t("Class average")}</th>{PROCESSES.map((p) => <th key={p} className="px-0.5 align-bottom"><CodeHead code={p} t={t} /></th>)}{stds.map((c) => <th key={c} className="px-0.5 align-bottom"><CodeHead code={c} t={t} /></th>)}</tr></thead>
          <tbody className="divide-y divide-line">{points.map((p) => <tr key={p.testId}><td className="py-2"><Link href={`/teacher/nafs?tab=test&sub=report&test=${p.testId}&class=${classId}&hi=${cuts.hi}&lo=${cuts.lo}`} className="font-semibold text-ink hover:underline">{p.title}</Link></td><td className="tabular-nums">{p.taken}</td><td><P v={p.pct} cuts={cuts} /></td>{PROCESSES.map((k) => <td key={k}><P v={p.processes[k]} cuts={cuts} /></td>)}{stds.map((c) => <td key={c} className="text-center"><P v={p.standards[c]} cuts={cuts} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

async function Student({ actor, t, studentId, cuts }: { actor: Actor; t: TFn; studentId: string; cuts: Cuts }) {
  const h = await nafsStudentHistory(repo, actor, studentId, cuts).catch(() => null);
  if (!h) return <p className={`${CARD} text-sm text-muted`}>{t("Choose a student.")}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-ink">{h.name} <span className="text-sm font-normal text-muted">{h.className}</span></h2>
        {!h.tests.length ? <p className="mt-2 text-sm text-muted">{t("No NAFS results yet.")}</p> : <ul className="mt-3 grid gap-2.5">{h.tests.map((x) => <Bar key={x.testId} label={x.title} sub={`${new Date(x.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${x.pending ? ` · ✍ ${t("{n} to mark", { n: x.pending })}` : ""}`} v={x.pct} cuts={cuts} />)}</ul>}
      </section>
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-ink">{t("Ministry standards (S01–S13)")}</h2>
        {!h.standards.length ? <p className="mt-2 text-sm text-muted">{t("No standard yet.")}</p> : (
          <ul className="mt-3 grid gap-1.5">
            {h.standards.map((x) => (
              <li key={x.code} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 text-ink"><b className="me-1 font-mono" dir="ltr">{x.short}</b>{t(x.text)}</span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs ring-1 ${LEVEL_CLS[x.level]}`}>{x.pct === null ? "—" : `${x.pct}%`} ({x.n}) {LEVEL_MARK[x.level]} {t(LEVEL_NAME[x.level])}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={`${CARD} lg:col-span-2`}>
        <h2 className="text-lg font-semibold text-ink">{t("NAFS skills")}</h2>
        <ul className="mt-3 grid gap-2.5 md:grid-cols-2">{h.skills.map((k) => <Bar key={k.code} label={t(k.name)} sub={t("{n} questions", { n: k.questions })} v={k.pct} cuts={cuts} />)}</ul>
      </section>
    </div>
  );
}
