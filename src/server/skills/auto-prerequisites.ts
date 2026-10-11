/**
 * Prerequisites between the skills of one grade, from how the CCSS builds them (a skill that the other
 * one uses). When a student keeps missing a skill whose prerequisite they have not mastered, practice
 * sends them to the prerequisite first (adaptive engine: PREREQ_ROUTE). Added once, never overwritten:
 * an admin's own prerequisites stay as they are. An edge that would close a cycle (A needs B … needs A) with the
 * prerequisites already there is skipped: a cycle would make routing and the knowledge graph loop.
 */
import type { Repo } from "../seeding/repo";

/** [skill family, its prerequisite family] — both in the same grade. */
export const FAMILY_PREREQUISITES: [string, string][] = [
  ["inference", "text-evidence"], ["theme", "character"], ["theme", "plot-events"], ["summarize", "central-idea"],
  ["compare-contrast", "central-idea"], ["compare-texts", "central-idea"], ["author-claim", "central-idea"], ["author-claim", "text-evidence"],
  ["author-perspective", "author-purpose"], ["character-perspective", "character"], ["point-of-view", "character"],
  ["plot-conflict", "plot-events"], ["plot-flashback", "sequence"], ["plot-foreshadowing", "plot-events"], ["make-predictions", "text-evidence"],
  ["idioms-adages", "figurative-language"], ["puns", "multiple-meaning"], ["connotation", "synonyms-antonyms"], ["precise-language", "synonyms-antonyms"],
  ["greek-latin-roots", "prefixes"], ["greek-latin-roots", "suffixes"], ["multiple-meaning", "context-clues"],
  ["subject-verb-agreement", "subjects-predicates"], ["fragments-run-ons", "sentences"], ["compound-sentences", "sentences"],
  ["clauses-complex", "compound-sentences"], ["combining-sentences", "compound-sentences"], ["subjects-predicates", "nouns"],
  ["irregular-verbs", "verb-tenses"], ["verb-tenses", "verbs"], ["adverbs", "verbs"], ["comparatives", "adjectives"],
  ["possessive-nouns", "plural-nouns"], ["apostrophes-contractions", "possessive-nouns"], ["pronoun-homophones", "pronouns"],
  ["quotations-dialogue", "commas"], ["titles-abbreviations", "capitalization"],
  ["writing-argument", "author-claim"], ["writing-informative", "central-idea"], ["writing-research", "text-evidence"],
  // Update 33 · knowledge graph: the foundations reading skills stand on (vocabulary, evidence, the main idea)
  ["inference", "context-clues"], ["central-idea", "text-evidence"], ["theme", "inference"], ["author-purpose", "central-idea"],
  ["point-of-view", "text-evidence"], ["compare-contrast", "text-evidence"], ["figurative-language", "context-clues"],
  ["cause-effect", "text-evidence"], ["problem-solution", "cause-effect"], ["summarize", "sequence"], ["make-predictions", "inference"],
  ["connotation", "context-clues"], ["multiple-meaning", "homographs-homophones"], ["sentences", "subjects-predicates"],
];

const s = (v: unknown) => String(v ?? "");
const family = (code: string) => (code.includes(".") ? code.slice(code.indexOf(".") + 1) : code);

/** True when adding "skillId needs prerequisiteSkillId" closes a cycle: the prerequisite already (indirectly) needs the skill. */
export function wouldCycle(needs: Map<string, Set<string>>, skillId: string, prerequisiteSkillId: string): boolean {
  if (skillId === prerequisiteSkillId) return true;
  const seen = new Set<string>(), stack = [prerequisiteSkillId];
  while (stack.length) {
    const x = stack.pop()!;
    if (x === skillId) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    for (const y of needs.get(x) ?? []) stack.push(y);
  }
  return false;
}

/** Adds the missing prerequisites in every curriculum. Returns how many were added. */
export async function ensurePrerequisites(repo: Repo): Promise<number> {
  const skills = await repo.findMany("Skill", { deletedAt: null }, { select: ["id", "code", "curriculumId"] });
  const existing = await repo.findMany("SkillPrerequisite", {}, { select: ["skillId", "prerequisiteSkillId"] });
  const has = new Set(existing.map((e) => `${s(e.skillId)}|${s(e.prerequisiteSkillId)}`));
  const needs = new Map<string, Set<string>>();
  const link = (a: string, b: string) => { const x = needs.get(a) ?? new Set<string>(); x.add(b); needs.set(a, x); };
  for (const e of existing) link(s(e.skillId), s(e.prerequisiteSkillId));
  const byCur = new Map<string, Map<string, string>>();
  for (const k of skills) {
    const m = byCur.get(s(k.curriculumId)) ?? new Map<string, string>();
    m.set(family(s(k.code)), s(k.id));
    byCur.set(s(k.curriculumId), m);
  }
  const rows: Record<string, unknown>[] = [];
  for (const fam of byCur.values()) for (const [a, b] of FAMILY_PREREQUISITES) {
    const skillId = fam.get(a), prerequisiteSkillId = fam.get(b);
    if (!skillId || !prerequisiteSkillId || has.has(`${skillId}|${prerequisiteSkillId}`)) continue;
    if (wouldCycle(needs, skillId, prerequisiteSkillId)) continue;
    link(skillId, prerequisiteSkillId);
    rows.push({ skillId, prerequisiteSkillId, weight: 0.5, minimumMastery: 60 });
    has.add(`${skillId}|${prerequisiteSkillId}`);
  }
  if (rows.length) await repo.createMany("SkillPrerequisite", rows);
  return rows.length;
}
