/**
 * 🧭 Curriculum-Map questions → their real literacy skill (Update 39C, readiness I-18 / Batch B "still open").
 *
 * A question placed on the Curriculum Map without a platform skill was filed under the grade's hidden
 * “Unclassified (Curriculum Map)” skill (22 % of all answers in the readiness simulation). Its answers then taught
 * the skill model nothing a teacher could see. This module finds each question's real skill, in this order of trust:
 *
 *   STANDARD   the question's CCSS standard is linked to exactly one skill of the grade (several: the one the map
 *              place names, else the closest name)
 *   READMASTER a ReadMaster article's question: the article's skill (set by staff), else its skill name
 *   MAP_PLACE  the place's skill text, exactly as written on the school's Curriculum Map, e.g.
 *              “Reread / Diagrams and Headings \ Compare and Contrast” (strategy / text feature \ focus skill) — the
 *              focus skill first, then the text feature, then the strategy; each phrase goes through a literacy
 *              alias table (ELA taxonomy → skill family) and then a careful name match inside the place's strand
 *              (Concept Vocabulary → vocabulary / word study; Analyze Craft and Structure → reading skills)
 *   CATEGORY   Respond to Reading places → Cite Text Evidence (what an RTR answer measures)
 *   TEXT       the question's own wording (rule-based literacy tags, src/questions/intelligence.ts: a context-clue
 *              question → Context Clues; “main idea”, “theme”, “infer”, “author's purpose”, “evidence” …)
 *   (none)     left on the hidden skill — never guessed
 *
 * applyRemap re-tags the questions (Question.skillId; the map place, text and status are untouched; NO question is
 * ever deleted), moves their past answers (QuestionAttempt.skillId) to the real skill — also answers left on the hidden
 * skill after an earlier manual classification — and recomputes each affected student × skill through the engine
 * (EAP ability with the item's guessing floor → computeMastery), the same path the practice engine uses. Every move is
 * written to the audit log. It is idempotent: a second run finds nothing to do.
 */
import type { Repo, Row } from "../seeding/repo";
import { isHiddenSkill } from "../skills/master";
import { estimateClueType } from "../../questions/intelligence";
import { estimateAbilityEAP } from "../../adaptive/irt";
import { toWeighted } from "../../adaptive/evidence";
import { computeMastery } from "../../mastery/mastery";
import { skillEngineConfig, skillHistoryWithEvidence } from "../practice/skill-evidence";
import { allLessonDetails, type LessonDetail } from "./lesson-details";

const s = (v: unknown) => String(v ?? "");
const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();

export type RemapVia = "STANDARD" | "READMASTER" | "MAP_PLACE" | "CATEGORY" | "TEXT" | "IMPORT_SKILL" | "TAGS";
export interface RemapItem {
  questionId: string; grade: number; place: string | null; fromSkillId: string;
  toSkillId: string | null; toSkill: string | null; via: RemapVia | null; detail: string;
  /** UI reorg Phase 1: how sure the rule is (0–1). Below the link threshold a decision is reviewed, never applied. */
  confidence?: number;
}
export interface RemapPlan {
  items: RemapItem[];
  mapped: number;
  left: number;
  /** answers on the hidden skill whose question has (or will have) a real skill */
  attemptsToMove: number;
}
export interface RemapResult { questions: number; attempts: number; recomputed: number; left: number; byVia: Record<string, number> }

