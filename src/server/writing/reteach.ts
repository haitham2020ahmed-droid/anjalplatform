/**
 * 🎯 Reteach routing for writing: a trait scored 2 or lower points to skills of the class's curriculum
 * (Organization → transitions / sequence / text structure; Evidence → text evidence; Conventions → the grammar and
 * mechanics skills of the error codes found in the writing), ready to assign with the normal skill assignment.
 */
import type { Repo, Row } from "../seeding/repo";
import { MISCONCEPTION_BY_CODE } from "../../insights/misconceptions";

const s = (v: unknown) => String(v ?? "");

/** Skill families (data/curriculum/taxonomy.json) for each trait, best first; missing ones are skipped. */
export const TRAIT_FAMILIES: Record<string, string[]> = {
  organization: ["transitions", "sequence", "text-structure", "compare-contrast", "cause-effect", "problem-solution"],
  evidence: ["text-evidence", "writing-research"],
  details: ["precise-language", "sequence"],
  craft: ["writing-narrative", "description", "precise-language"],
  focus: ["central-idea", "author-purpose"],
  ideas: ["central-idea", "text-evidence"],
  language: ["precise-language", "combining-sentences"],
};
/** The genre's own writing skill, added for focus / organization when the curriculum has it. */
const GENRE_FAMILY: Record<string, string> = { NARRATIVE: "writing-narrative", INFORMATIONAL: "writing-informative", HOW_TO: "writing-informative", OPINION: "writing-argument", RESEARCH: "writing-research" };

/** Error codes (src/insights/misconceptions.ts) → grammar / mechanics skill families. */
export const CODE_FAMILIES: Record<string, string[]> = {
  SENTENCE_BOUNDARY: ["fragments-run-ons", "compound-sentences", "combining-sentences"],
  AGREEMENT: ["subject-verb-agreement"], L1_THIRD_PERSON_S: ["subject-verb-agreement"],
  VERB_FORM: ["verb-tenses", "irregular-verbs"], L1_TENSE_PRESENT_FOR_FUTURE: ["verb-tenses"], L1_PRESENT_PERFECT: ["verb-tenses"], L1_MISSING_BE: ["verbs", "sentences"],
  PRONOUN_REFERENCE: ["pronouns"], PART_OF_SPEECH: ["nouns", "verbs"], GRAMMAR_RULE: ["sentences"],
  WORD_FORM: ["plural-nouns", "comparatives", "negatives"], L1_PLURAL_AFTER_NUMBER: ["plural-nouns"],
  L1_ARTICLE: ["adjectives", "nouns"], L1_ADJ_ORDER: ["adjectives"], L1_PREPOSITION: ["prepositions"],
  APOSTROPHE: ["apostrophes-contractions", "possessive-nouns"], COMMA_PUNCT: ["commas", "quotations-dialogue"],
  CAPITALIZATION: ["capitalization", "titles-abbreviations"], MECHANICS_RULE: ["capitalization", "commas"],
  HOMOPHONE: ["pronoun-homophones", "homographs-homophones"],
  SPELLING: ["spelling"], L1_P_B: ["spelling"], L1_V_F: ["spelling"], L1_SHORT_VOWEL: ["spelling"], L1_CLUSTER: ["spelling"], L1_SILENT_LETTER: ["spelling"],
  VOWEL_TEAM: ["spelling"], R_CONTROLLED: ["spelling"], DOUBLING_RULE: ["spelling"], DROP_E: ["spelling"], Y_TO_I: ["spelling"],
};
/** The codes the AI (or the teacher) may tag in writing: grammar and mechanics, incl. the L1_* (Arabic-speaker) codes. */
export const WRITING_ERROR_CODES = [...MISCONCEPTION_BY_CODE.values()].filter((m) => m.area === "GRAMMAR" || m.area === "MECHANICS").map((m) => m.code);

export interface ReteachSkill { id: string; code: string; name: string }
export interface ReteachRow { trait: string; traitName: string; score: number; skills: ReteachSkill[] }

/** The families to reteach for one weak trait (most useful first, no repeats). */
export function familiesFor(trait: string, genre: string, codes: string[]): string[] {
  const out: string[] = [];
  if (trait === "conventions") {
    const seen = new Map<string, number>();
    for (const c of codes) seen.set(c, (seen.get(c) ?? 0) + 1);
    for (const [c] of [...seen.entries()].sort((a, b) => b[1] - a[1])) out.push(...(CODE_FAMILIES[c] ?? []));
    if (!out.length) out.push("sentences", "capitalization", "commas");
  } else out.push(...(TRAIT_FAMILIES[trait] ?? []));
  if ((trait === "focus" || trait === "organization") && GENRE_FAMILY[genre]) out.push(GENRE_FAMILY[genre]);
  return [...new Set(out)];
}

/** The active skills of the class's grade for these families (Skill.code = G{grade}.{family}), in the families' order. */
export async function skillsForFamilies(repo: Repo, classId: string, families: string[]): Promise<ReteachSkill[]> {
  if (!families.length) return [];
  const klass = await repo.findUnique("Class", { id: classId });
  const grade = klass ? await repo.findUnique("Grade", { id: klass.gradeId }) : null;
  if (!grade) return [];
  const curs = await repo.findMany("Curriculum", { gradeId: grade.id, isActive: true }, { select: ["id"] });
  if (!curs.length) return [];
  const codes = families.map((f) => `G${Number(grade.level)}.${f}`);
  const rows = await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, code: { in: codes }, deletedAt: null }, { select: ["id", "code", "name", "isActive"] });
  const by = new Map<string, Row>(rows.filter((r) => r.isActive !== false).map((r) => [s(r.code), r]));
  return codes.filter((c) => by.has(c)).map((c) => ({ id: s(by.get(c)!.id), code: c, name: s(by.get(c)!.name) }));
}

/** Weak traits (≤ 2) of a scored piece of writing and the skills to reteach each (at most 2 skills per trait). */
export async function reteachFor(repo: Repo, classId: string, genre: string, traits: { key: string; name: string }[], scores: Record<string, number> | null, codes: string[], cache?: Map<string, Promise<ReteachSkill[]>>): Promise<ReteachRow[]> {
  if (!scores) return [];
  const out: ReteachRow[] = [];
  for (const t of traits) {
    const v = Number(scores[t.key]);
    if (!Number.isFinite(v) || v > 2) continue;
    const fams = familiesFor(t.key, genre, codes), key = `${classId}|${fams.join(",")}`;
    let p = cache?.get(key);
    if (!p) { p = skillsForFamilies(repo, classId, fams); cache?.set(key, p); }
    out.push({ trait: t.key, traitName: t.name, score: v, skills: (await p).slice(0, 2) });
  }
  return out;
}
