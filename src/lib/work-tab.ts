/**
 * 📂 The "My Work tab" an assignment is filed under (Oct 2026, "خليها تنضاف" → My Work tab request). Optional and
 * additive: most assignments have none and show normally. A teacher can file specific already-assigned skills
 * under a tab (e.g. "Extra Practice") from the Student Skills grid; the student's My Work hides a tabbed row from
 * its normal Due this week / Later / Done grouping and shows it under its tab's own section instead.
 *
 * Auto-clear rule (agreed design): when the same skill has more than one live assignment, My Work merges them into
 * one row (see server/plans/wizard.ts mergeWorkItems) and keeps the fields of the "leading" (most active) one. The
 * tab follows that same leading row — so a skill filed under a tab is never stuck hidden there: the moment a fresh,
 * active, untagged assignment of the same skill out-ranks the old tabbed one, the merged row's tab clears and the
 * skill reappears in the normal grouping.
 */
export type WorkTab = "EXTRA_PRACTICE" | "REVIEW" | "PREVIOUS_TERM";

/** the order of the dropdown and of the rendered tab sections */
export const WORK_TABS: readonly WorkTab[] = ["EXTRA_PRACTICE", "REVIEW", "PREVIOUS_TERM"];

export const WORK_TAB_LABEL: Record<WorkTab, string> = {
  EXTRA_PRACTICE: "Extra Practice",
  REVIEW: "Review",
  PREVIOUS_TERM: "Previous Term",
};

export const isWorkTab = (v: unknown): v is WorkTab => (WORK_TABS as readonly unknown[]).includes(String(v ?? "").trim().toUpperCase());

/** a form value / saved column → the tab, or null (empty, "none", or unknown). Case-insensitive. */
export function parseWorkTab(v: unknown): WorkTab | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return isWorkTab(s) ? (s as WorkTab) : null;
}
