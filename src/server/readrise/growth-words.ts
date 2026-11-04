/** 🚀 ReadRise growth — display words shared by the pages and the exports (tiny, no server code). */
import type { Fit } from "./level";
import type { ProjectionRange } from "./growth";

export const SKILL_LABEL: Record<string, string> = {
  "central-idea": "Central idea", detail: "Detail", inference: "Inference", vocabulary: "Vocabulary", "text-structure": "Text structure",
  "author-purpose": "Author's purpose", "cause-effect": "Cause and effect", sequence: "Sequence", compare: "Compare",
};
export const skillLabel = (k: string) => SKILL_LABEL[k] ?? k;

/// each question's skill tag, mapped to the CCSS Reading Anchor Standard it actually measures (CCRA.R.1–6 — the
/// six standards every grade-level reading standard specializes). Not invented: these are the real, official
/// anchor standards; the mapping is a direct reading of each skill tag's own definition, since questions are
/// tagged with a skill, not with a grade-specific CCSS code.
const SKILL_STANDARD: Record<string, string> = {
  detail: "CCRA.R.1", inference: "CCRA.R.1",
  "central-idea": "CCRA.R.2",
  "cause-effect": "CCRA.R.3", sequence: "CCRA.R.3", compare: "CCRA.R.3",
  vocabulary: "CCRA.R.4",
  "text-structure": "CCRA.R.5",
  "author-purpose": "CCRA.R.6",
};
export const standardOfSkill = (skill: string): string => SKILL_STANDARD[skill] ?? "CCRA.R.1";
const STANDARD_NAME: Record<string, string> = {
  "CCRA.R.1": "Key ideas and details", "CCRA.R.2": "Central ideas and summarizing", "CCRA.R.3": "Relationships among ideas and events",
  "CCRA.R.4": "Vocabulary and word choice", "CCRA.R.5": "Text structure", "CCRA.R.6": "Point of view and purpose",
};
export const standardName = (code: string) => STANDARD_NAME[code] ?? code;

export const FIT_LABEL: Record<Fit, string> = { EXACT: "exact", STRETCH: "stretch", EASY: "easy" };

/** "about 980 (900–1060)" — or "—" when there is not enough evidence. */
export const rangeText = (p: ProjectionRange | null) => (p ? `${p.mid} (${p.low}–${p.high})` : "—");

export const RANGE_NOTE = "Projected end of year = the trend of the last 8 weeks carried to the end of the year, with a range that is wider when there are few readings or the level jumped around. It needs 4 first-try readings over 2 weeks. An estimate, not a promise.";