/** ELA taxonomy phrases (as written on the Curriculum Map) → skill families, first existing family of the grade wins. */
export const PLACE_ALIASES: [RegExp, string[]][] = [
  // reading: informational
  [/^compare (and|&) contrast( texts)?$/, ["compare-contrast", "compare-texts"]],
  [/^(central idea( and relevant details)?|main idea( and (key )?details)?)$/, ["central-idea", "summarize"]],
  [/^(cause and effect)$/, ["cause-effect"]],
  [/^(chronology|sequence( of events)?|timelines?)$/, ["sequence", "plot-events"]],
  [/^problem and solution$/, ["problem-solution"]],
  [/^author.?s (claim|argument)$|^claim and evidence$|^evaluate argument( and claims?)?$/, ["author-claim"]],
  [/^author.?s perspective$/, ["author-perspective", "point-of-view"]],
  [/^author.?s (point of view)$/, ["author-perspective", "point-of-view"]],
  [/^author.?s purpose( and point of view)?$/, ["author-purpose"]],
  [/^(text(ual)? evidence|cite text evidence)$/, ["text-evidence"]],
  [/^(text structure|part-whole relationship|item-category relationship)$/, ["compare-contrast", "cause-effect", "sequence", "description"]],
  [/^(text features?|diagrams( and headings)?|headings.*|graphs.*|maps.*|sidebars.*|photographs.*|charts.*|captions.*|primary and secondary sources)$/, ["text-features"]],
  // reading: literature
  [/^(determine )?theme$|^author.?s message$|^point of view and theme$/, ["theme"]],
  [/^plot:? (conflict( and resolution)?)$/, ["plot-conflict", "plot-events"]],
  [/^plot:? events$|^(story structure|elements of a short story:? plot|plot)$/, ["plot-events"]],
  [/^plot:? setting$|^setting$/, ["plot-setting", "plot-events"]],
  [/^plot:? flashback$/, ["plot-flashback", "plot-events"]],
  [/^plot:? foreshadowing$/, ["plot-foreshadowing", "plot-events"]],
  [/^plot:? characterization$|^character development$|^character traits.*$/, ["character"]],
  [/^character perspective$/, ["character-perspective", "point-of-view"]],
  [/^point of view( and perspective)?$/, ["point-of-view"]],
  [/^(elements of a play|dramatic elements( and structure)?|dialogue|stage directions)$/, ["drama-elements"]],
  [/^(poetic structure|structure|stanza and meter|rhyme and structure|repetition and rhyme|(lyric|narrative|free) (poetry|verse).*|lyric and (free verse|narrative))$/, ["poetry-elements"]],
  [/^(assonance and consonance|sound devices)$/, ["sound-devices", "poetry-elements"]],
  [/^(imagery( and personification)?)$/, ["imagery", "figurative-language"]],
  [/^(word choice and tone|tone|author.?s (word choice|style))$/, ["connotation", "precise-language", "figurative-language"]],
  // strategies
  [/^reread$/, ["reread"]],
  [/^make predictions$/, ["make-predictions"]],
  [/^summarize$/, ["summarize"]],
  [/^ask and answer questions$/, ["ask-answer-questions"]],
  [/^visualize$/, ["visualize"]],
  // vocabulary and word study
  [/^multiple[- ]meaning words$/, ["multiple-meaning", "homographs-homophones", "context-clues"]],
  [/^(idioms|proverbs and adages|adages and proverbs)$/, ["idioms-adages", "figurative-language"]],
  [/^(similes? and metaphors?|personification|figurative language)$/, ["figurative-language"]],
  [/^(synonyms( and antonyms)?|antonyms)$/, ["synonyms-antonyms"]],
  [/^(context clues( and impact)?)$/, ["context-clues"]],
  [/^(greek|latin|greek and latin|latin and greek) roots$|^root words$/, ["greek-latin-roots"]],
  [/^((greek and latin|latin and greek) )?prefixes( and suffixes)?$/, ["prefixes", "greek-latin-roots"]],
  [/^suffixes$/, ["suffixes"]],
  [/^connotation and denotation$/, ["connotation", "context-clues"]],
  [/^(homographs|homophones|homographs and homophones)$/, ["homographs-homophones"]],
];

