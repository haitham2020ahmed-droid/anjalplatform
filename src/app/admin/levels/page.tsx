import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { ExportLinks, fmtSigned, Stat, Stats, TableBox, td, th } from "@/components/reports/report-ui";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { schoolLevels, type DistRow, type TierDist } from "@/server/reports/level-distribution";

export const metadata = { title: "Below / On / Above" };

/** One stacked bar: Below / On / Above / not evaluated, with the numbers written out (not color alone). */
function Bar({ d }: { d: DistRow["now"] }) {
  const w = (n: number) => (d.total ? `${(100 * n) / d.total}%` : "0%");
  return (
    <div className="min-w-[140px]">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <span className="bg-red-400" style={{ width: w(d.below) }} /><span className="bg-teal-500" style={{ width: w(d.on) }} /><span className="bg-indigo-500" style={{ width: w(d.above) }} /><span className="bg-slate-300" style={{ width: w(d.none) }} />
      </div>
      <p className="mt-1 text-xs tabular-nums text-slate-600">Below {d.below} · On {d.on} · Above {d.above}{d.none ? ` · not evaluated ${d.none}` : ""}</p>
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
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="⚖️" title="Below / On / Above"
        subtitle={<>Every student's confirmed overall level (the one the Level Story and the tiers use), by grade, class and Curriculum-Map strand. Change = now ({L.asOf}) minus 30 days ago ({L.monthAgo}).</>} />
      <Stats>
        <Stat label="Students" value={o.now.total} />
        <Stat label="Below Level" value={`${o.pctNow.below ?? 0}%`} note={`${o.now.below} students · ${fmtSigned(o.change.below)} in a month`} tone={o.change.below > 0 ? "amber" : "slate"} />
        <Stat label="On Level" value={`${o.pctNow.on ?? 0}%`} note={`${o.now.on} students · ${fmtSigned(o.change.on)}`} tone="teal" />
        <Stat label="Above Level" value={`${o.pctNow.above ?? 0}%`} note={`${o.now.above} students · ${fmtSigned(o.change.above)}`} />
        <Stat label="Not evaluated" value={o.now.none} note="no daily evaluation yet" />
        <Stat label="Tier 2 · Tier 3" value={`${o.tiers.tier2} · ${o.tiers.tier3}`} note={`Tier 1: ${o.tiers.tier1}`} tone={o.tiers.tier3 ? "red" : "slate"} />
      </Stats>
      <ExportLinks report={{ kind: "levels", scope: "school", period: "TERM" }} />
      <div className="mt-5 space-y-5">
        <Section title="By grade" icon="🏫">
          <TableBox label="By grade">
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr><th className={th}>Grade</th><th className={th}>Students</th><th className={th}>Now</th><th className={th}>Change in a month</th><th className={th}>Tiers</th></tr></thead>
              <tbody>{L.grades.map((g) => <tr key={g.grade} className="border-t border-slate-100"><td className={`${td} font-semibold`}>Grade {g.grade}</td><td className={td}>{g.now.total}</td><td className={td}><Bar d={g.now} /></td><td className={td}><Change r={g} /></td><td className={td}><Tiers t={g.tiers} /></td></tr>)}</tbody>
            </table>
          </TableBox>
        </Section>
        <Section title="By class" icon="👥">
          <TableBox label="By class">
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr><th className={th}>Class</th><th className={th}>Students</th><th className={th}>Now</th><th className={th}>Change in a month</th><th className={th}>Tiers</th></tr></thead>
              <tbody>{L.classes.map((c) => <tr key={c.classId} className="border-t border-slate-100"><td className={td}><Link href={`/teacher/tiers?class=${c.classId}`} className="font-semibold text-brand-teal hover:underline"><bdi>{c.name}</bdi></Link></td><td className={td}>{c.now.total}</td><td className={td}><Bar d={c.now} /></td><td className={td}><Change r={c} /></td><td className={td}><Tiers t={c.tiers} /></td></tr>)}</tbody>
            </table>
          </TableBox>
        </Section>
        <Section title="By Curriculum-Map strand" icon="🧭" hint="Each strand's own level (set by the strand's adaptive sets).">
          {L.strands.length ? (
            <TableBox label="By strand">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr><th className={th}>Strand</th><th className={th}>Grade</th><th className={th}>Now</th><th className={th}>Change in a month</th></tr></thead>
                <tbody>{L.strands.map((x, i) => <tr key={i} className={`border-t border-slate-100 ${x.grade === null ? "bg-slate-50 font-semibold" : ""}`}><td className={td}>{x.name}</td><td className={td}>{x.grade === null ? "All" : `Grade ${x.grade}`}</td><td className={td}><Bar d={x.now} /></td><td className={td}><Change r={x} /></td></tr>)}</tbody>
              </table>
            </TableBox>
          ) : <p className="text-slate-600">No strand levels yet (they come from the Curriculum Map's adaptive sets).</p>}
        </Section>
      </div>
    </AppShell>
  );
}
