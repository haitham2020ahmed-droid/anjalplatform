import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherReadRiseClasses } from "@/server/readrise/teacher";
import { readRiseTeacherReport, RISING_GAIN, STUCK_DAYS, type ReportStudent } from "@/server/readrise/teacher-report";
import { RR_PERIOD_NAME, RR_PERIODS } from "@/server/readrise/windows";
import { exportsOf } from "@/components/reports/report-ui";
import { AtAGlance, ReportHeader, ReportIntro, ReportSection, ReportSummary } from "@/components/report-kit";
import { readRiseSummary } from "@/lib/report-summaries";
import { ReadRiseTabs, TEACHER_TABS } from "@/app/admin/readrise/_components/tabs";
import { day, fmt, signed } from "@/app/admin/readrise/_components/ui";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";

export const metadata = { title: "ReadRise report" };
export const dynamic = "force-dynamic";

/**
 * 📋 ReadRise report (owner r69 item 4): one clear page per class — each student's level line (placements and
 * changes) with the end-of-year estimate, the three reading checks, "Stuck" and "Rising fast", class accuracy by
 * question type, unreliable readings and the downloads. The level is always "the ReadRise level".
 */
export default async function ReadRiseReportPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [classes, { t }] = await Promise.all([teacherReadRiseClasses(repo, actor), getT()]);
  const klass = classes.find((c) => c.id === sp.class) ?? classes.find((c) => c.own) ?? classes[0];
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const header = (
    <ReportHeader back={{ href: "/teacher/readrise", label: "ReadRise" }} icon="📋" title="ReadRise report"
      subtitle={t("Each student's ReadRise level over the year, the reading checks, who is stuck or rising fast, and accuracy by question type.")}
      who={klass?.name} downloads={klass ? exportsOf({ kind: "readrise", classId: klass.id, period: "TERM" }) : []}
      filters={classes.length ? <nav aria-label="Class" className="flex flex-wrap gap-2">
        {classes.map((c) => <Link key={c.id} href={`/teacher/readrise/report?class=${c.id}`} className={chip(c.id === klass?.id)}>{c.name}</Link>)}
      </nav> : undefined}>
      <ReadRiseTabs items={TEACHER_TABS} current="/teacher/readrise/report" />
    </ReportHeader>
  );
  if (!klass) return <AppShell name={String(me.displayName)}>{header}<p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("You have no classes yet.")}</p></AppShell>;
  const r = await readRiseTeacherReport(repo, actor, klass.id);
  const placed = r.students.filter((x) => x.placed);
  const levels = placed.flatMap((x) => [...x.points.map((p) => p.level), ...(x.projected ? [x.projected.low, x.projected.high] : [])]);
  const lo = Math.max(200, Math.floor(((levels.length ? Math.min(...levels) : 500) - 50) / 100) * 100);
  const hi = Math.min(1500, Math.ceil(((levels.length ? Math.max(...levels) : 1000) + 50) / 100) * 100);
  const studentHref = (id: string) => `/teacher/readrise?class=${klass.id}&student=${id}`;
  const checksOpen = r.summary.checksDue.MOY + r.summary.checksDue.EOY;
  return (
    <AppShell name={String(me.displayName)}>
      {header}
      <ReportIntro text="Each student's ReadRise level over the year: who is placed, stuck or rising fast." />
      <AtAGlance items={[
        { icon: "🧭", label: t("Placed"), value: `${r.summary.placed} / ${r.summary.students}`, tone: r.summary.placed < r.summary.students ? "warn" : "good" },
        { icon: "🗓️", label: t("Reading checks to take"), value: checksOpen, meaning: checksOpen ? t("The reading check is open: students see a card on their ReadRise page.") : undefined, tone: checksOpen ? "warn" : "neutral" },
        { icon: "⏸", label: t("Stuck"), value: r.summary.stuck, meaning: t("no level change for {n}+ days", { n: STUCK_DAYS }), tone: r.summary.stuck ? "warn" : "neutral" },
        { icon: "🚀", label: t("Rising fast"), value: r.summary.rising, meaning: t("up {n}+ in 4 weeks", { n: RISING_GAIN }), tone: r.summary.rising ? "good" : "neutral" },
        { icon: "⚡", label: t("Unreliable readings"), value: r.summary.unreliable, meaning: t("2+ answers too fast to be read: the level did not move"), tone: r.summary.unreliable ? "bad" : "neutral" },
      ]} />

      <ReportSection title="Each student's ReadRise level" icon="📈" className="mb-0" hint={<>{t("Squares are reading checks (placements), dots are level changes; the dashed line is the projected end-of-year level — an estimate from the trend.")} <span className="text-xs text-slate-500">{t("The ReadRise level is ReadRise's own reading level.")}</span></>}>
        {placed.length === 0 ? <p className="text-sm text-slate-600">{t("No student has been placed yet.")}</p> : (
          <ul data-testid="rr-report-lines" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {r.students.map((x) => (
              <li key={x.studentId} className="rounded-2xl p-3 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={studentHref(x.studentId)} className="font-semibold text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link>
                  <span className="text-sm tabular-nums text-slate-700">{x.placed ? <><b>{x.level}</b>{x.startLevel !== null && x.level !== null && x.level !== x.startLevel ? <span className={`ms-1 text-xs ${x.level > x.startLevel ? "text-emerald-700" : "text-red-700"}`}>({signed(x.level - x.startLevel)})</span> : null}</> : <span className="text-xs font-semibold text-amber-800">{t("No placement yet")}</span>}</span>
                </div>
                {x.placed && <LevelLine s={x} lo={lo} hi={hi} yearStart={r.windows.yearStart} yearEnd={r.yearEnd} now={r.now} t={t} />}
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  {RR_PERIODS.map((p) => <span key={p}>{t(RR_PERIOD_NAME[p])}: <b className="tabular-nums text-slate-800">{x.checks[p]?.level ?? "—"}</b></span>)}
                </p>
                {x.placed && <p className="mt-0.5 text-xs text-slate-600">{t("Projected end of year (estimate)")}: <b className="tabular-nums text-slate-800">{x.projected ? `${x.projected.mid} (${x.projected.low}–${x.projected.high})` : t("not enough readings yet")}</b></p>}
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ReportSection title="Stuck" icon="⏸" className="mb-0" hint={<>{t("Placed students whose level has not changed for {n}+ days. Check the articles' fit or talk with them.", { n: STUCK_DAYS })}</>}>
          {r.stuck.length === 0 ? <p className="text-sm text-slate-600">{t("Nobody is stuck.")}</p> : (
            <ul data-testid="rr-report-stuck" className="divide-y divide-slate-100 text-sm">
              {r.stuck.map((x) => <li key={x.studentId} className="flex flex-wrap justify-between gap-2 py-2"><Link href={studentHref(x.studentId)} className="font-semibold text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link><span className="tabular-nums text-slate-600">{x.level} · {t("{n} days", { n: x.days })} · {t("{n} readings in 4 weeks", { n: x.readings4w })}</span></li>)}
            </ul>
          )}
        </ReportSection>
        <ReportSection title="Rising fast" icon="🚀" className="mb-0" hint={<>{t("Up {n}+ in the last 4 weeks.", { n: RISING_GAIN })}</>}>
          {r.rising.length === 0 ? <p className="text-sm text-slate-600">{t("Nobody yet.")}</p> : (
            <ul data-testid="rr-report-rising" className="divide-y divide-slate-100 text-sm">
              {r.rising.map((x) => <li key={x.studentId} className="flex flex-wrap justify-between gap-2 py-2"><Link href={studentHref(x.studentId)} className="font-semibold text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link><span className="tabular-nums font-semibold text-emerald-700">{x.level} ({signed(x.gain)})</span></li>)}
            </ul>
          )}
        </ReportSection>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ReportSection title="Class accuracy by question type" icon="🧠" className="mb-0" hint={<>{t("First tries that count; answers too fast to be read are left out.")}</>}>
          {r.byType.length === 0 ? <p className="text-sm text-slate-600">{t("No first-try results yet.")}</p> : (
            <ul data-testid="rr-report-types" className="space-y-2">
              {[...r.byType].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).map((k) => (
                <li key={k.type} className="grid grid-cols-[9rem_minmax(0,1fr)_6rem] items-center gap-3 text-sm">
                  <span className="truncate font-semibold text-slate-700">{t(k.name)}</span>
                  <span className="h-3 rounded-full bg-slate-100" role="img" aria-label={`${k.name}: ${fmt(k.pct, "%")}`}><span className={`block h-3 rounded-full ${(k.pct ?? 0) >= 75 ? "bg-emerald-500" : (k.pct ?? 0) >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${k.pct ?? 0}%` }} /></span>
                  <span className="text-end tabular-nums text-slate-700">{fmt(k.pct, "%")} <span className="text-xs text-slate-400">({k.correct}/{k.total})</span></span>
                </li>
              ))}
            </ul>
          )}
        </ReportSection>
        <ReportSection title="Unreliable readings" icon="⚡" className="mb-0" hint={<>{t("2 or more answers came too fast to be read, so the reading did not change the level, the goal or the skills. Only teachers see this.")}</>}>
          {r.unreliable.length === 0 ? <p className="text-sm text-slate-600">{t("None.")}</p> : (
            <ul data-testid="rr-report-unreliable" className="divide-y divide-slate-100 text-sm">
              {r.unreliable.map((x) => <li key={x.runId} className="flex flex-wrap justify-between gap-2 py-2"><span><b className="text-brand-navy"><bdi>{x.name}</bdi></b> · <bdi>{x.title}</bdi></span><span className="tabular-nums text-slate-600">{day(x.at)} · {t("{n} fast answers", { n: x.rapid })} · {fmt(x.score, "%")}</span></li>)}
            </ul>
          )}
        </ReportSection>
      </div>
      <ReportSummary summary={readRiseSummary(r, klass.id)} />
    </AppShell>
  );
}

/** One student's level over the school year: a step line, squares for reading checks, the dashed estimate to the year's end. */
function LevelLine({ s, lo, hi, yearStart, yearEnd, now: nowIso, t }: { s: ReportStudent; lo: number; hi: number; yearStart: string; yearEnd: string; now: string; t: TFn }) {
  const W = 300, H = 90, L = 30, R = 8, T = 6, B = 14;
  const t0 = Math.min(new Date(`${yearStart}T00:00:00Z`).getTime(), ...s.points.map((p) => new Date(p.at).getTime()));
  const t1 = Math.max(new Date(yearEnd).getTime(), t0 + 86_400_000);
  const now = new Date(nowIso).getTime();
  const x = (ms: number) => L + ((Math.min(t1, Math.max(t0, ms)) - t0) * (W - L - R)) / (t1 - t0);
  const y = (v: number) => T + ((hi - Math.min(hi, Math.max(lo, v))) * (H - T - B)) / Math.max(1, hi - lo);
  const pts = s.points.map((p) => ({ x: x(new Date(p.at).getTime()), y: y(p.level), p }));
  let d = "";
  pts.forEach((q, i) => { d += i === 0 ? `M${q.x},${q.y}` : ` H${q.x} V${q.y}`; });
  const lastX = x(Math.min(now, t1));
  if (pts.length) d += ` H${lastX}`;
  const label = `${s.name}: ${s.points.map((p) => `${p.at.slice(0, 10)} ${p.level}`).join(", ")}${s.projected ? `; ${t("Projected end of year (estimate)")} ${s.projected.mid}` : ""}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-24 w-full" role="img" aria-label={label}>
      {[lo, Math.round((lo + hi) / 200) * 100, hi].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" /><text x={L - 4} y={y(v) + 3} fontSize="8" textAnchor="end" fill="#64748b">{v}</text></g>)}
      <path d={d} fill="none" stroke="#0f766e" strokeWidth="2" />
      {s.projected && pts.length > 0 && <>
        <line x1={lastX} y1={pts[pts.length - 1].y} x2={x(t1)} y2={y(s.projected.mid)} stroke="#6366f1" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1={x(t1) - 2} x2={x(t1) - 2} y1={y(s.projected.high)} y2={y(s.projected.low)} stroke="#a5b4fc" strokeWidth="3" />
      </>}
      {pts.map((q, i) => q.p.kind === "PLACEMENT" || q.p.kind === "START"
        ? <rect key={i} x={q.x - 3.5} y={q.y - 3.5} width="7" height="7" fill="#1e3a8a"><title>{`${q.p.at.slice(0, 10)} · ${q.p.level}`}</title></rect>
        : <circle key={i} cx={q.x} cy={q.y} r="2.5" fill={q.p.kind === "DOWN" ? "#dc2626" : q.p.kind === "UP" ? "#059669" : "#64748b"}><title>{`${q.p.at.slice(0, 10)} · ${q.p.level}`}</title></circle>)}
      <text x={L} y={H - 2} fontSize="8" fill="#64748b">{yearStart.slice(0, 7)}</text>
      <text x={W - R} y={H - 2} fontSize="8" textAnchor="end" fill="#64748b">{yearEnd.slice(0, 7)}</text>
    </svg>
  );
}
