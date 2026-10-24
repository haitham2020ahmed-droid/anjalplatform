import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { classFluencyView } from "@/server/fluency/class-view";
import { SEASON_NAME, NORM_SOURCE } from "@/server/fluency/norms";
import { saveFluencyAction } from "./actions";
import { getT } from "@/i18n/server";
import { InfoTip, ReportIntro, ReportSummary } from "@/components/report-kit";
import { fluencySummary } from "@/lib/report-summaries";

export const metadata = { title: "Reading Fluency" };
const TRAITS = [["phrasing", "Phr"], ["smoothness", "Smo"], ["pace", "Pace"], ["intonation", "Int"]] as const;
const GROUP_TONE = { DRILL: "bg-amber-50 ring-amber-200", PHRASED: "bg-violet-50 ring-violet-200", COMPREHENSION: "bg-sky-50 ring-sky-200", REPEATED: "bg-rose-50 ring-rose-200" } as const;
const GROUP_ICON = { DRILL: "⚡", PHRASED: "🎼", COMPREHENSION: "🧠", REPEATED: "🔁" } as const;
const DECISION_NAME: Record<string, string> = { NEW: "New plan", ON_TRACK: "On track", KEEP_GOING: "Under the goal line", RAISE: "Goal raised", NEXT_FOCUS: "Goal met → next area", CHANGE_METHOD: "No growth → Plan changed", EASIER_TEXT: "Accuracy first", CHECK_DUE: "Cold read due", NEW_CYCLE: "New cycle" };
const DECISION_TONE: Record<string, string> = { ON_TRACK: "bg-emerald-100 text-emerald-900", RAISE: "bg-emerald-100 text-emerald-900", NEXT_FOCUS: "bg-emerald-100 text-emerald-900", KEEP_GOING: "bg-amber-100 text-amber-900", CHECK_DUE: "bg-sky-100 text-sky-900", CHANGE_METHOD: "bg-rose-100 text-rose-900", EASIER_TEXT: "bg-rose-100 text-rose-900" };

