/**
 * 🧩 The skill pickers' shared rules (pure: safe in client components, server code and tests).
 *
 * Every skill picker on the platform (Live Challenge, test builder, worksheets, week plan, assignments, QR skill
 * games, writing tasks, admin tools …) lists the rows of ONE source (server/skills/picker.ts → skillPickerList) and
 * searches / filters them with the functions below, so a skill is found the same way everywhere:
 *   - whatever the case, "&" or "and", a straight or curly apostrophe, extra spaces or punctuation;
 *   - by any name of its shared pool (the same skill named differently in another grade, e.g. "Main Idea and
 *     Key Details" / "Central Idea and Relevant Details");
 *   - every skill sits in exactly one domain tab: Reading · Grammar · Vocabulary · Writing.
 */

export type SkillTab = "READING" | "GRAMMAR" | "VOCABULARY" | "WRITING";
export type SkillTabFilter = "ALL" | SkillTab;
export const SKILL_TABS: readonly { key: SkillTabFilter; label: string }[] = [
  { key: "ALL", label: "All" }, { key: "READING", label: "Reading" }, { key: "GRAMMAR", label: "Grammar" },
  { key: "VOCABULARY", label: "Vocabulary" }, { key: "WRITING", label: "Writing" },
];
export const TAB_LABEL: Record<SkillTab, string> = { READING: "Reading", GRAMMAR: "Grammar", VOCABULARY: "Vocabulary", WRITING: "Writing" };

/** One row of a skill picker: one shared question pool (every grade's copy of the same skill). */
export interface PickerSkill {
  /** the skill a choice stands for (the copy of the teacher's grade when there is one) */
  id: string;
  name: string;
  /** every name of the pool (this one first): a search finds the row by any of them */
  names: string[];
  code: string;
  grade: number;
  tab: SkillTab;
  /** published questions of the whole pool (0 → shown disabled, "0 Q") */
  questions: number;
  /** every skill id of the pool (all grades) */
  skillIds: string[];
}

/** The domain tab of a skill (never none): grammar code / Grammar · Language → Grammar, Vocabulary · Word Study →
 *  Vocabulary, Writing → Writing, everything else (reading, literature, speaking & listening …) → Reading. */
export function skillTabOf(domain: unknown, code: unknown = ""): SkillTab {
  const d = String(domain ?? "").toUpperCase(), c = String(code ?? "").toLowerCase();
  if (c.includes(".grammar.")) return "GRAMMAR";
  if (/VOCAB|WORD_STUDY|WORD STUDY/.test(d)) return "VOCABULARY";
  if (/WRITING|COMPOSITION/.test(d)) return "WRITING";
  if (/GRAMMAR|LANGUAGE|MECHANICS|CONVENTION|USAGE/.test(d)) return "GRAMMAR";
  return "READING";
}

/** "Character Traits & Development" / "character traits and development" / "Author’s Purpose" → one search key. */
export function skillSearchKey(text: unknown): string {
  return String(text ?? "").toLowerCase().replace(/&/g, " and ").replace(/[’‘'`´]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Does a search find this skill? Empty search: yes. Otherwise any of its names (or its code) contains the search, or
 * every word of the search starts a word of one name ("char dev" → Character Traits & Development).
 */
export function skillMatches(k: { name: string; names?: readonly string[]; code?: string }, q: string): boolean {
  const want = skillSearchKey(q);
  if (!want) return true;
  const qw = want.split(" ").filter((w) => w !== "and");
  const names = [k.name, ...(k.names ?? [])];
  for (const n of names) {
    const key = skillSearchKey(n);
    if (key.includes(want)) return true;
    const words = key.split(" ");
    if (qw.length && qw.every((w) => words.some((x) => x.startsWith(w)))) return true;
  }
  return !!k.code && k.code.toLowerCase().includes(String(q).trim().toLowerCase());
}

/** The rows a picker shows for a search and a tab, A–Z (the given order is kept when `keepOrder`). */
export function filterSkills<T extends { name: string; names?: readonly string[]; code?: string; tab: SkillTab }>(rows: readonly T[], q = "", tab: SkillTabFilter = "ALL", keepOrder = false): T[] {
  const out = rows.filter((k) => (tab === "ALL" || k.tab === tab) && skillMatches(k, q));
  return keepOrder ? out : out.sort(byName);
}

/** A–Z by name (case- and accent-insensitive). */
export const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.name.localeCompare(b.name);

/** The question count shown next to a skill: "12 Q" ("0 Q" for a skill without published questions). */
export const questionBadge = (n: number): string => `${Math.max(0, Math.floor(n || 0))} Q`;