/** Wording of the question → families (the place says nothing): rule-based, conservative. */
const TEXT_RULES: [RegExp, string[]][] = [
  [/\b(main|central) idea\b/i, ["central-idea", "summarize"]],
  [/\btheme\b|\blesson (the|of the) (story|poem|text)\b/i, ["theme"]],
  [/\bauthor'?s purpose\b|\bwhy did the author (write|include)\b/i, ["author-purpose"]],
  [/\bstructure\b|\borgani[sz]ed?\b/i, ["compare-contrast", "cause-effect", "sequence", "problem-solution"]],
  [/\b(infer|conclude|most likely)\b/i, ["inference"]],
  [/\b(evidence|best supports?|which (sentence|detail)s? supports?)\b/i, ["text-evidence"]],
  [/\bsummar/i, ["summarize"]],
  [/\b(point of view|narrator)\b/i, ["point-of-view"]],
  [/\bcharacter\b/i, ["character"]],
  [/\bwhat does (the word|the phrase)\b|\bmeaning of\b|\bword .* means?\b|\bthe word .* mean\b/i, ["context-clues", "multiple-meaning"]],
];

const STOP = new Set(["and", "the", "of", "a", "an", "to", "in", "with", "text", "skills", "skill"]);
const words = (x: string) => new Set(x.toLowerCase().replace(/[’']/g, "").split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w)));
const norm = (x: string) => x.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").replace(/\s*:\s*/g, ": ").trim();

/** The phrases of a place's skill text, most specific first (focus skill → text feature → strategy). */
export function placePhrases(skillsText: string): string[] {
  const segs = s(skillsText).split("\\").map((x) => x.trim()).filter(Boolean);
  if (!segs.length) return [];
  if (segs[0].includes("/")) {
    // Grades 4–5: “Strategy / Text feature \ Focus skill”
    const [strategy, ...feature] = segs[0].split("/").map((x) => x.trim()).filter(Boolean);
    return [...segs.slice(1), ...feature, ...(strategy ? [strategy] : [])];
  }
  return segs; // Grade 6: “A \ B \ C”, the first is the lesson's main skill
}

export interface GradeSkill { id: string; name: string; family: string; category: string }
const CV_CATS = new Set(["VOCABULARY", "WORD_STUDY"]);
const ACS_CATS = new Set(["COMPREHENSION", "INFORMATIONAL", "LITERATURE", "VOCABULARY"]);

/** Pure: the skill a phrase names in this grade (alias table, then a careful name match inside the strand). */
export function skillForPhrase(phrase: string, skills: GradeSkill[], category: string | null): { skill: GradeSkill; how: "alias" | "name" } | null {
  const p = norm(phrase);
  const byFamily = new Map(skills.map((k) => [k.family, k]));
  for (const [re, fams] of PLACE_ALIASES) {
    if (!re.test(p)) continue;
    for (const f of fams) { const k = byFamily.get(f); if (k) return { skill: k, how: "alias" }; }
  }
  const allowed = category === "CONCEPT_VOCABULARY" ? CV_CATS : category === "ANALYZE_CRAFT_AND_STRUCTURE" ? ACS_CATS : null;
  const pw = words(p);
  if (!pw.size) return null;
  let best: { k: GradeSkill; score: number } | null = null;
  for (const k of skills) {
    if (allowed && !allowed.has(k.category)) continue;
    const kw = words(k.name);
    let inter = 0; for (const w of pw) if (kw.has(w)) inter++;
    const score = inter / pw.size;
    if (inter && score >= 0.5 && (!best || score > best.score)) best = { k, score };
  }
  return best ? { skill: best.k, how: "name" } : null;
}

/** Pure: the decision for one question. */
/** UI reorg Phase 1: how sure each rule is. Deterministic rules ≥ 0.8; closest-name and wording guesses below. */
export const RULE_CONFIDENCE = { STANDARD_ONLY: 0.95, STANDARD_PLACE: 0.9, STANDARD_FIRST: 0.6, READMASTER_SKILL: 0.95, READMASTER_NAME: 0.85, PLACE_ALIAS: 0.9, PLACE_NAME: 0.65, CATEGORY: 0.8, CLUE: 0.8, TEXT: 0.5, LESSON_CV: 0.85, LESSON_REVIEW: 0.8 } as const;

/**
 * r68: the lesson a map place belongs to (its selection / text set): the reading skills of its Analyze Craft and
 * Structure part (the map's own text, else the lesson details' readingSkills), its vocabulary skill (the Concept
 * Vocabulary part's text, else the lesson details' vocabularySkill) and its vocabulary words.
 */
export interface LessonContext { readingPhrases: string[]; vocabularyPhrases: string[]; words: string[] }

/** The grade's Concept Vocabulary skill among these (its name / code says so, else a plain “… Vocabulary” skill). */
export function conceptVocabularyOf<T extends { name: string; code?: string }>(skills: T[]): T | null {
  return skills.find((k) => /concept[\s._-]*vocab/i.test(`${k.code ?? ""} ${k.name}`) || /\.(?:cv|concept-vocabulary)$/i.test(k.code ?? ""))
    ?? skills.find((k) => /\bvocabulary\b/i.test(k.name) && !/context|unclassified|academic|domain|grammar|reference|figurative/i.test(k.name))
    ?? null;
}

/** A word of the lesson in the stem (“affect”, “affected”, “emerges”). */
function usesLessonWord(stem: string, words: string[]): string | null {
  const t = stem.toLowerCase();
  for (const w of words) {
    const base = w.toLowerCase().trim();
    if (base.length < 3) continue;
    const root = base.length > 5 ? base.replace(/(e|y|ly|ed|ing|s)$/, "") : base;
    if (new RegExp(`\\b${root.replace(/[^a-z-]/g, "")}[a-z]*\\b`).test(t)) return w;
  }
  return null;
}
const VOCAB_STEM = /\b(?:means|meaning|definition|synonyms?|antonyms?|key words?|vocabulary)\b|\bmatch each (?:key )?word\b|\bwhat does [“"]?[a-z-]+[”"]? mean\b/i;

export function decideSkill(q: { stem: string; standardCandidates: GradeSkill[]; category: string | null; skillsText: string | null; article?: { skillId: string | null; skillName: string | null } | null; lesson?: LessonContext | null; cvSkill?: GradeSkill | null }, skills: GradeSkill[]): { skill: GradeSkill; via: RemapVia; detail: string; confidence: number } | null {
  // an Analyze Craft and Structure place whose map text is empty: the lesson details' reading skills
  const phrases = q.skillsText ? placePhrases(q.skillsText) : q.category === "ANALYZE_CRAFT_AND_STRUCTURE" ? (q.lesson?.readingPhrases ?? []) : q.category === "CONCEPT_VOCABULARY" ? (q.lesson?.vocabularyPhrases ?? []) : [];
  if (q.article) {
    const own = q.article.skillId ? skills.find((k) => k.id === q.article!.skillId) : undefined;
    if (own) return { skill: own, via: "READMASTER", detail: "the ReadMaster article's skill", confidence: RULE_CONFIDENCE.READMASTER_SKILL };
    const hit = q.article.skillName ? skillForPhrase(q.article.skillName, skills, null) : null;
    if (hit) return { skill: hit.skill, via: "READMASTER", detail: `the ReadMaster article's skill “${q.article.skillName}”`, confidence: hit.how === "alias" || hit.skill.name.toLowerCase() === String(q.article.skillName).toLowerCase() ? RULE_CONFIDENCE.READMASTER_NAME : RULE_CONFIDENCE.PLACE_NAME };
  }
  if (q.standardCandidates.length === 1) return { skill: q.standardCandidates[0], via: "STANDARD", detail: "the only skill linked to the question's standard", confidence: RULE_CONFIDENCE.STANDARD_ONLY };
  if (q.standardCandidates.length > 1) {
    for (const ph of phrases) { const hit = skillForPhrase(ph, q.standardCandidates, q.category); if (hit) return { skill: hit.skill, via: "STANDARD", detail: `standard + map place “${ph}”`, confidence: RULE_CONFIDENCE.STANDARD_PLACE }; }
    return { skill: q.standardCandidates[0], via: "STANDARD", detail: `one of ${q.standardCandidates.length} skills linked to the question's standard`, confidence: RULE_CONFIDENCE.STANDARD_FIRST };
  }
  for (const ph of phrases) {
    const hit = skillForPhrase(ph, skills, q.category);
    if (hit) return { skill: hit.skill, via: "MAP_PLACE", detail: `map place “${ph}”${hit.how === "name" ? " (closest skill name)" : ""}`, confidence: hit.how === "alias" ? RULE_CONFIDENCE.PLACE_ALIAS : RULE_CONFIDENCE.PLACE_NAME };
  }
  // r68: a Concept Vocabulary place the map names no skill for (Grade 6: “1- Concept Vocabulary”) → the grade's
  // Concept Vocabulary skill (the words of that selection)
  if (q.category === "CONCEPT_VOCABULARY" && q.cvSkill) return { skill: q.cvSkill, via: "MAP_PLACE", detail: "the grade's Concept Vocabulary skill (Concept Vocabulary place)", confidence: RULE_CONFIDENCE.LESSON_CV };
  // r68: a selection's Review → a vocabulary question goes with the selection's vocabulary; any other question with
  // the selection's Analyze Craft and Structure skills (the one its wording names, else the lesson's main skill)
  if (q.category === "REVIEW" && q.lesson) {
    const stem = s(q.stem);
    const word = usesLessonWord(stem, q.lesson.words);
    if (word || VOCAB_STEM.test(stem)) {
      for (const ph of q.lesson.vocabularyPhrases) { const hit = skillForPhrase(ph, skills, "CONCEPT_VOCABULARY"); if (hit && hit.how === "alias") return { skill: hit.skill, via: "MAP_PLACE", detail: `Review: the selection's vocabulary skill “${ph}”${word ? ` (the word “${word}”)` : ""}`, confidence: RULE_CONFIDENCE.LESSON_REVIEW }; }
      if (q.cvSkill) return { skill: q.cvSkill, via: "MAP_PLACE", detail: `Review: the selection's vocabulary${word ? ` (the word “${word}”)` : ""}`, confidence: RULE_CONFIDENCE.LESSON_REVIEW };
    }
    const lessonSkills: GradeSkill[] = [];
    for (const ph of q.lesson.readingPhrases) { const hit = skillForPhrase(ph, skills, "ANALYZE_CRAFT_AND_STRUCTURE"); if (hit && !lessonSkills.some((k) => k.id === hit.skill.id)) lessonSkills.push(hit.skill); }
    if (lessonSkills.length) {
      for (const [re, fams] of TEXT_RULES) {
        if (!re.test(stem)) continue;
        const k = lessonSkills.find((x) => fams.includes(x.family));
        if (k) return { skill: k, via: "MAP_PLACE", detail: `Review: the selection's skill “${k.name}” (question wording)`, confidence: RULE_CONFIDENCE.LESSON_REVIEW };
      }
      return { skill: lessonSkills[0], via: "MAP_PLACE", detail: `Review: the selection's main skill “${lessonSkills[0].name}”`, confidence: RULE_CONFIDENCE.LESSON_REVIEW };
    }
  }
  const byFamily = new Map(skills.map((k) => [k.family, k]));
  if (q.category === "RESPOND_TO_READING") {
    const k = byFamily.get("text-evidence") ?? byFamily.get("summarize");
    if (k) return { skill: k, via: "CATEGORY", detail: "Respond to Reading measures citing text evidence", confidence: RULE_CONFIDENCE.CATEGORY };
  }
  const stem = s(q.stem);
  if (q.category === "CONCEPT_VOCABULARY") {
    const clue = estimateClueType("context-clues", stem, { category: "VOCABULARY" });
    if (clue && clue !== "NONE" && byFamily.get("context-clues")) return { skill: byFamily.get("context-clues")!, via: "TEXT", detail: `context-clue question (${clue.toLowerCase().replace(/_/g, " ")})`, confidence: RULE_CONFIDENCE.CLUE };
  }
  for (const [re, fams] of TEXT_RULES) {
    if (!re.test(stem)) continue;
    // a vocabulary place keeps to vocabulary skills; a reading place to reading skills
    for (const f of fams) {
      const k = byFamily.get(f);
      if (!k) continue;
      if (q.category === "CONCEPT_VOCABULARY" && !CV_CATS.has(k.category)) continue;
      if (q.category === "ANALYZE_CRAFT_AND_STRUCTURE" && !ACS_CATS.has(k.category)) continue;
      return { skill: k, via: "TEXT", detail: `question wording (${re.source.replace(/\\b|\\/g, "").slice(0, 40)})`, confidence: RULE_CONFIDENCE.TEXT };
    }
  }
  return null;
}

interface SchoolSkills { hidden: Row[]; gradeOfCur: Map<string, number>; byGrade: Map<number, GradeSkill[]>; real: Row[]; cvOf: Map<number, GradeSkill> }
async function schoolSkills(repo: Repo, schoolId: string): Promise<SchoolSkills> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const all = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "code", "name", "curriculumId", "isActive", "category", "familyId"] }) : [];
  const hidden = all.filter((k) => isHiddenSkill(k.code));
  const real = all.filter((k) => !isHiddenSkill(k.code) && k.isActive !== false && k.isActive !== 0);
  const byGrade = new Map<number, GradeSkill[]>();
  const cvOf = new Map<number, GradeSkill>();
  for (const k of real) {
    const g = gradeOfCur.get(s(k.curriculumId)) ?? 0;
    const m = s(k.code).toLowerCase().match(/^g\d+\.([a-z0-9-]+)$/);
    if (!m) continue; // grammar-workbook skills (G4.grammar.…) are never a map place's skill
    const l = byGrade.get(g) ?? []; l.push({ id: s(k.id), name: s(k.name), family: m[1], category: s(k.category) }); byGrade.set(g, l);
  }
  // r68: each grade's Concept Vocabulary skill (any code: an imported one too)
  for (const g of new Set(real.map((k) => gradeOfCur.get(s(k.curriculumId)) ?? 0))) {
    const k = conceptVocabularyOf(real.filter((x) => (gradeOfCur.get(s(x.curriculumId)) ?? 0) === g).map((x) => ({ id: s(x.id), name: s(x.name), code: s(x.code), category: s(x.category) })));
    if (k) cvOf.set(g, { id: k.id, name: k.name, family: s(k.code).toLowerCase().match(/^g\d+\.([a-z0-9-]+)$/)?.[1] ?? "concept-vocabulary", category: k.category });
  }
  return { hidden, gradeOfCur, byGrade, real, cvOf };
}

