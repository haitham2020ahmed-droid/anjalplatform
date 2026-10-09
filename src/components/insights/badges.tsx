import type { Intensity } from "@/server/insights/progress";

/** Small coloured labels used on the progress pages (staff only). */
export function StatusBadge({ status }: { status: "ON_TRACK" | "AT_RISK" | "MET" | "MISSED" | "NO_DATA" }) {
  const v = { ON_TRACK: ["✅ On track", "bg-emerald-100 text-emerald-900"], MET: ["🏆 Met target", "bg-emerald-100 text-emerald-900"], AT_RISK: ["⚠️ At risk", "bg-red-100 text-red-800"], MISSED: ["⚠️ Missed target", "bg-red-100 text-red-800"], NO_DATA: ["— No data", "bg-slate-100 text-slate-600"] }[status];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${v[1]}`}>{v[0]}</span>;
}

export function LevelBadge({ level }: { level: "BELOW" | "ON" | "ABOVE" | null | undefined }) {
  if (!level) return <span className="text-xs text-slate-400">not set</span>;
  const v = { BELOW: ["🟠 Below", "bg-orange-50 text-orange-900 ring-orange-200"], ON: ["🔵 On", "bg-sky-50 text-sky-900 ring-sky-200"], ABOVE: ["🟢 Above", "bg-emerald-50 text-emerald-900 ring-emerald-200"] }[level];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${v[1]}`}>{v[0]}</span>;
}

export function IntensityBadge({ intensity }: { intensity: Intensity | null }) {
  if (!intensity) return <span className="text-xs text-slate-400">—</span>;
  const v = { INTENSIVE: ["🔴 Intensive", "bg-red-50 text-red-800"], TARGETED: ["🟡 Targeted", "bg-amber-50 text-amber-900"], CORE: ["🟢 Keep growing", "bg-emerald-50 text-emerald-900"] }[intensity];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${v[1]}`}>{v[0]}</span>;
}

export function Tile({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className={`mt-1 text-2xl font-extrabold text-brand-navy ${tone}`}>{value}</dd></div>;
}
