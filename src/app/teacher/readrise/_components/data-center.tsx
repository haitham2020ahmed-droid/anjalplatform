/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * 🚀 ReadRise Teacher Data Center (round 6, owner: "like Achieve3000"), server-rendered, no client JS:
 * Class Overview table, Class Dashboard tiles + charts, a student's Level Detail and Activity Tracker, the class
 * settings card, the "By week" plan and the teacher materials panel. Levels are shown with formatLevel (BR…L).
 */
import Link from "next/link";
import { Section } from "@/components/page-header";
import type { TFn } from "@/i18n";
import { formatLevel } from "@/server/readrise/level";
import type { ActivityRow, ClassOverview, LevelDetail, TrendPoint } from "@/server/readrise/teacher-report";
import { rateText } from "@/server/readrise/teacher-report";
import type { ClassSettings, PlanWeek, TeacherGuide } from "@/server/readrise/teacher";
import { setReadRiseClassSettingAction, undoReadRiseDropAction } from "../actions";

const lv = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatLevel(n));
const sg = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n > 0 ? `+${n}` : String(n));
const pc = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);
const day = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString().slice(0, 10) : "—");
const BAND_TONE: Record<string, string> = {
  FAR_BELOW: "bg-red-50 text-red-800 ring-red-200", APPROACHES: "bg-amber-50 text-amber-900 ring-amber-200",
  MEETS: "bg-emerald-50 text-emerald-800 ring-emerald-200", EXCEEDS: "bg-sky-50 text-sky-800 ring-sky-200",
};

// ------------------------------------------------------------------ charts (plain SVG)

/** Ticks every 100/200 points covering the values; labels with formatLevel. */
function levelTicks(values: (number | null)[]): { min: number; max: number; ticks: number[] } {
  const vs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = vs.length ? Math.min(...vs) : 300, hi = vs.length ? Math.max(...vs) : 1200;
  const min = Math.floor((lo - 50) / 100) * 100, max = Math.ceil((hi + 50) / 100) * 100;
  const step = max - min > 800 ? 200 : 100;
  const ticks: number[] = [];
  for (let x = min; x <= max; x += step) ticks.push(x);
  return { min, max, ticks };
}

export interface LineSeries { name: string; color: string; points: (number | null)[]; dash?: boolean; width?: number }

