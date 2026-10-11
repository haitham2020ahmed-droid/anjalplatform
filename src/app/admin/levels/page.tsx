import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { exportsOf, fmtSigned } from "@/components/reports/report-ui";
import { AtAGlance, BandBar, Callout, Donut, ReportHeader, ReportSection, ReportTable } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolLevels, type DistRow, type TierDist } from "@/server/reports/level-distribution";

export const metadata = { title: "Below / On / Above" };

/** One stacked bar: Below / On / Above / not evaluated, with the numbers written out (not color alone). */
function Bar({ d }: { d: DistRow["now"] }) {
  return (
    <div className="min-w-[160px]">
      <BandBar height="h-4" legend={false} parts={[{ key: "BELOW", value: d.below }, { key: "ON", value: d.on }, { key: "ABOVE", value: d.above }, ...(d.none ? [{ key: "NONE" as const, value: d.none, label: "Not evaluated" }] : [])]} />
      <p className="mt-1 text-xs tabular-nums text-slate-600">▼ Below {d.below} · ● On {d.on} · ▲ Above {d.above}{d.none ? ` · ○ not evaluated ${d.none}` : ""}</p>
    </div>
  );
}
const Change = ({ r }: { r: DistRow }) => (
  <span className="whitespace-nowrap text-xs tabular-nums">
    <span className={r.change.below > 0 ? "text-red-700" : r.change.below < 0 ? "text-emerald-700" : "text-slate-500"}>B {fmtSigned(r.change.below)}</span>{" · "}
    <span className="text-slate-700">O {fmtSigned(r.change.on)}</span>{" · "}
    <span className={r.change.above > 0 ? "text-emerald-700" : r.change.above < 0 ? "text-red-700" : "text-slate-500"}>A {fmtSigned(r.change.above)}</span>
  </span>
);
const Tiers = ({ t }: { t: TierDist }) => <span className="whitespace-nowrap text-xs tabular-nums">T1 {t.tier1} · <span className={t.tier2 ? "text-amber-800" : ""}>T2 {t.tier2}</span> · <span className={t.tier3 ? "font-semibold text-red-700" : ""}>T3 {t.tier3}</span></span>;

