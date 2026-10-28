/**
 * 📂 The "My Work tab" an assignment is filed under (Oct 2026, "خليها تنضاف" → My Work tab request). Optional and
 * additive: most assignments have none and show normally. A teacher can file specific already-assigned skills
 * under a tab (e.g. "Extra Practice") from the Student Skills grid; the student's My Work hides a tabbed row from
 * its normal grouping and shows it under the "Extra Practice" section instead.
 *
 * Oct 2026 simplification: the three original tabs (Extra Practice / Review / Previous Term) collapsed into a
 * single "Extra Practice" section on the student's My Work page — one section is easier to scan than three thin
 * ones. Old rows already saved with "REVIEW" or "PREVIOUS_TERM" in the database are NOT migrated (no schema/data
 * change); parseWorkTab below reads either of those old strings back as EXTRA_PRACTICE, so they keep showing up
 * under Extra Practice rather than disappearing or erroring.
 *
 * Auto-clear rule (agreed design, unchanged): when the same skill has more than one live assignment, My Work merges
 * them into one row (see server/plans/wizard.ts mergeWorkItems) and keeps the fields of the "leading" (most active)
 * one. The tab follows that same leading row — so a skill filed under a tab is never stuck hidden there: the moment
 * a fresh, active, untagged assignment of the same skill out-ranks the old tabbed one, the merged row's tab clears
 * and the skill reappears in the normal grouping.
 */
export type WorkTab = "EXTRA_PRACTICE";

/** old tab values this codebase used to save, read back as EXTRA_PRACTICE (see note above) — never written anymore */
const LEGACY_TABS = ["REVIEW", "PREVIOUS_TERM"] as const;

/** the order of the dropdown and of the rendered tab sections (one value today) */
export const WORK_TABS: readonly WorkTab[] = ["EXTRA_PRACTICE"];

export const WORK_TAB_LABEL: Record<WorkTab, string> = {
  EXTRA_PRACTICE: "Extra Practice",
};

export const isWorkTab = (v: unknown): v is WorkTab => (WORK_TABS as readonly unknown[]).includes(String(v ?? "").trim().toUpperCase());

/** a form value / saved column → the tab, or null (empty, "none", or unknown). Case-insensitive. Old "REVIEW" /
 * "PREVIOUS_TERM" rows already saved in the database read back as EXTRA_PRACTICE (see note above). */
export function parseWorkTab(v: unknown): WorkTab | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (isWorkTab(s)) return s as WorkTab;
  if ((LEGACY_TABS as readonly string[]).includes(s)) return "EXTRA_PRACTICE";
  return null;
}