/** “G6.U1.SEL1.CV” → the lesson details of Grade 6, Unit 1, Selection 1. */
function lessonOfCode(code: string): LessonDetail | null {
  const m = /^G(\d+)\.U(\d+)\.(?:TS|SEL)(\d+)\b/i.exec(code);
  if (!m) return null;
  return Object.values(allLessonDetails()[m[1]] ?? {}).find((l) => l.unit === Number(m[2]) && l.number === Number(m[3])) ?? null;
}

/**
 * r68: a grade with Concept Vocabulary / Review questions waiting and no Concept Vocabulary skill gets one: the skill
 * of another grade with that name is copied (its family kept), else “Concept Vocabulary” is created. A grade that has
 * it under another name (“Vocabulary”, “Selection Vocabulary”) keeps that one (conceptVocabularyOf). Idempotent;
 * written to the audit log. Returns the grades that got one.
 */
export async function ensureConceptVocabularySkills(repo: Repo, schoolId: string, questionIds: string[], actorId: string | null = null, now = new Date()): Promise<number[]> {
  if (!questionIds.length) return [];
  const links = await repo.findMany("QuestionMapLink", { questionId: { in: questionIds } }, { select: ["nodeId"] });
  if (!links.length) return [];
  const nodes = await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["code"] });
  const grades = [...new Set(nodes.map((n) => /^G(\d+)\..*\.(?:CV|REV)$/i.exec(s(n.code))?.[1]).filter(Boolean).map(Number))];
  if (!grades.length) return [];
  const sk = await schoolSkills(repo, schoolId);
  const made: number[] = [];
  for (const g of grades) {
    if (sk.cvOf.has(g)) continue;
    const grade = (await repo.findMany("Grade", { schoolId, level: g }, { select: ["id"] }))[0];
    const cur = grade ? (await repo.findMany("Curriculum", { gradeId: grade.id }, { select: ["id"] }))[0] : undefined;
    if (!cur) continue;
    const code = `G${g}.concept-vocabulary`;
    const have = (await repo.findMany("Skill", { curriculumId: cur.id, code }, { select: ["id", "deletedAt", "isActive"] }))[0];
    if (have) continue; // switched off or deleted by an admin: left as the admin decided
    const other = conceptVocabularyOf(sk.real.filter((k) => /concept[\s._-]*vocab/i.test(`${s(k.code)} ${s(k.name)}`)).map((k) => ({ id: s(k.id), name: s(k.name), code: s(k.code), familyId: s(k.familyId) })));
    const familyId = other?.familyId || s((await repo.upsert("SkillFamily", { code: "concept-vocabulary" }, { name: "Concept Vocabulary", domain: "VOCABULARY", category: "VOCABULARY" })).id);
    const name = other ? other.name.replace(/\s*\(?\b(?:grade|gr\.?|g)\s*\d{1,2}\)?\s*/gi, " ").trim() || "Concept Vocabulary" : "Concept Vocabulary";
    const row = await repo.create("Skill", {
      curriculumId: cur.id, familyId, code, name,
      description: "The words of each selection's Concept Vocabulary on the Curriculum Map (and the vocabulary of its Review).",
      domain: "VOCABULARY", category: "VOCABULARY", sequence: 900, isActive: true,
    });
    await repo.create("AuditLog", { actorId, action: "skill.create", entityType: "Skill", entityId: s(row.id), before: null, after: { code, name, grade: g, why: other ? `copied from “${other.name}” of another grade` : "the grade had no Concept Vocabulary skill (Curriculum Map questions)" }, createdAt: now });
    made.push(g);
  }
  return made;
}

