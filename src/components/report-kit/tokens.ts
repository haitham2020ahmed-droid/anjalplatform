/**
 * Report kit tokens (no React, so server code and tests can use them): band colours with a text label and a
 * shape for every colour (a band is never shown by colour alone), tones for the at-a-glance numbers, and the
 * plain-language words used to explain a percentage. Labels are English source strings for t().
 */

export type BandKey = "BELOW" | "ON" | "ABOVE" | "NONE" | "T1" | "T2" | "T3" | "GOOD" | "OK" | "LOW" | "DONE" | "PENDING" | "LATE";

export interface BandStyle { label: string; mark: string; bg: string; text: string; soft: string; hex: string }

/** Levels keep the platform's colours (Below orange · On sky · Above green, as on the level badges). */
export const BAND: Record<BandKey, BandStyle> = {
  BELOW: { label: "Approaching", mark: "▼", bg: "bg-orange-500", text: "text-orange-900", soft: "bg-orange-50 ring-orange-200", hex: "#f97316" },
  ON: { label: "Meeting", mark: "●", bg: "bg-sky-500", text: "text-sky-900", soft: "bg-sky-50 ring-sky-200", hex: "#0ea5e9" },
  ABOVE: { label: "Exceeding", mark: "▲", bg: "bg-emerald-500", text: "text-emerald-900", soft: "bg-emerald-50 ring-emerald-200", hex: "#10b981" },
  NONE: { label: "Not set", mark: "○", bg: "bg-slate-300", text: "text-slate-700", soft: "bg-slate-50 ring-slate-200", hex: "#cbd5e1" },
  T1: { label: "Tier 1", mark: "1", bg: "bg-emerald-500", text: "text-emerald-900", soft: "bg-emerald-50 ring-emerald-200", hex: "#10b981" },
  T2: { label: "Tier 2", mark: "2", bg: "bg-amber-400", text: "text-amber-900", soft: "bg-amber-50 ring-amber-200", hex: "#fbbf24" },
  T3: { label: "Tier 3", mark: "3", bg: "bg-rose-500", text: "text-rose-900", soft: "bg-rose-50 ring-rose-200", hex: "#f43f5e" },
  GOOD: { label: "Strong", mark: "✓", bg: "bg-emerald-500", text: "text-emerald-900", soft: "bg-emerald-50 ring-emerald-200", hex: "#10b981" },
  OK: { label: "Getting there", mark: "~", bg: "bg-amber-400", text: "text-amber-900", soft: "bg-amber-50 ring-amber-200", hex: "#fbbf24" },
  LOW: { label: "Needs help", mark: "!", bg: "bg-rose-500", text: "text-rose-900", soft: "bg-rose-50 ring-rose-200", hex: "#f43f5e" },
  DONE: { label: "Done", mark: "✓", bg: "bg-emerald-500", text: "text-emerald-900", soft: "bg-emerald-50 ring-emerald-200", hex: "#10b981" },
  PENDING: { label: "Not done yet", mark: "○", bg: "bg-slate-300", text: "text-slate-700", soft: "bg-slate-50 ring-slate-200", hex: "#cbd5e1" },
  LATE: { label: "Late", mark: "!", bg: "bg-rose-500", text: "text-rose-900", soft: "bg-rose-50 ring-rose-200", hex: "#f43f5e" },
};

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";
export const TONE: Record<Tone, { bar: string; value: string; mark: string }> = {
  good: { bar: "bg-emerald-500", value: "text-emerald-800", mark: "✓" },
  warn: { bar: "bg-amber-400", value: "text-amber-800", mark: "!" },
  bad: { bar: "bg-rose-500", value: "text-rose-700", mark: "!" },
  info: { bar: "bg-brand-teal", value: "text-brand-navy", mark: "" },
  neutral: { bar: "bg-slate-300", value: "text-brand-navy", mark: "" },
};

/** Accuracy / % correct → band (the same cut points as the report pages: 80+ strong, 60–79 getting there, under 60 needs help). */
export function pctBand(v: number | null | undefined, cut: [number, number] = [80, 60]): "GOOD" | "OK" | "LOW" | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return v >= cut[0] ? "GOOD" : v >= cut[1] ? "OK" : "LOW";
}
export const toneOfPct = (v: number | null | undefined, cut: [number, number] = [80, 60]): Tone => {
  const b = pctBand(v, cut);
  return b === "GOOD" ? "good" : b === "OK" ? "warn" : b === "LOW" ? "bad" : "neutral";
};

/** Share of each part, rounded so the parts add up to 100 (largest remainder). Display only — never stored. */
export function shares(values: number[]): number[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (100 * Math.max(0, v)) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; if (values[i] > 0) { out[i] += 1; left -= 1; } }
  return out;
}

/** "12 Oct 2026" (English digits and month names everywhere, as in the PDF reports). */
export const fmtDay = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
