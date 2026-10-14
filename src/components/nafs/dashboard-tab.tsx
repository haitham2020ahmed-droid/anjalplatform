import Link from "next/link";
import type { ReactNode } from "react";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { nafsClasses } from "@/server/nafs/tests";
import { dashboardDownload, groupOf, nafsDashboardCached, NAFS_GROUPS, studentHref, type AttemptRow, type Dashboard, type GroupKey, type Kind, type SkillRow } from "@/server/nafs/dashboard";
import { DIFFICULTIES, DIFFICULTY_NAME, MOE_BY_CODE, codeName } from "@/server/nafs/framework";
import { PrintButton } from "@/components/plans/print-button";
import { LineChart, Sparkline } from "./charts";
import { CodeHead } from "./code-name";
import { Combo } from "@/components/ui/combo";
import { RichInline } from "@/components/rich-inline";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:break-inside-avoid print:shadow-none";
const SEL = "min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line";
const LETTERS = ["A", "B", "C", "D"];
/** Colour by the teacher-facing groups (always with the number as text). */
export const GROUP_CLS: Record<GroupKey, string> = { EXCEEDING: "bg-emerald-50 text-emerald-900 ring-emerald-200", MEETING: "bg-sky-50 text-sky-900 ring-sky-200", APPROACHING: "bg-amber-50 text-amber-900 ring-amber-200", SUPPORT: "bg-rose-50 text-rose-900 ring-rose-200" };
const TEXT_CLS: Record<GroupKey, string> = { EXCEEDING: "text-emerald-700", MEETING: "text-sky-700", APPROACHING: "text-amber-700", SUPPORT: "text-rose-700" };
export const Pc = ({ v }: { v: number | null | undefined }) => { const g = groupOf(v ?? null); return <span className={`tabular-nums font-semibold ${g ? TEXT_CLS[g] : "text-muted"}`}>{v === null || v === undefined ? "—" : `${v}%`}</span>; };
export const Delta = ({ v }: { v: number | null | undefined }) => v === null || v === undefined ? <span className="text-muted">—</span> : <span className={`tabular-nums font-semibold ${v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-700" : "text-ink-2"}`}>{v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0"}</span>;
export const kindName = (k: Kind) => (k === "TEST" ? "Test" : "Practice");
const short = (code: string, t: TFn) => codeName(code, t);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export function groupRange(i: number): string { const g = NAFS_GROUPS[i]; return i === 0 ? `≥ ${g.min}%` : g.key === "SUPPORT" ? `< ${NAFS_GROUPS[i - 1].min}%` : `${g.min}–${NAFS_GROUPS[i - 1].min - 1}%`; }

function Stat({ n, label, sub }: { n: ReactNode; label: string; sub?: ReactNode }) {
  return (
    <div className={CARD}>
      <p className="text-3xl font-bold tabular-nums text-ink">{n}</p>
      <p className="mt-1 text-sm text-ink-2">{label}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

/**
 * 🇸🇦 NAFS center — Dashboard (teachers and admins): overview, a very detailed skills analysis (13 standards, NAFS
 * skills, PIRLS processes; tests vs practice, difficulty, trend, most-missed questions, heat map), attempt-to-attempt
 * comparison with a line chart, the teacher-facing student groups with one-click actions and movement, the school
 * view (classes compared on every standard), Excel / PDF. NAFS data only.
 */
export async function DashboardTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const all = await nafsClasses(repo, actor);
  const classId = all.find((c) => c.id === sp.class)?.id ?? null;
  const d = await nafsDashboardCached(repo, actor, { classId, from: sp.from, to: sp.to });
  const r = d.scope.range;
  const allLabel = d.scope.admin ? t("All Grade 6 classes (the school)") : t("All my Grade 6 classes");
  if (!all.length) return <p className={`${CARD} text-sm text-muted`}>{t("You have no Grade 6 class yet.")}</p>;
  const nothing = !d.attempts.length;
  return (
    <div className="grid gap-4">
      <form method="get" action="/teacher/nafs" className={`${CARD} flex flex-wrap items-end gap-3 print:hidden`}>
        <input type="hidden" name="tab" value="reports" /><input type="hidden" name="view" value="detail" />
        <div className="grid min-w-52 gap-1 text-sm font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="class" label={t("Class")} defaultValue={classId ?? ""} options={[{ value: "", label: allLabel }, ...all.map((c) => ({ value: c.id, label: c.name }))]} /></div>
        <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("From")}<input type="date" name="from" defaultValue={r.from ?? ""} className={SEL} /></label>
        <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("To")}<input type="date" name="to" defaultValue={r.to ?? ""} className={SEL} /></label>
        <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        <a href={dashboardDownload("xlsx", classId, r)} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">⬇ {t("Excel")}</a>
        <a href={dashboardDownload("pdf", classId, r)} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">⬇ {t("PDF")}</a>
        <PrintButton label={t("Print")} />
      </form>
      <nav aria-label={t("Dashboard")} className="flex flex-wrap gap-1.5 text-sm print:hidden">
        {[["overview", "Overview"], ["skills", "Skills analysis"], ["compare", "Attempt by attempt"], ["groups", "Student groups"], ...(d.school.classes.length > 1 ? [["school", d.scope.admin ? "School view" : "Classes compared"]] : [])].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full bg-surface px-3 py-1.5 font-semibold text-ink-2 ring-1 ring-line hover:bg-surface-2">{t(label)}</a>
        ))}
      </nav>
      <p className="text-xs text-muted">{t("NAFS tests and NAFS adaptive practice only — never the platform's levels or ReadRise. Group words are for teachers only: students never see them.")}</p>
      <Overview d={d} t={t} />
      {nothing ? <p className={`${CARD} text-sm text-muted`}>{t("No NAFS results in these dates yet. Give a NAFS test or adaptive practice first.")}</p> : <>
        <Skills d={d} t={t} />
        <Compare d={d} t={t} />
        <Groups d={d} t={t} />
        {d.school.classes.length > 1 && <School d={d} t={t} />}
      </>}
    </div>
  );
}

