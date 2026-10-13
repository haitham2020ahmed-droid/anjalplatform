/** 🚀 ReadRise growth — display words shared by the pages and the exports (tiny, no server code). */
import type { Fit } from "./level";
import type { ProjectionRange } from "./growth";

export const SKILL_LABEL: Record<string, string> = {
  "central-idea": "Central idea", detail: "Detail", inference: "Inference", vocabulary: "Vocabulary", "text-structure": "Text structure",
  "author-purpose": "Author's purpose", "cause-effect": "Cause and effect", sequence: "Sequence", compare: "Compare",
};
export const skillLabel = (k: string) => SKILL_LABEL[k] ?? k;

export const FIT_LABEL: Record<Fit, string> = { EXACT: "exact", STRETCH: "stretch", EASY: "easy" };

/** "about 980 (900–1060)" — or "—" when there is not enough evidence. */
export const rangeText = (p: ProjectionRange | null) => (p ? `${p.mid} (${p.low}–${p.high})` : "—");

export const RANGE_NOTE = "Projected end of year = the trend of the last 8 weeks carried to the end of the year, with a range that is wider when there are few readings or the level jumped around. It needs 4 first-try readings over 2 weeks. An estimate, not a promise.";
