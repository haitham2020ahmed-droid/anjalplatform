/**
 * 🏷️ The SOURCE of an assignment (owner r74 §1): MAP · NAFS · Curriculum · Grammar · RTI. Chosen by the teacher on
 * EVERY assign window (always empty, no default; the server refuses work without it) and saved on the ASSIGNMENT
 * (Assignment.source), never on the skill: the same skill sent from two sources is two assignments, shown to the
 * student as ONE My Work item with two source badges. Client-safe (no server imports).
 *
 * Older assignments (before r74) have no source: `sourceOfAssignment` infers one for display from what the row
 * already says (program → track → curriculum plan place → the RTI re-check marks), never blocking old data.
 */
import { SOURCE_LABEL, SOURCE_TAG_CLASS } from "./source-tags";

// ⚡ ENRICHMENT is additive: it is never offered in the teacher's manual "Source" dropdown (components/assign/
// source-select.tsx filters it out) — it is only ever set automatically for a plan created as Enrichment. It is
// listed here so it is counted wherever ASSIGN_SOURCES drives a report or badge list (e.g. "By source").
export type AssignSource = "MAP" | "NAFS" | "CURRICULUM" | "GRAMMAR" | "RTI" | "ENRICHMENT";
/** the order of the select and of the badges / cards: MAP, NAFS, Curriculum, Grammar, RTI (owner), Enrichment */
export const ASSIGN_SOURCES: readonly AssignSource[] = ["MAP", "NAFS", "CURRICULUM", "GRAMMAR", "RTI", "ENRICHMENT"];
export const ASSIGN_SOURCE_LABEL: Record<AssignSource, string> = { MAP: SOURCE_LABEL.MAP, NAFS: SOURCE_LABEL.NAFS, CURRICULUM: SOURCE_LABEL.CURRICULUM, GRAMMAR: SOURCE_LABEL.GRAMMAR, RTI: SOURCE_LABEL.RTI, ENRICHMENT: SOURCE_LABEL.ENRICHMENT };
export const ASSIGN_SOURCE_CLASS: Record<AssignSource, string> = { MAP: SOURCE_TAG_CLASS.MAP, NAFS: SOURCE_TAG_CLASS.NAFS, CURRICULUM: SOURCE_TAG_CLASS.CURRICULUM, GRAMMAR: SOURCE_TAG_CLASS.GRAMMAR, RTI: SOURCE_TAG_CLASS.RTI, ENRICHMENT: SOURCE_TAG_CLASS.ENRICHMENT };

/** EN text of the refusal (translated through UI_STRINGS / ar.ts) */
export const SOURCE_REQUIRED = "Choose the source of this work (MAP, NAFS, Curriculum, Grammar or Support).";

export const isAssignSource = (v: unknown): v is AssignSource => (ASSIGN_SOURCES as readonly unknown[]).includes(String(v ?? "").trim().toUpperCase());
/** a form value → the source, or null (empty / unknown). Case-insensitive. */
export const parseAssignSource = (v: unknown): AssignSource | null => (isAssignSource(v) ? (String(v).trim().toUpperCase() as AssignSource) : null);

const TEST_MARKS = new Set(["TEST", "WEEKLY_CHECK"]);
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * The source of an assignment row (pure): its saved `source`; else (older rows) inferred once for display —
 * program (MAP/NAFS/RTI/CURRICULUM) → track (MAP/NAFS/RTI/GRAMMAR) → a curriculum plan place → the RTI tier marks
 * (re-check / extra-practice note) → Curriculum.
 */
export function sourceOfAssignment(a: Readonly<Record<string, unknown>>): AssignSource {
  const saved = parseAssignSource(a.source);
  if (saved) return saved;
  const prog = parseAssignSource(a.program);
  if (prog) return prog;
  const track = parseAssignSource(a.track);
  if (track && track !== "CURRICULUM") return track;
  if (a.curriculumPlanId && !TEST_MARKS.has(s(a.curriculumPlanId))) return "CURRICULUM";
  if (s(a.title).startsWith("Re-check: ") || s(a.note) === "Extra practice on this skill, then a short re-check.") return "RTI";
  return "CURRICULUM";
}