function Overview({ d, t }: { d: Dashboard; t: TFn }) {
  const o = d.overview;
  return (
    <section id="overview" aria-label={t("Overview")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Stat n={o.students} label={t("Students")} sub={t("{n} took a NAFS test", { n: o.tested })} />
      <Stat n={o.testsTaken} label={t("Tests taken")} sub={t("{n} tests", { n: o.tests })} />
      <Stat n={o.practiceSessions} label={t("Practice sessions")} sub={t("{n} answers", { n: o.practiceAnswers })} />
      <Stat n={<Pc v={o.avgScore} />} label={t("Average score")} sub={<>{t("Practice")}: <Pc v={o.practicePct} /></>} />
      <Stat n={o.trend ? <Delta v={o.trend.delta} /> : "—"} label={t("Change from the previous test")} sub={o.trend ? `${o.trend.previous.title} ${o.trend.previous.pct}% → ${o.trend.latest.title} ${o.trend.latest.pct}%` : t("Two tests are needed.")} />
      <Link href="/teacher/nafs?tab=marking" className={`${CARD} lift block`}><p className="text-3xl font-bold tabular-nums text-ink">{o.waiting}</p><p className="mt-1 text-sm text-ink-2">{t("Written answers waiting for marking")}</p></Link>
    </section>
  );
}

function DimTable({ rows, t, title, id }: { rows: SkillRow[]; t: TFn; title: string; id: string }) {
  if (!rows.length) return null;
  return (
    <section className={CARD} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="text-base font-semibold text-ink">{t(title)}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Name")}</th><th>{t("Tests %")}</th><th>{t("Practice %")}</th><th>{t("Items")}</th>{DIFFICULTIES.map((k) => <th key={k}>{t(DIFFICULTY_NAME[k])}</th>)}<th>{t("Trend")}</th><th className="text-start">{t("Most missed")}</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((x) => (
              <tr key={x.key} className="align-top">
                <td className="py-2 pe-2 text-ink">{x.kind !== "SKILL" && <b className="me-1 font-mono" dir="ltr">{x.short}</b>}{t(x.name)}</td>
                <td className="text-center"><Pc v={x.testPct} /><span className="block text-[11px] text-muted">({x.testN})</span></td>
                <td className="text-center"><Pc v={x.practicePct} /><span className="block text-[11px] text-muted">({x.practiceN})</span></td>
                <td className="text-center tabular-nums">{x.items}</td>
                {DIFFICULTIES.map((k) => <td key={k} className="text-center"><Pc v={x.byDifficulty[k].pct} /><span className="block text-[11px] text-muted">({x.byDifficulty[k].n})</span></td>)}
                <td className="text-center"><Sparkline points={x.trend.map((p) => p.pct)} label={t("Trend")} /><span className="block text-[11px] tabular-nums text-muted" dir="ltr">{x.trend.map((p) => p.pct ?? "—").join(" → ")}</span></td>
                <td className="max-w-xs text-xs text-ink-2">{x.missed ? <><span className="line-clamp-2"><RichInline text={x.missed.stem} /></span><span className="text-muted"><Pc v={x.missed.pct} /> · {x.missed.topWrong !== null ? t("most chose {o}", { o: LETTERS[x.missed.topWrong] }) : ""}</span></> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Skills({ d, t }: { d: Dashboard; t: TFn }) {
  return (
    <div id="skills" className="grid gap-4">
      <h2 className="text-lg font-semibold text-ink">{t("Skills analysis")}</h2>
      <DimTable rows={d.standards} t={t} title="Ministry standards (S01–S13)" id="std" />
      <DimTable rows={d.skills} t={t} title="NAFS skills" id="skl" />
      <DimTable rows={d.processes} t={t} title="PIRLS reading processes" id="prc" />
      <section className={CARD} aria-labelledby="miss-h">
        <h3 id="miss-h" className="text-base font-semibold text-ink">{t("Most-missed questions")}</h3>
        {!d.missed.length ? <p className="mt-2 text-sm text-muted">{t("No results yet.")}</p> : (
          <ol className="mt-2 grid gap-2">
            {d.missed.map((m) => (
              <li key={m.id} className="rounded-xl bg-surface-2 p-3 text-sm ring-1 ring-line">
                <p className="text-ink">{m.stem ? <RichInline text={m.stem} /> : "—"}</p>
                <p className="mt-1 text-xs text-ink-2">{m.standard && <b className="me-1">{short(m.standard, t)} ·</b>}{t("Correct")}: <Pc v={m.pct} /> · {t("{n} answers", { n: m.answered })}{m.topWrong !== null ? ` · ${t("Most chosen wrong option: {o} ({n})", { o: LETTERS[m.topWrong], n: m.topWrongCount })}` : ""} · {m.kinds.map((k) => t(k === "TEST" ? "Tests" : "Practice")).join(" + ")}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className={CARD} aria-labelledby="heat-h">
        <h3 id="heat-h" className="text-base font-semibold text-ink">{t("Students × standards heat map")}</h3>
        <p className="text-sm text-muted">{t("Each cell: percent correct in tests and practice (the number of items). The colour follows the groups; the number is always written.")}</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Student")}</th><th>{t("Overall")}</th>{d.heat.codes.map((c) => <th key={c} className="px-0.5 align-bottom"><CodeHead code={c} t={t} /></th>)}</tr></thead>
            <tbody>
              {d.heat.students.map((st) => (
                <tr key={st.id}>
                  <td className="py-1 pe-2"><Link href={studentHref(st.id, d.scope.range)} className="font-semibold text-ink hover:underline">{st.name}</Link><span className="block text-xs text-muted">{st.className}</span></td>
                  <td className="text-center"><Pc v={st.pct} /></td>
                  {d.heat.codes.map((c) => { const cell = st.cells[c]; const g = groupOf(cell?.pct ?? null); return <td key={c} className="p-0.5 text-center">{cell ? <span className={`block rounded-md px-1 py-1 text-xs tabular-nums ring-1 ${g ? GROUP_CLS[g] : "bg-surface-2 text-muted ring-line"}`}>{cell.pct === null ? "—" : `${cell.pct}%`}<span className="block text-[10px] opacity-80">({cell.n})</span></span> : <span className="text-muted">—</span>}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** The class (or a student) attempt by attempt: the line chart and the table with the changes. */
export function AttemptsView({ attempts, codes, t, title }: { attempts: AttemptRow[]; codes: string[]; t: TFn; title: string }) {
  const labels = attempts.map((a, i) => `${i + 1}`);
  return (
    <>
      <LineChart title={t(title)} labels={labels} series={[
        { name: t("Tests"), cls: "text-indigo-600", points: attempts.map((a) => (a.kind === "TEST" ? a.pct : null)) },
        { name: t("Practice"), cls: "text-teal-600", dash: true, points: attempts.map((a) => (a.kind === "PRACTICE" ? a.pct : null)) },
      ]} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead><tr className="text-xs text-muted"><th className="py-2 text-start">#</th><th className="text-start">{t("Date")}</th><th className="text-start">{t("Attempt")}</th><th>{t("Score")}</th><th>{t("Change from previous")}</th><th>{t("Change from first")}</th>{codes.map((c) => <th key={c} className="px-0.5 align-bottom"><CodeHead code={c} t={t} /></th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {attempts.map((a, i) => (
              <tr key={`${a.kind}:${a.id}`}>
                <td className="py-2 tabular-nums text-muted">{i + 1}</td>
                <td className="whitespace-nowrap text-xs text-ink-2">{day(a.date)}</td>
                <td className="text-ink"><span className={`me-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${a.kind === "TEST" ? "bg-indigo-50 text-indigo-900 ring-indigo-200" : "bg-teal-50 text-teal-900 ring-teal-200"}`}>{t(kindName(a.kind))}</span>{a.title}</td>
                <td className="text-center"><Pc v={a.pct} /></td>
                <td className="text-center"><Delta v={a.dPrev} /></td>
                <td className="text-center"><Delta v={a.dFirst} /></td>
                {codes.map((c) => <td key={c} className="text-center text-xs">{a.standards[c] === undefined ? <span className="text-muted">·</span> : <><Pc v={a.standards[c]} /><span className="block"><Delta v={a.stdPrev[c]} /></span></>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Compare({ d, t }: { d: Dashboard; t: TFn }) {
  return (
    <div id="compare" className="grid gap-4">
      <h2 className="text-lg font-semibold text-ink">{t("Attempt by attempt")}</h2>
      <section className={CARD}>
        <h3 className="text-base font-semibold text-ink">{t("The class: every test and practice in date order")}</h3>
        <p className="text-sm text-muted">{t("Score per standard on each attempt, with the change from the previous attempt (under it).")}</p>
        <div className="mt-2"><AttemptsView attempts={d.attempts} codes={d.heat.codes} t={t} title="Score attempt by attempt" /></div>
      </section>
      <section className={CARD}>
        <h3 className="text-base font-semibold text-ink">{t("Tests and practice side by side")}</h3>
        <p className="text-sm text-muted">{t("Does practice on a standard improve the next test on it? The average change between two tests on the same standard, for students who practised it in between and for those who did not.")}</p>
        {!d.practiceEffect.length ? <p className="mt-2 text-sm text-muted">{t("Not enough tests yet (two tests on the same standard are needed).")}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Standard")}</th><th>{t("Tests %")}</th><th>{t("Practice %")}</th><th>{t("Practised in between")}</th><th>{t("Not practised")}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {d.practiceEffect.map((x) => { const row = d.standards.find((s) => s.key === x.code); return (
                  <tr key={x.code}>
                    <td className="py-2"><b className="me-1 font-mono" dir="ltr">{x.short}</b><span className="text-ink-2">{t(MOE_BY_CODE.get(x.code)?.text ?? "")}</span></td>
                    <td className="text-center"><Pc v={row?.testPct} /></td><td className="text-center"><Pc v={row?.practicePct} /></td>
                    <td className="text-center"><Delta v={x.practised.delta} /><span className="block text-[11px] text-muted">{t("{n} pairs", { n: x.practised.pairs })}</span></td>
                    <td className="text-center"><Delta v={x.notPractised.delta} /><span className="block text-[11px] text-muted">{t("{n} pairs", { n: x.notPractised.pairs })}</span></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className={CARD}>
        <h3 className="text-base font-semibold text-ink">{t("Each student: first, previous and latest attempt")}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Student")}</th><th>{t("Attempts")}</th><th>{t("First")}</th><th>{t("Previous")}</th><th>{t("Latest")}</th><th>{t("Change from previous")}</th><th>{t("Change from first")}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {d.students.map((x) => (
                <tr key={x.id}>
                  <td className="py-2"><Link href={studentHref(x.id, d.scope.range)} className="font-semibold text-ink hover:underline">{x.name}</Link><span className="block text-xs text-muted">{x.className}</span></td>
                  <td className="text-center tabular-nums">{x.attempts}</td><td className="text-center"><Pc v={x.first} /></td><td className="text-center"><Pc v={x.prev} /></td><td className="text-center"><Pc v={x.latest} /></td>
                  <td className="text-center"><Delta v={x.dPrev} /></td><td className="text-center"><Delta v={x.dFirst} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const Chips = ({ codes, t }: { codes: string[]; t: TFn }) => codes.length ? <span className="inline-flex flex-wrap gap-1">{codes.map((c) => <span key={c} title={short(c, t)} className="max-w-[16rem] truncate rounded-full bg-surface px-2 py-0.5 text-[11px] ring-1 ring-line">{short(c, t)}</span>)}</span> : <span className="text-muted">—</span>;
function Actions({ practice, test, t }: { practice: string; test: string; t: TFn }) {
  return (
    <span className="flex flex-wrap gap-1.5 print:hidden">
      <Link href={practice} className="inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white">🎯 {t("Assign adaptive practice on these standards")}</Link>
      <Link href={test} className="inline-flex min-h-10 items-center rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white">📝 {t("Make a test on these standards")}</Link>
    </span>
  );
}

function Groups({ d, t }: { d: Dashboard; t: TFn }) {
  return (
    <div id="groups" className="grid gap-4">
      <h2 className="text-lg font-semibold text-ink">{t("Student groups")}</h2>
      <p className="text-sm text-muted">{t("From each student's latest NAFS test. Teacher-facing only: students never see these words.")} {NAFS_GROUPS.map((g, i) => `${t(g.name)} ${groupRange(i)}`).join(" · ")}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {d.groups.map((g) => (
          <section key={g.key} className={`${CARD} ring-2 ${GROUP_CLS[g.key].split(" ").find((c) => c.startsWith("ring-"))}`} aria-labelledby={`g-${g.key}`}>
            <h3 id={`g-${g.key}`} className="flex items-baseline justify-between gap-2 text-base font-semibold text-ink"><span className={`rounded-full px-2.5 py-0.5 ring-1 ${GROUP_CLS[g.key]}`}>{t(g.name)}</span><span className="text-sm font-normal text-muted">{groupRange(NAFS_GROUPS.findIndex((x) => x.key === g.key))} · {t("{n} students", { n: g.count })}</span></h3>
            {!g.classes.length ? <p className="mt-2 text-sm text-muted">{t("No student in this group.")}</p> : g.classes.map((c) => (
              <div key={c.classId} className="mt-3 rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                {d.school.classes.length > 1 && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{c.className}</p>}
                <ul className="mt-1 grid gap-1 text-sm">
                  {c.students.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={studentHref(x.id, d.scope.range)} className="font-semibold text-ink hover:underline">{x.name}</Link>
                      <span className="flex items-center gap-2"><Pc v={x.pct} />{x.move !== 0 && <span className={x.move > 0 ? "text-emerald-700" : "text-rose-700"} title={t(x.move > 0 ? "Moved up a group" : "Moved down a group")}>{x.move > 0 ? "▲" : "▼"}</span>}<Chips codes={x.weak} t={t} /></span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink-2">{t("Weak standards")}: <Chips codes={c.weak} t={t} /></p>
                {c.weak.length > 0 && <div className="mt-2"><Actions practice={c.practiceHref} test={c.testHref} t={t} /></div>}
              </div>
            ))}
          </section>
        ))}
      </div>
      {d.noTest.length > 0 && <p className={`${CARD} text-sm text-ink-2`}><b>{t("No NAFS test yet")}:</b> {d.noTest.map((x) => x.name).join(", ")}</p>}
      <section className={CARD} aria-labelledby="mv-h">
        <h3 id="mv-h" className="text-base font-semibold text-ink">{t("Movement since the previous test")}</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div><p className="text-sm font-semibold text-emerald-800">▲ {t("Moved up")} ({d.movement.up.length})</p><ul className="mt-1 grid gap-1 text-sm">{d.movement.up.map((x) => <li key={x.id}><Link href={studentHref(x.id, d.scope.range)} className="font-semibold text-ink hover:underline">{x.name}</Link> <span className="text-xs text-muted">{t(NAFS_GROUPS.find((g) => g.key === x.from)!.name)} → {t(NAFS_GROUPS.find((g) => g.key === x.to)!.name)} ({x.fromPct}% → {x.toPct}%)</span></li>)}</ul></div>
          <div><p className="text-sm font-semibold text-rose-800">▼ {t("Moved down")} ({d.movement.down.length})</p><ul className="mt-1 grid gap-1 text-sm">{d.movement.down.map((x) => <li key={x.id}><Link href={studentHref(x.id, d.scope.range)} className="font-semibold text-ink hover:underline">{x.name}</Link> <span className="text-xs text-muted">{t(NAFS_GROUPS.find((g) => g.key === x.from)!.name)} → {t(NAFS_GROUPS.find((g) => g.key === x.to)!.name)} ({x.fromPct}% → {x.toPct}%)</span></li>)}</ul></div>
        </div>
        <p className="mt-2 text-xs text-muted">{t("{n} stayed in the same group.", { n: d.movement.same })}</p>
      </section>
      <section className={CARD} aria-labelledby="wk-h">
        <h3 id="wk-h" className="text-base font-semibold text-ink">{t("Groups by weakest standard")}</h3>
        {!d.weakest.length ? <p className="mt-2 text-sm text-muted">{t("No student has a weak standard.")}</p> : (
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {d.weakest.map((w) => w.classes.map((c) => (
              <li key={`${w.code}:${c.classId}`} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
                <p className="text-sm font-semibold text-ink"><b className="me-1 font-mono" dir="ltr">{w.short}</b>{t(w.text)}{d.school.classes.length > 1 && <span className="text-xs font-normal text-muted"> · {c.className}</span>}</p>
                <p className="mt-1 text-sm text-ink-2">{c.students.map((x) => `${x.name} (${x.pct ?? "—"}%)`).join(", ")}</p>
                <div className="mt-2"><Actions practice={c.practiceHref} test={c.testHref} t={t} /></div>
              </li>
            )))}
          </ul>
        )}
      </section>
    </div>
  );
}

function School({ d, t }: { d: Dashboard; t: TFn }) {
  const codes = d.heat.codes;
  return (
    <div id="school" className="grid gap-4">
      <h2 className="text-lg font-semibold text-ink">{t(d.scope.admin ? "School view" : "Classes compared")}</h2>
      <section className={CARD}>
        <h3 className="text-base font-semibold text-ink">{t("Class against class on each standard")}</h3>
        <p className="text-sm text-muted">{t("Each cell: tests % / practice %.")}</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Class")}</th><th>{t("Students")}</th><th>{t("Tested")}</th><th>{t("Tests %")}</th><th>{t("Practice %")}</th>{codes.map((c) => <th key={c} className="px-0.5 align-bottom"><CodeHead code={c} t={t} /></th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {d.school.classes.map((c) => {
                const best = (code: string) => Math.max(...d.school.classes.map((x) => x.standards[code]?.test ?? -1));
                return (
                  <tr key={c.id}>
                    <td className="py-2 font-semibold text-ink"><Link href={`/teacher/nafs?tab=reports&view=detail&class=${c.id}`} className="hover:underline">{c.name}</Link></td>
                    <td className="text-center tabular-nums">{c.students}</td><td className="text-center tabular-nums">{c.tested}</td>
                    <td className="text-center"><Pc v={c.testPct} /></td><td className="text-center"><Pc v={c.practicePct} /></td>
                    {codes.map((code) => <td key={code} className={`text-center text-xs ${c.standards[code]?.test !== null && c.standards[code]?.test === best(code) && d.school.classes.length > 1 ? "font-bold" : ""}`}><Pc v={c.standards[code]?.test} /><span className="text-muted"> / </span><Pc v={c.standards[code]?.practice} /></td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className={CARD}>
        <h3 className="text-base font-semibold text-ink">{t("School → Grade 6 classes → students")}</h3>
        <div className="mt-2 grid gap-2">
          {d.school.classes.map((c) => (
            <details key={c.id} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
              <summary className="cursor-pointer font-semibold text-ink">{c.name} <span className="text-sm font-normal text-muted">· {t("{n} students", { n: c.students })} · {t("Tests %")} <Pc v={c.testPct} /></span></summary>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {c.members.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2">
                    <Link href={studentHref(x.id, d.scope.range)} className="text-ink hover:underline">{x.name}</Link>
                    <span className="flex items-center gap-2 text-xs">{x.group ? <span className={`rounded-full px-2 py-0.5 ring-1 ${GROUP_CLS[x.group]}`}>{t(NAFS_GROUPS.find((g) => g.key === x.group)!.name)}</span> : <span className="text-muted">{t("No NAFS test yet")}</span>}<Pc v={x.latest} /></span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
