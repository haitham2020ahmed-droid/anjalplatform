/** 🧠 The Student Profile card: the unified level and its source, MAP and the prediction, misconceptions with a teaching move. */
import type { ProfileView } from "@/server/insights/student-profile";
import { MISCONCEPTION_BY_CODE } from "@/insights/misconceptions";
import { EVIDENCE_NAME, type Evidence } from "@/server/curriculum-map/evidence-level";

const LEVEL = { ABOVE: "Above Level", ON: "On Level", BELOW: "Below Level", UNKNOWN: "No data yet" } as Record<string, string>;
const AREA: Record<string, string> = { LIT: "Literary Text", INFO: "Informational Text", VOCAB: "Vocabulary", GRAMMAR: "Grammar and Usage", MECH: "Mechanics", WRITING: "Writing" };

/** 🧭 the student's support tier (from src/server/tiers/views.ts → tierLine) */
export interface ProfileTier { tier: number; reason: string; source: "AUTO" | "TEACHER"; locked: boolean; since: string | null; nextCheck: string | null; overdue: boolean }
const TIER_TONE: Record<number, string> = { 1: "bg-emerald-100 text-emerald-900 ring-emerald-200", 2: "bg-amber-100 text-amber-900 ring-amber-200", 3: "bg-red-100 text-red-900 ring-red-200" };
const TIER_LABEL: Record<number, string> = { 1: "Core", 2: "Targeted", 3: "Intensive" };

export function StudentProfileCard({ p, tier, tierHref }: { p: ProfileView | null; tier?: ProfileTier | null; tierHref?: string }) {
  if (!p) return null;
  return (
    <section className="mt-6 rounded-3xl bg-gradient-to-br from-indigo-50 via-white to-teal-50 p-5 ring-1 ring-indigo-200" data-testid="student-profile">
      <h2 className="text-lg font-bold text-brand-navy">🧠 Student profile <span className="text-xs font-normal text-slate-500">· updated {p.updatedAt?.slice(0, 10) ?? "—"}</span></h2>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs text-slate-500">Level</p><p className="text-xl font-extrabold text-brand-navy">{LEVEL[p.level] ?? p.level}</p><p className="text-xs text-slate-500">from: {EVIDENCE_NAME[p.levelSource as Evidence] ?? p.levelSource}</p></div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs text-slate-500">MAP RIT</p><p className="text-xl font-extrabold tabular-nums text-brand-navy">{p.readingRit ?? "—"} <span className="text-sm font-normal">Reading</span></p><p className="text-sm tabular-nums">{p.languageRit ?? "—"} Language{p.estReadingRit ? ` · Weekly Check ≈ ${p.estReadingRit}` : ""}{p.lexile ? ` · ${p.lexile}L` : ""}</p></div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200" title={p.predictionWhy ?? ""}><p className="text-xs text-slate-500">🔮 Next MAP ({p.predictedTerm ?? "—"})</p><p className="text-xl font-extrabold tabular-nums text-brand-navy">{p.predictedReading ? `≈ ${p.predictedReading} ± 5` : "—"}</p><p className="text-sm">{p.goalChance !== null ? <>goal {p.goalReading} · <b className={p.goalChance < 40 ? "text-red-700" : p.goalChance < 60 ? "text-amber-700" : "text-emerald-700"}>{p.goalChance}% chance</b></> : "No MAP goal yet"}</p></div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs text-slate-500">Weakest NWEA area</p><p className="text-lg font-bold text-brand-navy">{p.weakestArea ? AREA[p.weakestArea] ?? p.weakestArea : "—"}</p><p className="text-xs text-slate-500">{p.practiceDays14} practice day(s) in 14</p></div>
      </div>
      {tier && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-200" data-testid="student-tier">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${TIER_TONE[tier.tier] ?? TIER_TONE[1]}`}>🧭 Tier {tier.tier} · {TIER_LABEL[tier.tier] ?? ""}</span>
          <span className="text-slate-700">{tier.reason}</span>
          <span className="text-xs text-slate-500">{tier.source === "TEACHER" ? "set by the teacher" : "set by the rules"}{tier.locked ? " 🔒" : ""}{tier.since ? ` · since ${tier.since}` : ""}{tier.tier > 1 && tier.nextCheck ? ` · next check ${tier.nextCheck}${tier.overdue ? " (overdue)" : ""}` : ""}</span>
          {tierHref && <a href={tierHref} className="ms-auto font-semibold text-brand-navy hover:underline">Progress graph ▶</a>}
        </p>
      )}
      {p.predictionWhy && <p className="mt-2 text-xs text-slate-500">How the prediction is made: {p.predictionWhy}.</p>}
      {p.intelligence && <Intelligence i={p.intelligence} />}
      <h3 className="mt-4 font-bold text-brand-navy">🔍 Why this student misses (last 30 days)</h3>
      {p.misconceptions.length ? <ul className="mt-2 space-y-2">{p.misconceptions.map((m) => (
        <li key={m.code} className="rounded-2xl bg-orange-50 p-3 text-sm ring-1 ring-orange-200"><b className="text-orange-900">{MISCONCEPTION_BY_CODE.get(m.code)?.label ?? m.code}</b> <span className="text-xs text-orange-800">({m.count} wrong answers)</span><br /><span className="text-xs text-slate-700">💡 {MISCONCEPTION_BY_CODE.get(m.code)?.fix}</span></li>
      ))}</ul> : <p className="mt-1 text-sm text-slate-500">No repeated misconception (3+ wrong answers with the same pattern).</p>}
    </section>
  );
}

