/**
 * ⭐ Report keys (Oct 2026, daily-reports consolidation): a short stable id for each report a teacher can mark as
 * a favourite (src/server/teacher/favorites.ts). Mirrors the small-enum pattern of work-tab.ts / assign-source.ts.
 */
export type ReportKey = "NEEDS_ATTENTION" | "EARLY_WARNING" | "ENRICHMENT" | "SKILLS_GRID" | "SUPPORT" | "PROGRESS";

export const REPORT_KEYS: readonly ReportKey[] = ["NEEDS_ATTENTION", "EARLY_WARNING", "ENRICHMENT", "SKILLS_GRID", "SUPPORT", "PROGRESS"];

export const REPORT_KEY_LABEL: Record<ReportKey, string> = {
  NEEDS_ATTENTION: "Needs attention",
  EARLY_WARNING: "Early warning",
  ENRICHMENT: "Enrichment opportunities",
  SKILLS_GRID: "Student Skills",
  SUPPORT: "Support plans",
  PROGRESS: "Students",
};

/** Where a favourited report's link points, for the "Pin reports" panel in the Reports hub. */
export const REPORT_KEY_HREF: Record<ReportKey, string> = {
  NEEDS_ATTENTION: "/teacher#needs-attention",
  EARLY_WARNING: "/teacher/reports/early-warning",
  ENRICHMENT: "/teacher/plans?kind=ENRICHMENT",
  SKILLS_GRID: "/teacher/reports/skills-grid",
  SUPPORT: "/teacher/plans/support",
  PROGRESS: "/teacher/progress",
};

export const isReportKey = (v: unknown): v is ReportKey => (REPORT_KEYS as readonly unknown[]).includes(String(v ?? "").trim().toUpperCase());

export function parseReportKey(v: unknown): ReportKey | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return isReportKey(s) ? (s as ReportKey) : null;
}