/** What a remap would do (no writes). `questionIds` limits it (new questions after an import or an edit). */
export async function planRemap(repo: Repo, schoolId: string, opts: { questionIds?: string[] } = {}): Promise<RemapPlan> {
  const sk = await schoolSkills(repo, schoolId);
  if (!sk.hidden.length) return { items: [], mapped: 0, left: 0, attemptsToMove: 0 };
  const hiddenIds = sk.hidden.map((k) => s(k.id));
  const where: Record<string, unknown> = { skillId: { in: hiddenIds }, deletedAt: null };
  if (opts.questionIds) { if (!opts.questionIds.length) return { items: [], mapped: 0, left: 0, attemptsToMove: 0 }; where.id = { in: opts.questionIds }; }
  const qs = await repo.findMany("Question", where, { select: ["id", "skillId", "standardId", "stem"] });
  const gradeOfHidden = new Map(sk.hidden.map((k) => [s(k.id), sk.gradeOfCur.get(s(k.curriculumId)) ?? 0]));
  const links = qs.length ? await repo.findMany("QuestionMapLink", { questionId: { in: qs.map((q) => q.id) } }, { select: ["questionId", "nodeId"] }) : [];
  // the place and its ancestors (category node holds the skill text and the strand)
  const nodes = new Map<string, Row>();
  let want = [...new Set(links.map((l) => s(l.nodeId)))];
  for (let depth = 0; want.length && depth < 4; depth++) {
    const got = await repo.findMany("CurriculumMapNode", { id: { in: want } }, { select: ["id", "code", "parentId", "categoryType", "skills"] });
    for (const n of got) nodes.set(s(n.id), n);
    want = [...new Set(got.map((n) => s(n.parentId)).filter((p) => p && !nodes.has(p)))];
  }
  // r68: the lesson of each place (its selection / text set): the other parts' skill texts and the lesson details
  const sets = [...nodes.values()].filter((n) => /^G\d+\.U\d+\.(?:TS|SEL)\d+$/i.test(s(n.code)));
  const parts = sets.length ? await repo.findMany("CurriculumMapNode", { parentId: { in: sets.map((n) => s(n.id)) } }, { select: ["id", "parentId", "categoryType", "skills"] }) : [];
  const lessonOf = new Map<string, LessonContext>();
  for (const set of sets) {
    const mine = parts.filter((p) => s(p.parentId) === s(set.id));
    const acs = s(mine.find((p) => p.categoryType === "ANALYZE_CRAFT_AND_STRUCTURE")?.skills).trim();
    const cv = s(mine.find((p) => p.categoryType === "CONCEPT_VOCABULARY")?.skills).trim();
    const d = lessonOfCode(s(set.code));
    lessonOf.set(s(set.id), {
      readingPhrases: acs ? placePhrases(acs) : d?.readingSkills?.length ? placePhrases(d.readingSkills.join(" \\ ")) : [],
      vocabularyPhrases: cv ? [cv] : d?.vocabularySkill ? [d.vocabularySkill] : [],
      words: d?.vocabulary ?? [],
    });
  }
  const stdIds = [...new Set(qs.map((q) => s(q.standardId)).filter(Boolean))];
  const stdLinks = stdIds.length ? await repo.findMany("SkillStandard", { standardId: { in: stdIds } }, { select: ["skillId", "standardId"] }) : [];
  // ReadMaster questions: their article (version → article)
  const rmq = qs.length ? await repo.findMany("ReadMasterQuestion", { questionId: { in: qs.map((q) => q.id) } }, { select: ["questionId", "versionId"] }) : [];
  const rmv = rmq.length ? await repo.findMany("ReadMasterVersion", { id: { in: [...new Set(rmq.map((r) => s(r.versionId)))] } }, { select: ["id", "articleId"] }) : [];
  const rma = rmv.length ? await repo.findMany("ReadMasterArticle", { id: { in: [...new Set(rmv.map((v) => s(v.articleId)))] } }, { select: ["id", "skillId", "skillName"] }) : [];
  const articleOf = (qid: string) => { const v = rmv.find((x) => x.id === rmq.find((r) => r.questionId === qid)?.versionId); const a = v ? rma.find((x) => x.id === v.articleId) : undefined; return a ? { skillId: a.skillId ? s(a.skillId) : null, skillName: a.skillName ? s(a.skillName) : null } : null; };
  const items: RemapItem[] = [];
  for (const q of qs) {
    const grade = gradeOfHidden.get(s(q.skillId)) ?? 0;
    const skills = sk.byGrade.get(grade) ?? [];
    const link = links.find((l) => l.questionId === q.id);
    let node = link ? nodes.get(s(link.nodeId)) : undefined;
    const place = node ? s(node.code) : null;
    let category: string | null = null, skillsText: string | null = null, lesson: LessonContext | null = null;
    for (let i = 0; node && i < 4; i++) {
      if (!category && node.categoryType) category = s(node.categoryType);
      if (!skillsText && node.skills) skillsText = s(node.skills);
      if (!lesson) lesson = lessonOf.get(s(node.id)) ?? null;
      node = node.parentId ? nodes.get(s(node.parentId)) : undefined;
    }
    const cands = q.standardId ? skills.filter((k) => stdLinks.some((l) => l.standardId === q.standardId && s(l.skillId) === k.id)) : [];
    const pick = decideSkill({ stem: s(q.stem), standardCandidates: cands, category, skillsText, article: articleOf(s(q.id)), lesson, cvSkill: sk.cvOf.get(grade) ?? null }, skills);
    items.push({ questionId: s(q.id), grade, place, fromSkillId: s(q.skillId), toSkillId: pick?.skill.id ?? null, toSkill: pick?.skill.name ?? null, via: pick?.via ?? null, detail: pick?.detail ?? (place ? "the map place names no skill this grade has" : "not on the Curriculum Map"), confidence: pick?.confidence ?? 0 });
  }
  const mappedIds = items.filter((i) => i.toSkillId).map((i) => i.questionId);
  const attemptsToMove = (mappedIds.length ? await countIn(repo, "QuestionAttempt", "questionId", mappedIds, { skillId: { in: hiddenIds } }) : 0)
    + (await strandedAttempts(repo, hiddenIds, opts.questionIds)).length;
  return { items, mapped: mappedIds.length, left: items.length - mappedIds.length, attemptsToMove };
}