const ACTION: Record<string, { label: string; tone: string }> = {
  FOUNDATION: { label: "Foundation first", tone: "bg-amber-100 text-amber-900" },
  TARGET: { label: "Target", tone: "bg-indigo-100 text-indigo-900" },
  REVIEW: { label: "Review", tone: "bg-teal-100 text-teal-900" },
  STRETCH: { label: "Stretch", tone: "bg-fuchsia-100 text-fuchsia-900" },
};
const VERDICT: Record<string, string> = { PREREQUISITE: "A foundation skill underneath", SKILL_ITSELF: "The skill itself", UNTESTED_PREREQUISITE: "Check a foundation skill" };

function Intelligence({ i }: { i: NonNullable<ProfileView["intelligence"]> }) {
  const pts = i.trajectory;
  const min = Math.min(-1, ...pts.map((x) => x.theta)), max = Math.max(1, ...pts.map((x) => x.theta));
  const X = (k: number) => 8 + (pts.length > 1 ? (k * 224) / (pts.length - 1) : 112), Y = (t: number) => 52 - ((t - min) / (max - min || 1)) * 44;
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
        <h3 className="font-bold text-brand-navy">🧭 Personal learning path</h3>
        <ol className="mt-2 space-y-1.5">{i.path.map((x, k) => (
          <li key={x.skillId + k} className="text-sm"><span className="me-1 tabular-nums text-slate-400">{k + 1}.</span><span className={`me-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ACTION[x.action]?.tone ?? ""}`}>{ACTION[x.action]?.label ?? x.action}</span><b>{x.name}</b> <span className="text-xs text-slate-500">· level {x.level} · {x.why.slice(0, 2).join(" · ")}</span></li>
        ))}</ol>
        {i.skipped.length > 0 && <p className="mt-2 text-xs text-slate-500">⏭ Skipped (already strong): {i.skipped.map((x) => x.name).join(", ")}</p>}
      </div>
      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
        <h3 className="font-bold text-brand-navy">🕸️ Missing foundations</h3>
        {i.missingPrerequisites.length ? <ul className="mt-2 space-y-1 text-sm">{i.missingPrerequisites.map((g) => <li key={g.skillId}><b className="text-amber-800">{g.name}</b> <span className="text-xs text-slate-500">mastery {g.mastery}{g.blocks.length ? ` · blocks ${g.blocks.slice(0, 3).join(", ")}` : ""}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No weak foundation found.</p>}
        {i.diagnoses.length > 0 && <>
          <h4 className="mt-3 text-sm font-bold text-brand-navy">Why it is hard</h4>
          <ul className="mt-1 space-y-1.5 text-sm">{i.diagnoses.map((d) => <li key={d.skillId}><b>{d.skillName}</b>: <span className="text-orange-800">{VERDICT[d.verdict] ?? d.verdict}</span><br /><span className="text-xs text-slate-600">{d.explanation}</span></li>)}</ul>
        </>}
      </div>
      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
        <h3 className="font-bold text-brand-navy">✅ Mastered ({i.mastered.length}) · 🌱 Developing ({i.developing.length})</h3>
        <p className="mt-1 text-xs text-slate-600">{i.mastered.slice(0, 10).map((x) => x.name).join(", ") || "None yet"}</p>
        <p className="mt-1 text-xs text-slate-600">{i.developing.slice(0, 8).map((x) => `${x.name} ${x.mastery}`).join(" · ") || "—"}</p>
      </div>
      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
        <h3 className="font-bold text-brand-navy">📈 Learning trajectory</h3>
        {pts.length >= 2 ? <svg viewBox="0 0 240 60" className="mt-1 h-16 w-full" role="img" aria-label="Ability by week"><polyline fill="none" stroke="#4f46e5" strokeWidth="2" points={pts.map((x, k) => `${X(k)},${Y(x.theta)}`).join(" ")} />{pts.map((x, k) => <circle key={k} cx={X(k)} cy={Y(x.theta)} r="2.5" fill="#4f46e5" />)}</svg> : <p className="mt-1 text-xs text-slate-500">The trajectory appears after two weekly updates.</p>}
        <p className="text-xs text-slate-600">{i.growthPerWeek !== null ? `+${i.growthPerWeek} mastery points a week (last 14 days)` : "No practice in the last 14 days"}{i.thetaTrend !== null ? ` · ability ${i.thetaTrend >= 0 ? "+" : ""}${i.thetaTrend} a week` : ""}</p>
      </div>
    </div>
  );
}
