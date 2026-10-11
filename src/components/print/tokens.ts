/**
 * 🖨 Print design tokens (no React, so the HTML/PDF reports, the certificate and tests can use them too).
 * One palette for every printed or exported document: the app's navy / teal, and the source colours
 * (Curriculum blue, MAP green, RTI orange, Grammar purple, NAFS teal).
 */
export const BRAND = { navy: "#1f3a68", teal: "#1fa3a3", purple: "#5b3fa0", gold: "#f5b800", ink: "#1e293b", soft: "#475569", line: "#e2e8f0", zebra: "#f6f8fb", paper: "#ffffff", grey: "#f1f5f9" } as const;

export type Source = "curriculum" | "map" | "rti" | "grammar" | "nafs";
/** Source colours (dark enough for white text and for print). */
export const SOURCE_COLORS: Record<Source, string> = {
  curriculum: "#1f5fbf",
  map: "#15803d",
  rti: "#c2410c",
  grammar: "#6d28d9",
  nafs: "#0f766e",
};
/** Accent of a printed section: a source colour or the brand navy / teal. */
export type PrintAccent = Source | "navy" | "teal" | "gold";
export const accentHex = (a: PrintAccent | undefined): string =>
  !a ? BRAND.navy : a in SOURCE_COLORS ? SOURCE_COLORS[a as Source] : a === "teal" ? BRAND.teal : a === "gold" ? "#b7791f" : BRAND.navy;

/** The cheerful colour cycle of the sign-in cards (one colour per card, repeating). */
export const CARD_CYCLE: string[] = [SOURCE_COLORS.curriculum, SOURCE_COLORS.map, SOURCE_COLORS.rti, SOURCE_COLORS.grammar, SOURCE_COLORS.nafs, BRAND.navy];

/** The platform name printed in every header band. */
export const PLATFORM = "Al-Anjal";

/** "11 Oct 2026" (English digits and month names, as in the PDF reports). */
export function printDate(d: Date | string = new Date()): string {
  const x = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
