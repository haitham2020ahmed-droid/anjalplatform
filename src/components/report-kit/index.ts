/**
 * The on-screen report kit: one look for every report page (teacher, student, parent, admin).
 *  ReportHeader  — title, who / when, filters, Print + Download buttons (and a "Printed …" line on paper)
 *  AtAGlance     — 3–5 big numbers, each with a plain-language meaning
 *  BandBar / Legend / BandPill — distributions in colour + mark + words (never colour alone)
 *  SimpleBar / Sparkline / Donut / Meter — small SVG / CSS charts with text alternatives
 *  ReportTable   — sticky header, zebra rows, aligned numbers, sort, card layout under 640 px
 *  Callout       — "What this means" / "Next step" / "Who needs help" boxes
 *  ReportSection — a titled card that does not split across printed pages
 *  EmptyState    — the friendly empty message (from the ui-kit)
 * Nothing here computes a result: pages pass the numbers their loaders already return.
 */
export { ReportHeader, PrintButton, type Download } from "./report-header";
export { AtAGlance, type Glance } from "./at-a-glance";
export { BandBar, BandPill, Legend, type BandPart } from "./bands";
export { SimpleBar, Sparkline, Donut, Meter, type BarItem, type DonutPart } from "./charts";
export { ReportTable, type Col, type RRow, type SortVal } from "./report-table";
export { Callout, type CalloutKind } from "./callout";
export { ReportSection } from "./report-section";
export { EmptyState } from "@/components/ui-kit/empty-state";
export { BAND, TONE, pctBand, toneOfPct, shares, fmtDay, type BandKey, type Tone } from "./tokens";
