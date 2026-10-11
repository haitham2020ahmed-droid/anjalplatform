import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { cycleMilestones, loadCycle, PERIODS, PERIOD_NAME, instructionalWeekOf } from "@/server/assessment-cycle/cycle";
import { resetCycleAction, saveCycleAction } from "./actions";

export const metadata = { title: "Assessment calendar" };
const DAY = 86_400_000;
const KIND_TONE = { DIAGNOSTIC: "bg-sky-600", MAP: "bg-emerald-600", BREAK: "bg-slate-400", YEAR: "bg-brand-navy" } as const;
const KIND_NAME = { DIAGNOSTIC: "Diagnostic + fluency benchmark", MAP: "MAP testing", BREAK: "Break", YEAR: "School year" } as const;

const Field = ({ label, name, value, type = "date" }: { label: string; name: string; value: string | number; type?: string }) => (
  <label className="text-xs font-semibold text-slate-700">{label}<input type={type} name={name} defaultValue={String(value)} className="mt-1 block w-full rounded-lg border-slate-300 text-sm" /></label>
);

/** 🗓️ The school's assessment year plan: diagnostic windows, MAP terms, Weekly Check, progress checks, fluency cadence. */
export default async function AssessmentCalendarPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const now = new Date();
  const { cycle, saved, updatedAt } = await loadCycle(repo, String(actor.schoolId ?? ""), now);
  const start = new Date(`${cycle.yearStart}T00:00:00Z`).getTime(), end = new Date(`${cycle.yearEnd}T00:00:00Z`).getTime() + DAY;
  const pos = (iso: string) => Math.max(0, Math.min(100, (100 * (new Date(`${iso}T00:00:00Z`).getTime() - start)) / (end - start)));
  const months: { label: string; left: number }[] = [];
  for (let t = new Date(start); t.getTime() < end; t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1))) months.push({ label: t.toLocaleString("en", { month: "short", timeZone: "UTC" }), left: pos(t.toISOString().slice(0, 10)) });
  const todayPos = now.getTime() >= start && now.getTime() < end ? pos(now.toISOString().slice(0, 10)) : null;
  const ms = cycleMilestones(cycle).filter((m) => m.kind !== "YEAR");
  const lanes = (["DIAGNOSTIC", "MAP", "BREAK"] as const).filter((k) => k !== "BREAK" || ms.some((m) => m.kind === "BREAK"));
  const map = [...cycle.map, ...Array.from({ length: Math.max(0, 4 - cycle.map.length) }, () => ({ name: "", opens: "", closes: "" }))];
  const breaks = [...cycle.breaks, ...Array.from({ length: Math.max(0, 6 - cycle.breaks.length) }, () => ({ name: "", opens: "", closes: "" }))];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🗓️" title="Assessment calendar"
        subtitle={`The ${cycle.year} assessment cycle: screen at the beginning, middle and end of the year, check progress after every text set, monitor fluency by tier. Teachers see it on their calendar and on Progress checks.`} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-200">{sp.msg}</p>}
      {!saved && <p className="mb-4 rounded-xl bg-sky-50 p-3 text-sm ring-1 ring-sky-200">These are the default dates for a Saudi school year (late August – mid June). Check them and save to make them the school&apos;s plan.</p>}

      <section aria-label="Year timeline" className="mb-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="font-bold">Year timeline {saved && updatedAt ? <span className="text-xs font-normal text-slate-500">· saved {updatedAt.slice(0, 10)}</span> : null} <span className="text-xs font-normal text-slate-500">· now: instructional week {instructionalWeekOf(cycle, now)}</span></h2>
        <div className="relative mt-3 h-5 text-[11px] text-slate-500">{months.map((m) => <span key={`${m.label}${m.left}`} className="absolute" style={{ left: `${m.left}%` }}>{m.label}</span>)}</div>
        <div className="space-y-2">{lanes.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-40 shrink-0 text-xs font-semibold text-slate-700">{KIND_NAME[k]}</span>
            <div className="relative h-7 flex-1 rounded-md bg-slate-100">
              {ms.filter((m) => m.kind === k).map((m) => <span key={m.title} title={`${m.title}: ${m.start} – ${m.end}`} className={`absolute top-1 h-5 rounded ${KIND_TONE[k]} px-1 text-[10px] font-semibold leading-5 text-white`} style={{ left: `${pos(m.start)}%`, width: `max(1.25rem, ${Math.max(0.8, pos(m.end) - pos(m.start) + (100 * DAY) / (end - start))}%)` }}>{m.title.replace(/^Diagnostic /, "").replace(/ \+ fluency benchmark$/, "").replace(/^MAP /, "")}</span>)}
              {todayPos !== null && <span aria-label="Today" className="absolute -top-1 h-9 w-0.5 bg-red-500" style={{ left: `${todayPos}%` }} />}
            </div>
          </div>))}
        </div>
        <ul className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
          <li>📋 Progress check after every text set ({cycle.progressChecks.enabled ? `on; due at the end of the text set's last week, ${cycle.progressChecks.graceDays} days to give it` : "off"}).</li>
          <li>📅 Weekly Check: {cycle.weeklyCheck ? "on" : "off"}.</li>
          <li>🎙 Fluency: Tier 1 in each benchmark window (3 times a year) · Tier 2 every {cycle.fluency.tier2Days} days · Tier 3 every {cycle.fluency.tier3Days} days.</li>
          <li>🗓️ Text-set weeks come from the curriculum (unit n starts at week (n−1)×{cycle.progressChecks.weeksPerUnit}+1); break weeks are skipped.</li>
        </ul>
      </section>

      <form action={saveCycleAction} className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-2 font-bold">School year</legend>
          <Field label="Year (e.g. 2026-2027)" name="year" value={cycle.year} type="text" /><Field label="First day of school" name="yearStart" value={cycle.yearStart} /><Field label="Last day of school" name="yearEnd" value={cycle.yearEnd} />
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-2 font-bold">Diagnostic windows (also the fluency benchmark windows for Tier 1)</legend>
          {PERIODS.map((p) => <div key={p} className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2"><p className="col-span-2 text-xs font-bold">{p} · {PERIOD_NAME[p]}</p><Field label="Opens" name={`${p}opens`} value={cycle.diagnostic[p].opens} /><Field label="Closes" name={`${p}closes`} value={cycle.diagnostic[p].closes} /></div>)}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 font-bold">MAP Growth terms (leave a row empty to remove it)</legend>
          {map.map((m, i) => <div key={i} className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2"><Field label="Name" name={`map${i}name`} value={m.name} type="text" /><Field label="Opens" name={`map${i}opens`} value={m.opens} /><Field label="Closes" name={`map${i}closes`} value={m.closes} /></div>)}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 font-bold">Breaks (weeks that are not taught)</legend>
          {breaks.map((m, i) => <div key={i} className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2"><Field label="Name" name={`brk${i}name`} value={m.name} type="text" /><Field label="From" name={`brk${i}opens`} value={m.opens} /><Field label="To" name={`brk${i}closes`} value={m.closes} /></div>)}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-2 font-bold">Checks</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="weeklyCheck" value="1" defaultChecked={cycle.weeklyCheck} /> Weekly Check on</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pcEnabled" value="1" defaultChecked={cycle.progressChecks.enabled} /> Progress check per text set</label>
          <span />
          <Field label="Weeks per unit" name="weeksPerUnit" value={cycle.progressChecks.weeksPerUnit} type="number" />
          <Field label="Days to give a progress check" name="graceDays" value={cycle.progressChecks.graceDays} type="number" />
          <span />
          <Field label="Fluency: Tier 2 every … days" name="tier2Days" value={cycle.fluency.tier2Days} type="number" />
          <Field label="Fluency: Tier 3 every … days" name="tier3Days" value={cycle.fluency.tier3Days} type="number" />
        </fieldset>
        <div className="flex gap-3"><button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Save the plan</button></div>
      </form>
      {saved && <form action={resetCycleAction} className="mt-3"><button className="rounded-xl bg-white px-4 py-2 text-sm font-semibold ring-1 ring-slate-300">Reset to the default dates</button></form>}
    </AppShell>
  );
}