async function countIn(repo: Repo, model: string, field: string, ids: string[], extra: Record<string, unknown>): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += 500) n += await repo.count(model, { [field]: { in: ids.slice(i, i + 500) }, ...extra });
  return n;
}

/** Answers still on the hidden skill although their question already has a real skill (earlier manual classifying). */
async function strandedAttempts(repo: Repo, hiddenIds: string[], questionIds?: string[]): Promise<{ questionId: string; skillId: string }[]> {
  const where: Record<string, unknown> = { skillId: { in: hiddenIds } };
  if (questionIds) where.questionId = { in: questionIds };
  const qids = [...new Set((await repo.findMany("QuestionAttempt", where, { select: ["questionId"] })).map((a) => s(a.questionId)))];
  const out: { questionId: string; skillId: string }[] = [];
  for (let i = 0; i < qids.length; i += 500) {
    for (const q of await repo.findMany("Question", { id: { in: qids.slice(i, i + 500) } }, { select: ["id", "skillId"] })) if (!hiddenIds.includes(s(q.skillId))) out.push({ questionId: s(q.id), skillId: s(q.skillId) });
  }
  return out;
}

/**
 * Applies the remap: questions re-tagged, their answers moved, mastery recomputed for every affected student × skill.
 * Idempotent; never deletes a question. Derived rows of the hidden skill (mastery / ability) are removed only for a
 * student left with no answer on it.
 */