/** A level line chart (levels may be below 0: "BR…L"), with an optional shaded range. */
export function LevelLines({ labels, series, title, band, unit = "level" }: { labels: string[]; series: LineSeries[]; title: string; band?: { min: number; max: number; label: string }; unit?: "level" | "pct" }) {
  const W = 640, H = 240, L = 58, R = 14, T = 12, B = 28;
  const all = series.flatMap((x) => x.points).concat(band ? [band.min, band.max] : []);
  const r = unit === "pct" ? { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] } : levelTicks(all);
  const span = Math.max(1, r.max - r.min);
  const x = (i: number) => L + (labels.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + ((r.max - Math.min(r.max, Math.max(r.min, v))) * (H - T - B)) / span;
  const tick = (v: number) => (unit === "pct" ? `${v}%` : formatLevel(v));
  return (
    <figure className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        {band && <rect x={L} width={W - L - R} y={y(band.max)} height={Math.max(0, y(band.min) - y(band.max))} fill="#bbf7d0" opacity={0.55} />}
        {r.ticks.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#e2e8f0" />
            <text x={L - 6} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#64748b">{tick(g)}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={`${l}-${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748b">{l}</text>)}
        {series.map((sr) => {
          let d = "";
          sr.points.forEach((v, i) => { if (v === null) return; d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
          return (
            <g key={sr.name}>
              {d && <path d={d} fill="none" stroke={sr.color} strokeWidth={sr.width ?? 3} strokeDasharray={sr.dash ? "6 5" : undefined} strokeLinejoin="round" strokeLinecap="round" />}
              {sr.points.map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill="#fff" stroke={sr.color} strokeWidth={2} />)}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-sm text-slate-600">
        {series.map((sr) => <span key={sr.name} className="flex items-center gap-2"><span className="h-1 w-5 rounded" style={{ background: sr.color }} />{sr.name}</span>)}
        {band && <span className="flex items-center gap-2"><span className="h-3 w-5 rounded bg-green-200" />{band.label}</span>}
      </figcaption>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>{labels.map((l, i) => <tr key={`${l}-${i}`}><th scope="row">{l}</th>{series.map((sr) => <td key={sr.name}>{sr.points[i] === null ? "—" : tick(sr.points[i]!)}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

/** First-try average bars (one per week or month) with the count under each bar; 65% and 75% lines. */
export function TrendBars({ points, title }: { points: TrendPoint[]; title: string }) {
  return (
    <figure>
      <div className="relative flex h-40 items-end gap-1" role="img" aria-label={title}>
        <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-500" style={{ bottom: "75%" }} />
        <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-red-400" style={{ bottom: "65%" }} />
        {points.map((p, i) => (
          <div key={`${p.label}-${i}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="text-[11px] font-semibold tabular-nums text-slate-700">{p.avg === null ? "" : `${p.avg}%`}</span>
            <span className={`w-full rounded-t ${p.avg === null ? "" : p.avg >= 75 ? "bg-emerald-500" : p.avg >= 65 ? "bg-amber-400" : "bg-red-400"}`} style={{ height: `${p.avg ?? 0}%`, minHeight: p.avg === null ? 0 : 3 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 border-t border-slate-200 pt-1">
        {points.map((p, i) => <span key={`${p.label}-${i}`} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500">{p.label}<span className="block">N={p.n}</span></span>)}
      </div>
      <table className="sr-only"><caption>{title}</caption><tbody>{points.map((p, i) => <tr key={i}><th scope="row">{p.label}</th><td>{p.avg ?? "—"}</td><td>{p.n}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** Students by level (the "BR" bar holds every level below 0); empty edge bars outside the band are trimmed. */
export function LevelBars({ buckets, title, t }: { buckets: { from: number; to: number; count: number; inBand: boolean; label?: string }[]; title: string; t: TFn }) {
  let a = 0, b = buckets.length - 1;
  while (a < b && !buckets[a].count && !buckets[a].inBand) a++;
  while (b > a && !buckets[b].count && !buckets[b].inBand) b--;
  const shown = buckets.slice(a, b + 1);
  const max = Math.max(1, ...shown.map((x) => x.count));
  const label = (x: (typeof buckets)[number]) => x.label ?? String(x.from);
  return (
    <figure className="overflow-hidden">
      <div className="flex h-40 items-end gap-1" role="img" aria-label={title}>
        {shown.map((x) => (
          <div key={x.from} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="text-[11px] font-semibold tabular-nums text-slate-600">{x.count || ""}</span>
            <span className={`w-full rounded-t ${x.inBand ? "bg-teal-500" : "bg-slate-300"}`} style={{ height: `${(100 * x.count) / max}%`, minHeight: x.count ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 border-t border-slate-200 pt-1">{shown.map((x) => <span key={x.from} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500">{label(x)}</span>)}</div>
      <figcaption className="mt-2 flex items-center gap-2 text-xs text-slate-500"><span className="h-3 w-4 rounded bg-teal-500" />{t("inside the grade's Meets range")}<span className="ms-3 h-3 w-4 rounded bg-slate-300" />{t("outside")}</figcaption>
      <table className="sr-only"><caption>{title}</caption><tbody>{shown.map((x) => <tr key={x.from}><th scope="row">{label(x)}</th><td>{x.count}</td></tr>)}</tbody></table>
    </figure>
  );
}

// ------------------------------------------------------------------ Class Overview

export function ClassOverviewTable({ o, classId, t }: { o: ClassOverview; classId: string; t: TFn }) {
  return (
    <Section title="Class Overview" icon="📋" hint={t("First-try scores only. Pre-test = the year's first placement. Expected levels are estimates from typical yearly growth (a minimum to aim past): students who read 2+ articles a week at 75% usually grow more.")}>
      {o.students.length === 0 ? <p className="text-sm text-slate-600">{t("No students in this class yet.")}</p> : (
        <div className="rk-box rk-tall">
          <table data-testid="rr-overview" className="w-full min-w-[64rem] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="p-2">{t("Student")}</th><th className="p-2">{t("Activities completed")}</th><th className="p-2">{t("Avg first-try score")}</th>
                <th className="p-2">{t("Pre-test level")}</th><th className="p-2">{t("Current level")}</th><th className="p-2">{t("Grade band")}</th>
                <th className="p-2">{t("Expected current level")}</th><th className="p-2">{t("Expected end-of-year level")}</th><th className="p-2">{t("Growth to date")}</th><th className="p-2">{t("Alerts")}</th>
              </tr>
            </thead>
            <tbody>
              {o.students.map((x) => (
                <tr key={x.studentId} className="border-b align-top last:border-0">
                  <td className="p-2 font-semibold text-brand-navy"><Link href={`/teacher/readrise?class=${classId}&student=${x.studentId}&view=detail`} className="hover:underline">{x.name}</Link></td>
                  <td className="p-2 tabular-nums"><Link href={`/teacher/readrise?class=${classId}&student=${x.studentId}&view=activities`} className="hover:underline">{x.activities}</Link></td>
                  <td className="p-2 tabular-nums">
                    <span className={x.attention ? "font-bold text-red-700" : (x.avgFirstTry ?? 0) >= 75 ? "text-emerald-700" : ""}>{pc(x.avgFirstTry)}</span>
                    {x.attention && <span data-testid="rr-attention" className="ms-1 block text-[11px] font-semibold text-red-700">{t("Attention! below 65%")}</span>}
                  </td>
                  <td className="p-2 tabular-nums text-slate-600">{lv(x.preTest)}</td>
                  <td className="p-2 font-bold tabular-nums">{x.placed ? lv(x.current) : <span className="text-xs font-semibold text-amber-800">{t("No placement yet")}</span>}</td>
                  <td className="p-2">{x.band ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${BAND_TONE[x.band]}`}>{t(x.bandLabel!)}</span> : "—"}</td>
                  <td className="p-2 tabular-nums text-slate-600">{lv(x.expectedNow)}</td>
                  <td className="p-2 tabular-nums text-slate-600">{lv(x.expectedEnd)}</td>
                  <td className={`p-2 font-semibold tabular-nums ${x.growth === null ? "" : x.growth > 0 ? "text-emerald-700" : x.growth < 0 ? "text-red-700" : "text-slate-600"}`}>{sg(x.growth)}</td>
                  <td className="p-2">
                    <span className="flex flex-wrap gap-1 text-[11px] font-semibold">
                      {x.signals?.notReading && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-800 ring-1 ring-red-200">🔴 {t("Not reading")}</span>}
                      {x.signals?.belowGoal && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-900 ring-1 ring-orange-200">🟠 {t("Reading, below 75%")}</span>}
                      {x.signals?.missedGoal2w && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-800 ring-1 ring-slate-200">📉 {t("Goal missed 2 weeks")}</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ Class Dashboard

function Tile({ label, value, note, tone = "slate" }: { label: string; value: string; note?: string; tone?: "slate" | "teal" | "red" | "amber" }) {
  const c = { slate: "bg-white ring-slate-200", teal: "bg-teal-50 ring-teal-200", red: "bg-red-50 ring-red-200", amber: "bg-amber-50 ring-amber-200" }[tone];
  return (
    <div className={`rounded-2xl p-4 ring-1 ${c}`}>
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-brand-navy">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export function ClassDashboardView({ o, distribution, t }: { o: ClassOverview; distribution: { from: number; to: number; count: number; inBand: boolean; label?: string }[]; t: TFn }) {
  const x = o.tiles;
  return (
    <div className="space-y-6" data-testid="rr-class-dashboard">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("Average score per activity (1st try)")} value={pc(x.avgScore)} note={t("N = {n} activities", { n: x.scoreN })} tone={x.avgScore !== null && x.avgScore < 65 ? "red" : (x.avgScore ?? 0) >= 75 ? "teal" : "slate"} />
        <Tile label={t("Average activities per week")} value={rateText(x.avgPerWeek)} note={t("per student, this school year")} />
        <Tile label={t("Average activities completed per student")} value={rateText(x.avgPerStudent)} />
        <Tile label={t("Pre-test average")} value={lv(x.preTestAvg)} />
        <Tile label={t("Current average")} value={lv(x.currentAvg)} tone="teal" />
        <Tile label={t("Initial expected post-test average")} value={lv(x.initialExpectedAvg)} note={t("an estimate")} />
        <Tile label={t("Actual growth")} value={sg(x.actualGrowth)} tone={(x.actualGrowth ?? 0) < 0 ? "amber" : "slate"} />
        <Tile label={t("Grade {g} end-of-year “Meets” range", { g: o.grade })} value={`${formatLevel(o.meets.min)}–${formatLevel(o.meets.max)}`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="First-try average by week" icon="📊" hint={t("Each bar: the class's average first-try score that week (N = activities). Dashed lines: 75% goal and 65%.")}>
          <TrendBars points={o.weekly} title={t("First-try average by week")} />
        </Section>
        <Section title="First-try average by month" icon="🗓">
          <TrendBars points={o.monthly} title={t("First-try average by month")} />
        </Section>
        <Section title="Class level progress by month" icon="📈" hint={t("The class's average level at the end of each month.")}>
          {o.levelByMonth.every((m) => m.avg === null) ? <p className="text-sm text-slate-600">{t("No student has been placed yet.")}</p> :
            <LevelLines labels={o.levelByMonth.map((m) => m.month)} series={[{ name: t("Class average"), color: "#0f766e", points: o.levelByMonth.map((m) => m.avg) }]} title={t("Class level progress by month")} band={{ min: o.meets.min, max: o.meets.max, label: t("Meets (end of year)") }} />}
        </Section>
        <Section title="Where the class is" icon="📊">
          <LevelBars buckets={distribution} title={t("Students by ReadRise Level")} t={t} />
        </Section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ one student

export function StudentViewNav({ classId, studentId, view, t }: { classId: string; studentId: string; view: string; t: TFn }) {
  const items = [["growth", t("Growth")], ["detail", t("Level detail")], ["activities", t("Activity tracker")]] as const;
  return (
    <nav aria-label={t("Student")} className="mb-4 flex flex-wrap gap-2">
      <Link href={`/teacher/readrise?class=${classId}&tab=overview`} className="me-2 self-center text-sm font-semibold text-brand-teal hover:underline">‹ {t("Back to the class")}</Link>
      {items.map(([k, label]) => (
        <Link key={k} href={`/teacher/readrise?class=${classId}&student=${studentId}${k === "growth" ? "" : `&view=${k}`}`} aria-current={view === k ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${view === k ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}>{label}</Link>
      ))}
    </nav>
  );
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const p = Math.min(100, Math.round((100 * value) / Math.max(1, max)));
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600"><span>{label}</span><span className="tabular-nums">{p}%</span></div>
      <div className="mt-1 h-3 rounded-full bg-slate-100" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-3 rounded-full ${p >= 100 ? "bg-emerald-500" : "bg-brand-teal"}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function LevelDetailView({ d, t }: { d: LevelDetail; t: TFn }) {
  const mins = (s: number | null) => (s === null ? "—" : t("{m} min", { m: Math.max(1, Math.round(s / 60)) }));
  return (
    <div className="space-y-6" data-testid="rr-level-detail">
      <h2 className="text-2xl font-bold text-brand-navy">{d.name}</h2>
      {d.undoDrop && (
        <form action={undoReadRiseDropAction} className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-4 text-sm ring-1 ring-amber-200" data-testid="rr-undo-drop">
          <input type="hidden" name="classId" value={d.classId} />
          <input type="hidden" name="studentId" value={d.studentId} />
          <p className="flex-1 text-amber-900">📉 {t("The level dropped automatically: {a} → {b}.", { a: formatLevel(d.undoDrop.from), b: formatLevel(d.undoDrop.to) })} <span className="text-amber-800">{t("If you think the drop is wrong, you can undo it within 7 days (then no automatic drop for the next 8 articles).")}</span></p>
          <button className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700">↩️ {t("Undo the drop")}</button>
        </form>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Section title="Annual goal" icon="🎯" hint={t("{a} activities with a {p}% first-try average this school year.", { a: d.goal.target, p: d.goal.targetAvg })}>
          <div className="space-y-3">
            <Meter value={d.goal.activities} max={d.goal.target} label={t("Activities: {n} of {m}", { n: d.goal.activities, m: d.goal.target })} />
            <Meter value={d.goal.avg ?? 0} max={d.goal.targetAvg} label={t("First-try average: {p} (goal {g}%)", { p: pc(d.goal.avg), g: d.goal.targetAvg })} />
            {d.goal.met && <p className="text-sm font-semibold text-emerald-700">✓ {t("Annual goal met")}</p>}
          </div>
        </Section>
        <Section title="Level" icon="📈">
          {!d.placed ? <p className="text-sm text-slate-600">{t("No placement yet")}</p> : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">{t("Pre-test level")}</dt><dd className="text-lg font-bold tabular-nums">{lv(d.preTest)}</dd></div>
              <div><dt className="text-xs text-slate-500">{t("Current level")}</dt><dd className="text-lg font-bold tabular-nums text-brand-navy">{lv(d.current)}</dd></div>
              <div><dt className="text-xs text-slate-500">{t("Growth to date")}</dt><dd className="text-lg font-bold tabular-nums">{sg(d.growth)}</dd></div>
              <div><dt className="text-xs text-slate-500">{t("Grade band")}</dt><dd>{d.band ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${BAND_TONE[d.band]}`}>{t(d.bandLabel!)}</span> : "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">{t("Initial forecast (end of year)")}</dt><dd className="font-semibold tabular-nums">{lv(d.forecast?.initial)}</dd></div>
              <div><dt className="text-xs text-slate-500">{t("Updated forecast (end of year)")}</dt><dd className="font-semibold tabular-nums">{lv(d.forecast?.updated)}</dd></div>
            </dl>
          )}
        </Section>
      </div>
      {d.chart && (
        <Section title="Growth" icon="📈" hint={t("Actual level by month, the start-of-year forecast and the updated forecast. Green: the grade's end-of-year “Meets” range.")}>
          <LevelLines labels={d.chart.months} title={t("Level growth by month")} band={{ min: d.chart.meets.min, max: d.chart.meets.max, label: t("Meets (end of year)") }}
            series={[
              { name: t("Actual"), color: "#1e3a8a", points: d.chart.actual, width: 4 },
              { name: t("Initial forecast"), color: "#94a3b8", points: d.chart.initial, dash: true, width: 2 },
              { name: t("Expected growth"), color: "#f97316", points: d.chart.expected, dash: true, width: 2 },
            ]} />
        </Section>
      )}
      <Section title="Assessments" icon="🧭" hint={t("Each placement test and reading check of this school year.")}>
        {d.assessments.length === 0 ? <p className="text-sm text-slate-600">{t("No assessments yet.")}</p> : (
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="p-2">{t("Date")}</th><th className="p-2">{t("Questions")}</th><th className="p-2">{t("Time taken")}</th><th className="p-2">{t("Result")}</th></tr></thead>
            <tbody>{d.assessments.map((a, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-2 tabular-nums">{day(a.at)}</td><td className="p-2 tabular-nums">{a.questions}</td><td className="p-2 tabular-nums">{mins(a.seconds)}</td>
                <td className="p-2 font-semibold tabular-nums">{a.valid ? lv(a.result) : <span className="text-xs text-slate-500">{t("Not valid")}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

export function ActivityTrackerView({ name, rows, t }: { name: string; rows: ActivityRow[]; t: TFn }) {
  const tip = t("One or more activity scores may be invalid");
  return (
    <div className="space-y-4" data-testid="rr-activity-tracker">
      <h2 className="text-2xl font-bold text-brand-navy">{name}</h2>
      <Section title="Activity tracker" icon="🗂" hint={t("Every article, newest first. The activity score is the first try; ⚠ marks a score that may be invalid (answers too fast).")}>
        {rows.length === 0 ? <p className="text-sm text-slate-600">{t("No articles read yet.")}</p> : (
          <div className="rk-box rk-tall">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead><tr className="border-b text-xs text-slate-500">
                <th className="p-2">{t("Article")}</th><th className="p-2">{t("Assigned or self-selected")}</th><th className="p-2">{t("Type")}</th><th className="p-2">{t("Version level")}</th>
                <th className="p-2">{t("Activity score")}</th><th className="p-2">{t("2nd try")}</th><th className="p-2">{t("Date")}</th><th className="p-2">{t("Duration (minutes)")}</th>
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.runId} className="border-b last:border-0">
                  <td className="p-2 font-semibold text-brand-navy">{r.title}</td>
                  <td className="p-2">{r.assigned ? t("Assigned") : t("Self-selected")}</td>
                  <td className="p-2">{r.kind === "stretch" ? t("Stretch") : t("5-step")}</td>
                  <td className="p-2 tabular-nums">{lv(r.versionLevel)}</td>
                  <td className="p-2 tabular-nums">
                    {!r.done ? <span className="text-xs text-slate-500">{t("In progress")}</span> : <span className={(r.score ?? 0) >= 75 ? "font-semibold text-emerald-700" : (r.score ?? 100) < 65 ? "font-semibold text-red-700" : ""}>{pc(r.score)}</span>}
                    {!r.firstTry && r.done && <span className="ms-1 text-[11px] text-slate-500">({t("re-read")})</span>}
                    {r.invalid && <span data-testid="rr-invalid" title={tip} aria-label={tip} className="ms-1 cursor-help text-amber-600">⚠</span>}
                  </td>
                  <td className="p-2 tabular-nums">{pc(r.secondTry)}</td>
                  <td className="p-2 tabular-nums">{day(r.at)}</td>
                  <td className="p-2 tabular-nums">{r.minutes === null ? "—" : r.minutes}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ settings, plan, teacher materials

export function ClassSettingsCard({ classId, s, canWrite, t }: { classId: string; s: ClassSettings; canWrite: boolean; t: TFn }) {
  const rows = [
    ["feedOff", t("Turn off the Reflect comment feed"), s.feedOff],
    ["badgesOff", t("Hide celebration and badge messages"), s.badgesOff],
    ["weeklyAuto", t("Weekly plan: 3 new articles every Sunday"), s.weeklyAuto],
  ] as const;
  return (
    <details className="mb-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200" data-testid="rr-class-settings">
      <summary className="cursor-pointer text-sm font-semibold text-brand-navy">⚙ {t("Class settings")}</summary>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map(([key, label, on]) => (
          <li key={key} className="flex flex-wrap items-center gap-3">
            <span className="me-auto">{label}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${on ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{on ? t("On") : t("Off")}</span>
            {canWrite && (
              <form action={setReadRiseClassSettingAction}>
                <input type="hidden" name="classId" value={classId} /><input type="hidden" name="key" value={key} /><input type="hidden" name="on" value={on ? "0" : "1"} />
                <button className="rounded-lg px-3 py-1 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{on ? t("Turn off") : t("Turn on")}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ByWeekView({ weeks, t }: { weeks: PlanWeek[]; t: TFn }) {
  if (!weeks.length) return <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("Nothing assigned yet. Turn on the weekly plan in Class settings, or assign articles.")}</p>;
  return (
    <div className="space-y-4" data-testid="rr-by-week">
      {weeks.map((w) => (
        <Section key={w.week} title={t("Week of {d}", { d: w.week })} icon="📅">
          <ul className="divide-y divide-slate-100 text-sm">
            {w.articles.map((a) => (
              <li key={a.articleId} className="flex flex-wrap items-center gap-3 py-2">
                <span className="me-auto min-w-0"><b className="text-brand-navy">{a.title}</b> <span className="text-xs text-slate-500">{a.topic}</span></span>
                {a.strategy && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200">{t(a.strategy)}</span>}
                {a.auto && <span className="text-xs text-slate-500">{t("weekly plan")}</span>}
                <span className="text-xs tabular-nums text-slate-500">{day(a.startAt)} → {day(a.dueAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

export function TeacherMaterials({ g, t }: { g: TeacherGuide; t: TFn }) {
  const terms = (list: { term: string; def: string }[]) => <dl className="space-y-1">{list.map((x) => <div key={x.term}><dt className="inline font-semibold">{x.term}</dt>: <dd className="inline text-slate-700">{x.def}</dd></div>)}</dl>;
  return (
    <section data-testid="rr-teacher-materials" className="mb-6 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <h2 className="text-lg font-bold text-brand-navy">🧑‍🏫 {t("Teacher materials")}</h2>
      <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
        {g.summary && <div><h3 className="font-semibold text-slate-700">{t("Summary")}</h3><p className="mt-1 text-slate-800">{g.summary}</p></div>}
        {g.introduce && <div><h3 className="font-semibold text-slate-700">{t("Introduce the article")}</h3><p className="mt-1 text-slate-800">{g.introduce}</p></div>}
        {g.keyTerms.length > 0 && <div><h3 className="font-semibold text-slate-700">{t("Key terms")}</h3><div className="mt-1">{terms(g.keyTerms)}</div></div>}
        {g.challengeTerms.length > 0 && <div><h3 className="font-semibold text-slate-700">{t("Challenge terms")}</h3><div className="mt-1">{terms(g.challengeTerms)}</div></div>}
        {g.discussion.length > 0 && <div><h3 className="font-semibold text-slate-700">{t("Discussion questions")}</h3><ol className="mt-1 list-decimal space-y-1 ps-5">{g.discussion.map((q) => <li key={q}>{q}</li>)}</ol></div>}
        {g.strategy && <div><h3 className="font-semibold text-slate-700">{t("Reading strategy")}</h3><p className="mt-1 text-slate-800">{g.strategy}</p></div>}
      </div>
    </section>
  );
}
