/**
 * One name and one color per source of work, everywhere (My Work, My Plans, the Plans wizard, reports):
 * Curriculum = blue, MAP = green, RTI = orange, Grammar = purple, NAFS = teal, Custom = grey.
 * Client-safe (no server imports). The stored value is Assignment.track / SkillPlan.kind.
 */
export type SourceKey = "CURRICULUM" | "MAP" | "NAFS" | "RTI" | "GRAMMAR" | "CUSTOM" | "ENRICHMENT";
export type SourceLabel = "Curriculum" | "MAP" | "NAFS" | "RTI" | "Grammar" | "Custom" | "Enrichment";

export const SOURCE_LABEL: Record<SourceKey, SourceLabel> = {
  CURRICULUM: "Curriculum", MAP: "MAP", NAFS: "NAFS", RTI: "RTI", GRAMMAR: "Grammar", CUSTOM: "Custom", ENRICHMENT: "Enrichment",
};

/** Tailwind classes for the small colored tag. */
export const SOURCE_TAG_CLASS: Record<SourceKey, string> = {
  CURRICULUM: "bg-blue-100 text-blue-900 ring-blue-300",
  MAP: "bg-green-100 text-green-900 ring-green-300",
  NAFS: "bg-teal-100 text-teal-900 ring-teal-300",
  RTI: "bg-orange-100 text-orange-900 ring-orange-300",
  GRAMMAR: "bg-purple-100 text-purple-900 ring-purple-300",
  CUSTOM: "bg-slate-100 text-slate-800 ring-slate-300",
  ENRICHMENT: "bg-amber-100 text-amber-900 ring-amber-300",
};

const KEYS = Object.keys(SOURCE_LABEL) as SourceKey[];
export const sourceKeyOf = (v: unknown): SourceKey => (KEYS.includes(String(v) as SourceKey) ? (String(v) as SourceKey) : "CURRICULUM");

/**
 * The source a student sees for one piece of work: a grammar skill sent as Curriculum or Custom work shows as
 * Grammar (all grammar work lives in My Work under the Grammar tag); MAP / NAFS / RTI keep their own tag.
 */
export function sourceOfWork(track: unknown, grammar: boolean): SourceKey {
  const k = sourceKeyOf(track);
  return grammar && (k === "CURRICULUM" || k === "CUSTOM" || k === "GRAMMAR") ? "GRAMMAR" : k;
}

/** Plan kind (SkillPlan.kind) → its source. PLACES / CURRICULUM / UNIT plans are Curriculum plans. */
export function sourceOfPlanKind(kind: unknown): SourceKey {
  const k = String(kind ?? "");
  return k === "MAP" ? "MAP" : k === "NAFS" ? "NAFS" : k === "RTI" ? "RTI" : k === "CUSTOM" ? "CUSTOM" : k === "ENRICHMENT" ? "ENRICHMENT" : "CURRICULUM";
}