export async function applyRemap(repo: Repo, schoolId: string, opts: { actorId?: string | null; questionIds?: string[]; now?: Date; /** UI reorg Phase 1: apply these decisions (already checked) instead of planning again */ plan?: RemapPlan } = {}): Promise<RemapResult> {
  const now = opts.now ?? new Date();
  const plan = opts.plan ?? await planRemap(repo, schoolId, { questionIds: opts.questionIds });
  const sk = await schoolSkills(repo, schoolId);
  const hiddenIds = sk.hidden.map((k) => s(k.id));
  const byVia: Record<string, number> = {};
  const moves: { questionId: string; from: string; to: string }[] = [];
  const stdOf = new Map<string, string>();
  for (const it of plan.items) {
    if (!it.toSkillId) continue;
    if (!stdOf.has(it.toSkillId)) stdOf.set(it.toSkillId, s((await repo.findMany("SkillStandard", { skillId: it.toSkillId }, { select: ["standardId"], take: 1 }))[0]?.standardId));
    const q = await repo.findUnique("Question", { id: it.questionId });
    if (!q || !hiddenIds.includes(s(q.skillId))) continue;
    const std = stdOf.get(it.toSkillId);
    await repo.updateMany("Question", { id: it.questionId }, { skillId: it.toSkillId, ...(q.standardId || !std ? {} : { standardId: std }), updatedAt: now });
    await repo.create("AuditLog", { actorId: opts.actorId ?? null, action: "question.remap", entityType: "Question", entityId: it.questionId, before: { skillId: it.fromSkillId }, after: { skillId: it.toSkillId, skill: it.toSkill, via: it.via, detail: it.detail, place: it.place }, createdAt: now });
    byVia[it.via!] = (byVia[it.via!] ?? 0) + 1;
    moves.push({ questionId: it.questionId, from: it.fromSkillId, to: it.toSkillId });
  }
  // answers: those of the re-tagged questions, and any answer stranded on the hidden skill
  for (const st of await strandedAttempts(repo, hiddenIds, opts.questionIds)) if (!moves.some((m) => m.questionId === st.questionId)) moves.push({ questionId: st.questionId, from: "", to: st.skillId });
  const pairs = new Set<string>();
  let attempts = 0;
  const byTarget = new Map<string, string[]>();
  for (const m of moves) { const l = byTarget.get(m.to) ?? []; l.push(m.questionId); byTarget.set(m.to, l); }
  for (const [to, qids] of byTarget) {
    for (let i = 0; i < qids.length; i += 300) {
      const part = qids.slice(i, i + 300);
      const rows = await repo.findMany("QuestionAttempt", { questionId: { in: part }, skillId: { in: hiddenIds } }, { select: ["studentId", "skillId"] });
      if (!rows.length) continue;
      for (const r of rows) { pairs.add(`${s(r.studentId)}|${to}`); pairs.add(`${s(r.studentId)}|${s(r.skillId)}`); }
      attempts += await repo.updateMany("QuestionAttempt", { questionId: { in: part }, skillId: { in: hiddenIds } }, { skillId: to });
    }
  }
  let recomputed = 0;
  for (const p of pairs) {
    const [studentId, skillId] = p.split("|");
    if (await recomputeSkill(repo, studentId, skillId, now)) recomputed++;
  }
  if (moves.length || attempts) {
    await repo.create("AuditLog", { actorId: opts.actorId ?? null, action: "skills.remap", entityType: "School", entityId: schoolId, before: null, after: { questions: Object.values(byVia).reduce((a, b) => a + b, 0), attempts, recomputed, left: plan.left, byVia }, createdAt: now });
  }
  return { questions: Object.values(byVia).reduce((a, b) => a + b, 0), attempts, recomputed, left: plan.left, byVia };
}