/** 🔊 Oral reading fluency for a class: WCPM on the season's norms, prosody, comprehension, trends and groups. */
export default async function FluencyPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const v = classId ? await classFluencyView(repo, actor, classId) : null;
  const { t } = await getT();
  const tone = (lv: string | null) => (lv === "ABOVE" ? "bg-emerald-100 text-emerald-900" : lv === "ON" ? "bg-sky-100 text-sky-900" : "bg-rose-100 text-rose-900");
  const traitTone = (n: number | null) => (n === null ? "text-slate-500" : n >= 3 ? "bg-emerald-100 text-emerald-900" : n === 2 ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900");
  const arrow = { UP: "↗", DOWN: "↘", FLAT: "→" } as const;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="🔊" title="Reading Fluency" subtitle="Words correct per minute (WCPM) on the season's national norms, how the reading sounds (prosody), comprehension after reading, and suggested small groups. Students' 🎙 Fluency Coach 1-minute checks come in by themselves; you can also type a check after listening to a student read for one minute." />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <ReportIntro text="How fast and how well each student reads aloud (words correct per minute) against the season's benchmark." />
      <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/fluency?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}</nav>
      {v && (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-4">
            <Stat label={`50th percentile · Grade ${v.grade} · ${SEASON_NAME[v.season]}`} value={v.p50 ?? "—"} sub="WCPM benchmark now" />
            <Stat label="Checked" value={`${v.rows.filter((r) => r.wcpm !== null).length}/${v.rows.length}`} sub="students with a check" />
            <Stat label="Needs fluency work" value={v.rows.filter((r) => r.needsWork).length} sub="> 10 WCPM under the 50th percentile" />
            <Stat label="Fast, not understanding" value={v.rows.filter((r) => r.fastNotUnderstanding).length} sub="≥ 50th percentile, questions < 60%" />
          </section>

          {v.groups.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-bold text-brand-navy">Suggested groups</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {v.groups.map((g) => (
                  <div key={g.key} className={`rounded-2xl p-4 ring-1 ${GROUP_TONE[g.kind]}`}>
                    <p className="font-bold text-slate-900">{GROUP_ICON[g.kind]} {g.title} <span className="text-sm font-normal text-slate-500">· {g.students.length} student{g.students.length > 1 ? "s" : ""}</span></p>
                    <p className="mt-1 text-sm text-slate-700">{g.why}</p>
                    <p className="mt-2 text-sm">{g.students.map((x) => <span key={x.id} className="me-1.5 inline-block rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200" title={x.detail}>{x.name}</span>)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {v.rows.some((r) => r.plan) && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <h2 className="font-bold text-brand-navy">🧭 {t("Fluency plans")}</h2>
              <p className="mb-3 text-xs text-slate-500">{t("Made from each student's readings and cold reads; they adjust by themselves: goal line met twice → goal raised; no growth after 2 weeks → Plan B; under 90% accuracy → easier passages.")}</p>
              <ul className="space-y-2">
                {v.rows.filter((r) => r.plan).map((r) => { const pl = r.plan!; const tone = DECISION_TONE[pl.status.decision] ?? "bg-slate-100 text-slate-800"; return (
                  <li key={r.id}>
                    <details className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <b className="min-w-[8rem] text-slate-900">{r.name}</b>
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-900">{pl.focusName}{pl.methodSet === "B" ? " · Plan B" : ""}</span>
                        <span className="tabular-nums text-slate-700">{pl.baseline.wcpm} → <b>{pl.goals.wcpm}</b> WCPM {t("by")} {pl.endsOn.slice(0, 10)} (+{pl.goals.weeklyGain}/{t("wk")}) · {t("accuracy")} {pl.baseline.accuracy}% → {pl.goals.accuracy}%</span>
                        <span className="tabular-nums text-slate-600">{t("Week {n} of {m}", { n: Math.min(pl.weeks, pl.status.week), m: pl.weeks })} · {t("goal line")} {pl.onLine}{pl.status.latest !== null ? <> · {t("latest cold read")} <b className={pl.status.latest >= pl.onLine - 1 ? "text-emerald-700" : "text-rose-700"}>{pl.status.latest}</b></> : null}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{t(DECISION_NAME[pl.status.decision])}</span>
                      </summary>
                      <div className="mt-2 grid gap-3 text-sm md:grid-cols-2">
                        <div>
                          <p className="font-semibold text-slate-800">{pl.status.teacher}</p>
                          <p className="mt-2 text-xs font-bold uppercase text-slate-500">{t("Daily routine")} · {pl.minutesPerDay} {t("min")} · {pl.daysPerWeek} {t("days/week")} · {pl.weeks} {t("weeks")}</p>
                          <ol className="mt-1 list-inside list-decimal space-y-1 text-slate-700">{pl.daily.map((st, i) => <li key={i}><b>{st.title}</b> ({st.minutes} {t("min")}): {st.teacher}</li>)}<li><b>{pl.weekly.title}</b> ({pl.weekly.minutes} {t("min")}): {pl.weekly.teacher}</li></ol>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-500">{t("Success criteria")}</p>
                          <ul className="mt-1 list-inside list-disc text-slate-700">{pl.success.map((x, i) => <li key={i}>{x.teacher}</li>)}</ul>
                          <p className="mt-2 text-xs font-bold uppercase text-slate-500">{t("When it moves on")}</p>
                          <ul className="mt-1 list-inside list-disc text-xs text-slate-600">{pl.rules.map((x, i) => <li key={i}>{x}</li>)}</ul>
                          {pl.words.length > 0 && <p className="mt-2 text-xs text-slate-600">{t("Words")}: {pl.words.join(", ")}{pl.patterns.length ? ` · ${t("patterns")}: ${pl.patterns.join(", ")}` : ""}</p>}
                        </div>
                      </div>
                    </details>
                  </li>); })}
              </ul>
            </section>
          )}

          {v.patterns.length > 0 && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <h2 className="mb-2 font-bold text-brand-navy">Most-missed patterns in the class</h2>
              <ul className="flex flex-wrap gap-2 text-sm">{v.patterns.map((p) => <li key={p.code} className="rounded-xl bg-amber-50 px-3 py-1.5 ring-1 ring-amber-200"><b>{p.label}</b> · {p.students} student{p.students > 1 ? "s" : ""} <span className="text-xs text-slate-500">({p.words.slice(0, 4).join(", ")})</span></li>)}</ul>
              {v.missed.length > 0 && <p className="mt-2 text-xs text-slate-500">Words missed by 2+ students: {v.missed.map((m) => `${m.word} (${m.students})`).join(" · ")}</p>}
            </section>
          )}

          <form action={saveFluencyAction} className="rk-morebox rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <input type="hidden" name="classId" value={classId} />
            <p className="mb-3 text-sm text-slate-600">Rubric now · <b>{v.rubric}</b> ({NORM_SOURCE}, {SEASON_NAME[v.season]}). Each check is read on the norms of its own season. <span className="rounded bg-rose-100 px-1">Approaching</span> <span className="rounded bg-sky-100 px-1">Meeting</span> <span className="rounded bg-emerald-100 px-1">Exceeding</span> · prosody 1–4 (Phr phrasing · Smo smoothness · Pace · Int intonation).</p>
            <label className="mb-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal print:hidden"><input type="checkbox" className="rk-more-toggle" /> {t("More details")}</label>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2">Student</th><th>WCPM <InfoTip text="Words read correctly in one minute." /></th><th className="rk-more">Percentile</th><th className="rk-more">Prosody</th><th className="text-center">Questions <InfoTip text="% of the questions after reading that were right." /></th><th className="rk-more">Trend (last 5)</th><th>Flags</th><th className="rk-more">🎙 Coach (14 d)</th><th>New WCPM</th><th>Acc. %</th><th>Note</th></tr></thead>
                <tbody>
                  {v.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 font-medium">{r.name}<input type="hidden" name="studentId" value={r.id} /></td>
                      <td>{r.wcpm !== null ? <span className={`rounded px-2 py-0.5 font-bold tabular-nums ${tone(r.band)}`} title={r.band ?? ""}>{r.wcpm}</span> : <span className="text-slate-400">—</span>}{r.date && <span className="block text-[11px] text-slate-500">{r.date}{r.source === "RECORDING" ? " 📼" : r.source === "COACH" ? " 🎙" : ""}</span>}</td>
                      <td className="rk-more text-xs">{r.percentile !== null ? <><b className="tabular-nums">{r.percentile}</b><span className="block text-slate-500">{r.season ? SEASON_NAME[r.season] : ""}</span></> : "—"}</td>
                      <td className="rk-more">{r.prosody ? <span className="flex gap-1">{TRAITS.map(([k, l]) => <span key={k} title={k} className={`rounded px-1 text-[11px] font-bold ${traitTone(r.prosody![k])}`}>{l} {r.prosody![k] ?? "–"}</span>)}</span> : <span className="text-slate-400">—</span>}</td>
                      <td className="text-center tabular-nums">{r.comprehension !== null ? `${r.comprehension}%` : "—"}</td>
                      <td className="rk-more text-xs tabular-nums text-slate-600">{r.trend.join(" → ") || "—"} {r.direction && <b className={r.direction === "UP" ? "text-emerald-700" : r.direction === "DOWN" ? "text-rose-700" : "text-slate-500"}>{arrow[r.direction]}</b>}</td>
                      <td className="text-xs">{r.needsWork && <span className="me-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-900">needs fluency work</span>}{r.fastNotUnderstanding && <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 font-bold text-sky-900">fast, not understanding</span>}</td>
                      <td className="rk-more text-xs text-slate-600">{r.practices ? `${r.practices} reading(s)` : "—"}{r.expression ? ` · expr. ${r.expression}/4` : ""}</td>
                      <td><input type="number" name={`w-${r.id}`} min={0} max={400} className="w-20 rounded-lg border border-slate-300 px-2 py-1" aria-label={`${r.name}: words correct per minute`} /></td>
                      <td><input type="number" name={`a-${r.id}`} min={0} max={100} className="w-16 rounded-lg border border-slate-300 px-2 py-1" aria-label={`${r.name}: accuracy`} /></td>
                      <td><input name={`n-${r.id}`} maxLength={500} placeholder="e.g. reads word by word" className="w-full min-w-[10rem] rounded-lg border border-slate-300 px-2 py-1" aria-label={`${r.name}: note`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end"><button className="rounded-xl bg-brand-navy px-6 py-2.5 font-bold text-white hover:bg-brand-purple">Save checks</button></div>
          </form>
          <ReportSummary summary={fluencySummary(v, classId)} />
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="text-3xl font-extrabold tabular-nums text-brand-navy">{value}</p><p className="text-xs text-slate-500">{sub}</p></div>;
}