/** ⚖️ The school's Below / On / Above distribution by grade, class and strand, with the change since last month and the tiers. */
export default async function LevelsDistributionPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "analytics:school" });
  const me = (await getActor())!.user;
  const L = await schoolLevels(repo, actor);
  const o = L.overall;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/admin", label: "Home" }} icon="⚖️" title="Below / On / Above"
        subtitle={<>Every student's confirmed overall level (the one the Level Story and the tiers use), by grade, class and Curriculum-Map strand. Change = now ({L.asOf}) minus 30 days ago ({L.monthAgo}).</>}
        who={t("Whole school")} when={L.asOf} downloads={exportsOf({ kind: "levels", scope: "school", period: "TERM" })} />
      <AtAGlance items={[
        { icon: "👩‍🎓", label: "Students", value: o.now.total, meaning: t("{n} not evaluated yet", { n: o.now.none }) },
        { icon: "▼", label: "Below Level", value: `${o.pctNow.below ?? 0}%`, meaning: t("{n} students · {c} in a month", { n: o.now.below, c: fmtSigned(o.change.below) }), tone: o.change.below > 0 ? "warn" : "neutral" },
        { icon: "●", label: "On Level", value: `${o.pctNow.on ?? 0}%`, meaning: t("{n} students · {c} in a month", { n: o.now.on, c: fmtSigned(o.change.on) }), tone: "info" },
        { icon: "▲", label: "Above Level", value: `${o.pctNow.above ?? 0}%`, meaning: t("{n} students · {c} in a month", { n: o.now.above, c: fmtSigned(o.change.above) }), tone: "good" },
        { icon: "🛟", label: "Tier 2 · Tier 3", value: `${o.tiers.tier2} · ${o.tiers.tier3}`, meaning: t("Tier 1: {n}", { n: o.tiers.tier1 }), tone: o.tiers.tier3 ? "bad" : "neutral" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ReportSection title="The whole school" icon="🏫" className="mb-0">
          <Donut label="Levels now" center={o.now.total} sub={t("students")} parts={[{ key: "BELOW", value: o.now.below }, { key: "ON", value: o.now.on }, { key: "ABOVE", value: o.now.above }, { key: "NONE", value: o.now.none, label: "Not evaluated" }]} />
          <BandBar className="mt-4" label="Support tiers" parts={[{ key: "T1", value: o.tiers.tier1 }, { key: "T2", value: o.tiers.tier2 }, { key: "T3", value: o.tiers.tier3 }]} />
        </ReportSection>
        <div className="space-y-4">
          <Callout kind="meaning" items={[
            t("Below / On / Above is each student's confirmed overall level, compared with their grade."),
            o.change.below > 0 ? t("{n} more students are Below Level than a month ago.", { n: o.change.below }) : t("No more students are Below Level than a month ago."),
          ]} />
          <Callout kind="next" items={[
            (() => { const w = [...L.classes].sort((a, b) => b.now.below / Math.max(1, b.now.total) - a.now.below / Math.max(1, a.now.total))[0]; return w && w.now.below ? <>{t("Visit the class with the most students Below Level")}: <bdi className="font-semibold">{w.name}</bdi> ({w.now.below})</> : null; })(),
            o.tiers.tier3 ? t("Check that every Tier 3 student has a weekly intervention group.") : null,
          ]} />
        </div>
      </div>
      <div className="mt-5 space-y-5">
        <ReportSection title="By grade" icon="🏫">
          <ReportTable label="By grade"
            cols={[{ key: "g", label: "Grade" }, { key: "s", label: "Students", num: true }, { key: "n", label: "Now", sort: false }, { key: "c", label: "Change in a month", sort: false }, { key: "t", label: "Tiers", sort: false }]}
            rows={L.grades.map((g) => ({ id: String(g.grade), sort: { g: g.grade, s: g.now.total }, cells: { g: <span className="font-semibold">Grade {g.grade}</span>, s: g.now.total, n: <Bar d={g.now} />, c: <Change r={g} />, t: <Tiers t={g.tiers} /> } }))} />
        </ReportSection>
        <ReportSection title="By class" icon="👥">
          <ReportTable label="By class"
            cols={[{ key: "c", label: "Class" }, { key: "s", label: "Students", num: true }, { key: "n", label: "Now", hint: "Sort by the number Below Level" }, { key: "ch", label: "Change in a month", sort: false }, { key: "t", label: "Tiers", hint: "Sort by Tier 3" }]}
            rows={L.classes.map((c) => ({ id: c.classId, flag: c.tiers.tier3 ? "bad" : undefined, sort: { c: c.name, s: c.now.total, n: c.now.below, t: c.tiers.tier3 }, cells: { c: <Link href={`/teacher/tiers?class=${c.classId}`} className="font-semibold text-brand-teal hover:underline"><bdi>{c.name}</bdi></Link>, s: c.now.total, n: <Bar d={c.now} />, ch: <Change r={c} />, t: <Tiers t={c.tiers} /> } }))} />
        </ReportSection>
        <ReportSection title="By Curriculum-Map strand" icon="🧭" hint="Each strand's own level (set by the strand's adaptive sets).">
          {L.strands.length ? (
            <ReportTable label="By strand"
              cols={[{ key: "s", label: "Strand" }, { key: "g", label: "Grade" }, { key: "n", label: "Now", sort: false }, { key: "c", label: "Change in a month", sort: false }]}
              rows={L.strands.map((x, i) => ({ id: String(i), sort: { g: x.grade ?? 0 }, cells: { s: <span className={x.grade === null ? "font-bold" : ""}>{x.name}</span>, g: x.grade === null ? "All" : `Grade ${x.grade}`, n: <Bar d={x.now} />, c: <Change r={x} /> } }))} />
          ) : <p className="text-slate-600">No strand levels yet (they come from the Curriculum Map's adaptive sets).</p>}
        </ReportSection>
      </div>
    </AppShell>
  );
}