/**
 * One student × skill recomputed from ALL saved answers + external evidence through the engine (the same steps as
 * recordSkillEvidence). Returns false when nothing is left (the derived rows are then removed).
 */
export async function recomputeSkill(repo: Repo, studentId: string, skillId: string, now = new Date()): Promise<boolean> {
  const [skill, st] = await Promise.all([repo.findUnique("Skill", { id: skillId }), repo.findUnique("Student", { id: studentId })]);
  if (!skill || !st) return false;
  const [all, evid] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId, skillId }, { select: ["isCorrect", "createdAt"] }),
    repo.count("SkillEvidence", { studentId, skillId }),
  ]);
  if (!all.length && !evid) {
    await repo.deleteMany("StudentSkillMastery", { studentId, skillId });
    await repo.deleteMany("StudentAbility", { studentId, scope: `SKILL:${skillId}` });
    return false;
  }
  const cfg = await skillEngineConfig(repo, st.schoolId ? s(st.schoolId) : null);
  const { loadSkillItems, loadQuestionItems } = await import("../practice/items");
  const byId = new Map((await loadSkillItems(repo, skillId)).map((x) => [x.questionId, x]));
  const history = await skillHistoryWithEvidence(repo, studentId, skillId, byId);
  const missing = history.filter((h) => !byId.has(h.itemId) && !h.itemId.startsWith("ext:")).map((h) => h.itemId);
  if (missing.length) {
    // items not published any more still carry their answers' facts; their IRT a/c come from the item when loadable
    for (const it of await loadQuestionItems(repo, [...new Set(missing)])) byId.set(it.questionId, it);
    history.splice(0, history.length, ...(await skillHistoryWithEvidence(repo, studentId, skillId, byId)));
  }
  const dom = await repo.findUnique("StudentAbility", { studentId, scope: `DOMAIN:${s(skill.domain)}` });
  const prior = { mean: dom ? Number(dom.theta) : cfg.adaptive.priorMean, sd: cfg.adaptive.priorSD };
  const est = estimateAbilityEAP(history.map((r) => toWeighted(r, cfg.adaptive)), { priorMean: prior.mean, priorSD: prior.sd, thetaMin: cfg.adaptive.thetaMin, thetaMax: cfg.adaptive.thetaMax, model: cfg.adaptive.model });
  const mst = computeMastery(history, est.theta, cfg.mastery, cfg.adaptive, now, est.se);
  const last = all.reduce((m, a) => Math.max(m, t(a.createdAt)), 0);
  const prev = await repo.findUnique("StudentSkillMastery", { studentId, skillId });
  await repo.upsert("StudentAbility", { studentId, scope: `SKILL:${skillId}` }, { skillId, theta: est.theta, thetaSE: est.se, responses: history.length }, { theta: est.theta, thetaSE: est.se, responses: history.length });
  const data = {
    score: mst.score, band: mst.band, attempts: all.length, correct: all.filter((a) => a.isCorrect).length, maxLevelCorrect: mst.components.maxLevelCorrect,
    isMastered: mst.isMastered, masteredAt: mst.isMastered ? (prev?.masteredAt ?? now) : null, lastPracticedAt: last ? new Date(last) : (prev?.lastPracticedAt ?? null),
    components: { ...mst.components, recomputed: "skills.remap" },
  };
  if (prev) await repo.updateMany("StudentSkillMastery", { studentId, skillId }, data);
  else await repo.create("StudentSkillMastery", { studentId, skillId, ...data });
  return true;
}

/**
 * After an import or an edit: new map questions without a skill get their real one at once — UI reorg Phase 1: through
 * the same link pass as the bank (deterministic rules first; an unsure decision is listed for review, never applied).
 */
export async function remapNewQuestions(repo: Repo, schoolId: string, questionIds: string[], actorId: string | null, now = new Date()): Promise<number> {
  if (!questionIds.length) return 0;
  const { linkNewQuestions } = await import("../questions/link-bank");
  return linkNewQuestions(repo, schoolId, questionIds, actorId, now);
}

/** Every school with hidden-skill questions (the script runs them all). */
export async function schoolsWithUnclassified(repo: Repo): Promise<string[]> {
  const hidden = (await repo.findMany("Skill", { code: { contains: "curriculum-map-unclassified" } }, { select: ["id", "code", "curriculumId"] })).filter((k) => isHiddenSkill(k.code));
  if (!hidden.length) return [];
  const curs = await repo.findMany("Curriculum", { id: { in: [...new Set(hidden.map((k) => s(k.curriculumId)))] } }, { select: ["gradeId"] });
  const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => s(c.gradeId)))] } }, { select: ["schoolId"] }) : [];
  return [...new Set(grades.map((g) => s(g.schoolId)))];
}
