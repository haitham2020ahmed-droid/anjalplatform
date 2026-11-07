import type { AreaUse, DayUse, SkillUse } from "@/server/analytics/practice";

type T = (s: string, v?: Record<string, string | number>) => string;
/** without a translator: English, with the {placeholders} filled */
const plain: T = (s, v) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v && k in v ? String(v[k]) : m));

const COLORS = ["#1f3a68", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#22c55e", "#3b82f6", "#ec4899", "#94a3b8"];

/**
 * Questions per day: at school (teal) and at home (navy). Nov 2026 (IXL-style): EVERY day of the range is a slot —
 * a day without practice is an empty slot with a grey mark, so two lost days show as a gap; Friday and Saturday
 * (the weekend) have lighter labels. `unit = "week"`: each bar is a week (long ranges), labelled by its Sunday.
 */
export function DayBars({ days, unit = "day", t = plain }: { days: DayUse[]; unit?: "day" | "week"; t?: T }) {
  if (!days.some((d) => d.questions > 0)) return <p className="text-sm text-slate-500">{t("No practice in this range.")}</p>;
  const W = Math.max(320, days.length * 22), H = 160, B = 26, max = Math.max(1, ...days.map((d) => d.questions));
  const bw = Math.min(16, (W - 20) / days.length - 4), x = (i: number) => 10 + i * ((W - 20) / days.length);
  const h = (v: number) => (v / max) * (H - B - 14);
  const weekend = (d: string) => unit === "day" && [5, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const name = (d: string) => (unit === "week" ? t("Week of {d}", { d }) : d);
  const empty = days.filter((d) => !d.questions && !weekend(d.day)).length;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, 900) }} className="w-full" role="img" aria-label={t(unit === "week" ? "Questions answered per week, at school and at home" : "Questions answered per day, at school and at home")}>
        {days.map((d, i) => (
          <g key={d.day} data-day={d.day} data-questions={d.questions}>
            {d.questions > 0 ? (
              <>
                <rect x={x(i)} y={H - B - h(d.school)} width={bw} height={h(d.school)} fill="#14b8a6" rx="2"><title>{`${name(d.day)}: ${d.school} ${t("at school")}`}</title></rect>
                <rect x={x(i)} y={H - B - h(d.school) - h(d.home)} width={bw} height={h(d.home)} fill="#1f3a68" rx="2"><title>{`${name(d.day)}: ${d.home} ${t("at home")}`}</title></rect>
                <text x={x(i) + bw / 2} y={H - B - h(d.questions) - 3} fontSize="8" textAnchor="middle" fill="#334155">{d.questions}</text>
              </>
            ) : (
              <rect x={x(i)} y={H - B - 2} width={bw} height="2" fill={weekend(d.day) ? "#e2e8f0" : "#cbd5e1"} rx="1"><title>{`${name(d.day)}: ${t("no practice")}`}</title></rect>
            )}
            {(days.length <= 16 || i % Math.ceil(days.length / 16) === 0) && <text x={x(i) + bw / 2} y={H - 10} fontSize="8" textAnchor="middle" fill={weekend(d.day) ? "#cbd5e1" : "#64748b"}>{d.day.slice(5)}</text>}
          </g>
        ))}
      </svg>
      <p className="mt-1 flex flex-wrap gap-4 text-xs text-slate-600">
        <span><span className="me-1 inline-block h-2.5 w-2.5 rounded-sm bg-teal-500" />{t("At school (Sun–Thu 7:00–14:00)")}</span>
        <span><span className="me-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand-navy" />{t("At home")}</span>
        <span><span className="me-1 inline-block h-0.5 w-2.5 align-middle bg-slate-300" />{t(unit === "week" ? "No practice that week" : "No practice that day")}</span>
        {unit === "day" && empty > 0 && <b className="text-amber-800" data-empty-days={empty}>{t("{n} school days without practice", { n: empty })}</b>}
      </p>
    </div>
  );
}

/** A donut of shares (questions) with its legend. */
function Donut({ parts, label, t }: { parts: { name: string; v: number; note?: string }[]; label: string; t: T }) {
  const total = parts.reduce((x, p) => x + p.v, 0);
  if (!total) return null;
  let a = -Math.PI / 2;
  const R = 70, r = 42, C = 80;
  const arc = (v: number) => {
    const a2 = a + (v / total) * Math.PI * 2, large = a2 - a > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => `${C + rad * Math.cos(ang)} ${C + rad * Math.sin(ang)}`;
    const d = parts.length === 1 ? `M ${p(-Math.PI / 2, R)} A ${R} ${R} 0 1 1 ${p(-Math.PI / 2 - 0.0001, R)} L ${p(-Math.PI / 2 - 0.0001, r)} A ${r} ${r} 0 1 0 ${p(-Math.PI / 2, r)} Z` : `M ${p(a, R)} A ${R} ${R} 0 ${large} 1 ${p(a2, R)} L ${p(a2, r)} A ${r} ${r} 0 ${large} 0 ${p(a, r)} Z`;
    a = a2; return d;
  };
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 160 160" className="h-40 w-40" role="img" aria-label={t(label)}>
        {parts.map((p, i) => <path key={p.name} d={arc(p.v)} fill={COLORS[i % COLORS.length]}><title>{`${p.name}: ${p.v}`}</title></path>)}
        <text x="80" y="78" textAnchor="middle" fontSize="20" fontWeight="800" fill="#1f3a68">{total}</text>
        <text x="80" y="94" textAnchor="middle" fontSize="9" fill="#64748b">{t("questions")}</text>
      </svg>
      <ul className="min-w-48 flex-1 space-y-1 text-sm">{parts.map((p, i) => <li key={p.name} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} /><span className="line-clamp-1">{p.name}{p.note && <span className="ms-1 text-xs text-slate-500">{p.note}</span>}</span></span><b className="tabular-nums">{Math.round((100 * p.v) / total)}%</b></li>)}</ul>
    </div>
  );
}

/** Where the questions went: a donut of the top skills. */
export function SkillDonut({ skills, t = plain }: { skills: SkillUse[]; t?: T }) {
  const top = skills.slice(0, 8), rest = skills.slice(8).reduce((x, k) => x + k.questions, 0);
  const parts = [...top.map((x) => ({ name: x.name, v: x.questions })), ...(rest ? [{ name: t("Other skills"), v: rest }] : [])];
  return <Donut parts={parts} label="Questions per skill" t={t} />;
}

/** Nov 2026 (IXL "Practice by category"): where the questions went by area — Reading, Vocabulary, Grammar, … */
export function AreaDonut({ areas, t = plain }: { areas: AreaUse[]; t?: T }) {
  const parts = areas.map((x) => ({ name: t(x.label), v: x.questions, note: t(x.skills === 1 ? "1 skill" : "{n} skills", { n: x.skills }) }));
  return <Donut parts={parts} label="Questions per area" t={t} />;
}
