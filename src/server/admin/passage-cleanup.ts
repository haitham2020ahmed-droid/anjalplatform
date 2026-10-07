/**
 * Removes questions that need a reading passage but have none (“According to the passage…” with no passage).
 *
 *  A question is flagged when ALL hold:
 *   - it has no passage (or its passage text is empty);
 *   - its wording refers to a text (lib/passage-detect: “according to the passage”, “in paragraph 3”,
 *     “what does the author mean”, “which detail from the text”, “based on the reading”…);
 *   - its skill is not a grammar, language-convention or spelling/word-study skill (those are never touched).
 *
 *  What happens to a flagged question:
 *   - never answered and not in a teacher's assignment → DELETED (backed up first, restorable);
 *   - answered by students before → ARCHIVED (hidden from students; their answer history is kept);
 *   - part of a set a teacher assigned → KEPT and listed for review (deleting it would break the assignment).
 *  Grades, units, skills, standards, curriculum, users, teachers and students are never changed.
 */
import type { Repo, Row } from "../seeding/repo";
import { passageReference } from "@/lib/passage-detect";
import { purgeQuestionRows } from "./question-delete";
import type { QuestionBackup } from "./question-cleanup";

const s = (v: unknown) => String(v ?? "");
// grammar, language conventions, spelling/punctuation and phonics are never touched (by domain or category)
const PROTECTED_DOMAINS = new Set(["GRAMMAR", "LANGUAGE", "WORD_STUDY"]);
const PROTECTED_CATEGORIES = new Set(["GRAMMAR", "MECHANICS", "PHONICS_WORD_STUDY", "WORD_STUDY"]);
export const UNCHANGED_TABLES = ["Grade", "Unit", "Lesson", "Skill", "SkillFamily", "Standard", "SkillStandard", "UnitSkill", "Curriculum", "User", "Teacher", "Student", "Class", "ClassMembership", "ReadingPassage"] as const;

export type CleanupAction = "DELETE" | "ARCHIVE" | "KEEP_IN_ASSIGNMENT";

/** Reading-comprehension skills: answering needs a text to read (theme, central idea, character, inference…). */
const READING_CATEGORIES = new Set(["LITERATURE", "INFORMATIONAL", "COMPREHENSION"]);

/**
 * True when the question carries its own text: a quoted excerpt of 12+ words, or 25+ words after
 * “Read …:” / a colon (e.g. “Read the paragraph: Sam ran to the barn…”). Such questions need no passage.
 */
/**
 * True when a question asks about specific story content (so it cannot be answered without the story):
 * a character's name (“Why did Sam leave?”), a definite person or thing from a story (“the grandmother”,
 * “the boy”, “the main character”), or “he/she/they” with no story to point to (“Why did she go back?”).
 * General concept questions (“a story”, “a text”, “Which sentence…”) are not story content.
 */
const STORY_PEOPLE = /\bthe (?:boy|girl|man|woman|kids|children|grandmother|grandfather|grandma|grandpa|mother|father|mom|dad|sister|brother|family|teacher|character|characters|hero|heroine|king|queen|prince|princess|farmer|fox|wolf|dog|cat|bird|bear|rabbit|mouse|lion|villagers|scientists?|explorers?|students?|class|team|kite|ending|plot|conflict|problem|setting|climax)\b(?!s? (?:is|are) (?:called|a word|the word))/i;
const PRONOUN_EVENT = /\b(?:why|how|what|when|where) (?:did|does|do|was|is|were|has|had|will|would|could|might) (?:he|she|they|him|her|them)\b|\b(?:he|she|they) (?:felt|feels|decided|wanted|learned|realized|said|thinks|thought)\b/i;
const NOT_NAMES = new Set(["I", "English", "Arabic", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "TWO", "THREE", "FIRST", "BEST", "NOT", "MOST", "LEAST", "WEAKEST", "STRONGEST", "TRUE", "FALSE", "Earth", "God", "Mr", "Mrs", "Ms", "Dr",
  "Which", "What", "Why", "How", "When", "Where", "Who", "Whom", "Whose", "Read", "Choose", "Select", "Match", "Complete", "Pick", "Find", "Use", "The", "This", "That", "These", "Those", "Then", "Next", "Finally", "First", "Last", "Also", "But", "And", "Our", "Your", "Its", "Their", "His", "Her", "One", "Two", "Three", "Both", "Each", "All", "Some", "Many", "Most"]);
// “the author/speaker/narrator…” (a specific text's author; concept questions say “authors”, “a narrator”)
const DEFINITE_AUTHOR = /\bthe (?:author|authors|poet|writer|narrator|speaker)(?:'s|’s)?\b/i;
// a specific part of a specific text: “the last paragraph”, “which heading”, “the second stanza”
const TEXT_PART = /\bthe (?:first|second|third|fourth|fifth|last|final|next|opening|closing|middle) (?:paragraph|stanza|sentence|line|lines|section|part|scene|chapter|event|events)\b|\bwhich (?:heading|subheading|caption|section|paragraph|stanza|sidebar|diagram|photo|map|chart|timeline)\b|\b(?:the|this) (?:heading|subheading|caption|sidebar|diagram|timeline|chart|photo|illustration)s?\b/i;
// a specific text: “the article”, “the story”, “the two accounts”
const THE_TEXT = /\b(?:the|this) (?:article|story|passage|text|poem|selection|play|speech|letter|essay|account|book|report|biography|autobiography|fable|myth|legend|folktale|excerpt)\b|\bthe (?:two|both) (?:accounts|texts|stories|poems|articles|passages|selections)\b/i;
// a quoted title: short, no end punctuation, mostly Capitalised words (“The Kite Repair”, “Night Rain”)
function quotesATitle(stem: string): boolean {
  for (const m of String(stem).matchAll(/["“]([^"”]{2,60})["”]/g)) {
    const q = m[1].trim().replace(/[,]$/, "");
    if (/[.?!]$/.test(q)) continue;                                   // a quoted sentence, not a title
    const words = q.split(/\s+/);
    if (words.length > 8) continue;
    const caps = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
    if (words.length >= 1 && caps >= Math.ceil(words.length * 0.6) && /^[A-Z]/.test(words[0])) return true;
  }
  return false;
}

export function asksAboutStoryContent(stem: string): boolean {
  if (quotesATitle(stem)) return true;
  const t = String(stem ?? "").replace(/["“][^"”]*["”]/g, " ");      // titles and quoted examples are not names
  const isQuestion = /\?/.test(t) || /^\s*(?:which|what|why|how|who|where|when|choose|select|put|match)\b/i.test(t);
  if (STORY_PEOPLE.test(t) || PRONOUN_EVENT.test(t) || TEXT_PART.test(t)) return true;
  // “the author / the article / the text…” in an actual question (a general statement such as
  // “A good summary includes your own opinion about the text.” is a concept, answerable without a text)
  if (isQuestion && (DEFINITE_AUTHOR.test(t) || THE_TEXT.test(t))) return true;
  // a capitalised name in the middle of a sentence (not the first word of a sentence)
  const sentences = t.split(/[.?!:;]\s+/);
  for (const sen of sentences) {
    const words = sen.trim().split(/\s+/).slice(1);
    for (const w of words) { const c = w.replace(/[^A-Za-z']/g, "").replace(/'s$/, ""); if (/^[A-Z][a-z]{2,}$/.test(c) && !NOT_NAMES.has(c)) return true; }
  }
  return false;
}

export function embedsOwnText(stem: string): boolean {
  const t = String(stem ?? "");
  const words = (x: string) => x.trim().split(/\s+/).filter(Boolean).length;
  for (const m of t.matchAll(/["“”'‘’]([^"“”]{20,})["“”]/g)) if (words(m[1]) >= 12) return true;
  const colon = t.indexOf(":");
  if (colon >= 0 && words(t.slice(colon + 1)) >= 25) return true;
  return words(t) >= 45;
}
export interface FlaggedQuestion {
  id: string; text: string; skill: string; grade: number | null; standard: string; status: string;
  reason: string; action: CleanupAction;
}

/** Finds the flagged questions and what will happen to each (changes nothing). */
export async function findMissingPassageQuestions(repo: Repo): Promise<FlaggedQuestion[]> {
  const qs = await repo.findMany("Question", { deletedAt: null }, { select: ["id", "stem", "skillId", "passageId", "status", "standardId", "imageId"] });
  const passageIds = [...new Set(qs.map((q) => q.passageId).filter(Boolean).map(s))];
  const passages = passageIds.length ? await repo.findMany("ReadingPassage", { id: { in: passageIds } }, { select: ["id", "body"] }) : [];
  const hasText = new Set(passages.filter((p) => s(p.body).trim()).map((p) => s(p.id)));
  const noText = qs.filter((q) => !(q.passageId && hasText.has(s(q.passageId))));
  if (!noText.length) return [];
  const allSkills = await repo.findMany("Skill", { id: { in: [...new Set(noText.map((q) => s(q.skillId)))] } }, { select: ["id", "name", "domain", "category", "curriculumId"] });
  const readingSkill = new Set(allSkills.filter((k) => s(k.domain) === "READING" && READING_CATEGORIES.has(s(k.category))).map((k) => s(k.id)));
  // A: the wording refers to a text; B: a reading-comprehension question with no text of its own
  const ruleOf = (q: Row): "A" | "B" | null => (passageReference(s(q.stem)) ? "A" : readingSkill.has(s(q.skillId)) && !embedsOwnText(s(q.stem)) && asksAboutStoryContent(s(q.stem)) ? "B" : null);
  const candidates = noText.filter((q) => ruleOf(q));
  if (!candidates.length) return [];
  const skillIds = [...new Set(candidates.map((q) => s(q.skillId)))];
  const skills = allSkills.filter((k) => skillIds.includes(s(k.id)));
  const [curs, links] = await Promise.all([
    repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }),
    repo.findMany("SkillStandard", { skillId: { in: skillIds } }),
  ]);
  const stdIds = [...new Set([...links.map((l) => s(l.standardId)), ...candidates.map((q) => q.standardId).filter(Boolean).map(s)])];
  const [grades, stds] = await Promise.all([
    repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }),
    stdIds.length ? repo.findMany("Standard", { id: { in: stdIds } }, { select: ["id", "code"] }) : Promise.resolve([] as Row[]),
  ]);
  const codeOf = (id: unknown) => s(stds.find((x) => x.id === id)?.code).replace(/^CCSS\.ELA-LITERACY\./, "");
  const skillOf = new Map(skills.map((k) => [s(k.id), k]));
  const levelOfCur = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? NaN)]));
  const primaryStd = new Map<string, string>();
  for (const l of links.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))) if (!primaryStd.has(s(l.skillId))) primaryStd.set(s(l.skillId), s(stds.find((x) => x.id === l.standardId)?.code).replace(/^CCSS\.ELA-LITERACY\./, ""));
  const eligible = candidates.filter((q) => {
    const k = skillOf.get(s(q.skillId));
    return !PROTECTED_DOMAINS.has(s(k?.domain)) && !PROTECTED_CATEGORIES.has(s(k?.category));
  });
  if (!eligible.length) return [];
  const ids = eligible.map((q) => s(q.id));
  const [answered, inSets] = await Promise.all([
    repo.findMany("QuestionAttempt", { questionId: { in: ids } }, { select: ["questionId"] }),
    repo.findMany("AssessmentQuestion", { questionId: { in: ids } }, { select: ["questionId", "assessmentId"] }),
  ]);
  // a set counts as in use while an assignment (not deleted) points to it
  const setIds = [...new Set(inSets.map((x) => s(x.assessmentId)))];
  const liveSets = setIds.length ? new Set((await repo.findMany("Assignment", { assessmentId: { in: setIds }, deletedAt: null }, { select: ["assessmentId"] })).map((a) => s(a.assessmentId))) : new Set<string>();
  const inUse = new Set(inSets.filter((x) => liveSets.has(s(x.assessmentId))).map((x) => s(x.questionId)));
  const wasAnswered = new Set(answered.map((a) => s(a.questionId)));
  return eligible.map((q) => {
    const k = skillOf.get(s(q.skillId));
    const lvl = k ? levelOfCur.get(s(k.curriculumId)) : undefined;
    const action: CleanupAction = inUse.has(s(q.id)) ? "KEEP_IN_ASSIGNMENT" : wasAnswered.has(s(q.id)) ? "ARCHIVE" : "DELETE";
    return {
      id: s(q.id), text: s(q.stem), skill: s(k?.name ?? "—"), grade: lvl !== undefined && !Number.isNaN(lvl) ? lvl : null,
      standard: (q.standardId ? codeOf(q.standardId) : "") || primaryStd.get(s(q.skillId)) || "", status: s(q.status),
      reason: ruleOf(q) === "A"
        ? `No passage/text attached, but the question refers to one (“${passageReference(s(q.stem))}”)`
        : `Reading question about a story (${s(k?.name)}) with no passage/text to read`, action,
    };
  }).sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0) || a.skill.localeCompare(b.skill) || a.text.localeCompare(b.text));
}

/** Backup of exactly the questions that will be deleted (same format as the bank backup: restorable). */
export async function backupSubset(repo: Repo, ids: string[], now = new Date()): Promise<QuestionBackup> {
  const tables: Record<string, Row[]> = { Question: [], QuestionOption: [], QuestionAnswer: [], QuestionExplanation: [], QuestionStats: [], AssessmentQuestion: [], QuestionImage: [], QuestionMapLink: [], ReadMasterQuestion: [], QuestionUse: [] };
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const qs = await repo.findMany("Question", { id: { in: part } });
    tables.Question.push(...qs);
    for (const t of ["QuestionOption", "QuestionAnswer", "QuestionExplanation", "QuestionStats", "AssessmentQuestion", "QuestionMapLink", "ReadMasterQuestion", "QuestionUse"]) tables[t].push(...(await repo.findMany(t, { questionId: { in: part } })));
    const imageIds = [...new Set(qs.map((q) => q.imageId).filter(Boolean).map(s))];
    if (imageIds.length) tables.QuestionImage.push(...(await repo.findMany("QuestionImage", { id: { in: imageIds } })).map((r) => ({ ...r, bytes: Buffer.from(r.bytes as Uint8Array).toString("base64") })));
  }
  const counts = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length]));
  return { format: "alanjal-question-backup", version: 1, createdAt: now.toISOString(), counts, tables } as QuestionBackup;
}

async function tableCounts(repo: Repo): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(UNCHANGED_TABLES.map(async (t) => { out[t] = await repo.count(t, {}); }));
  return out;
}

export interface IntegrityReport { ok: boolean; problems: string[]; questions: number; unchangedTables: boolean }

/** No row points to a question that no longer exists; protected tables unchanged; nothing flagged left active. */
export async function verifyIntegrity(repo: Repo, before?: Record<string, number>): Promise<IntegrityReport> {
  const problems: string[] = [];
  const live = new Set((await repo.findMany("Question", {}, { select: ["id"] })).map((q) => s(q.id)));
  const check = async (table: string, field: string) => {
    const rows = await repo.findMany(table, { [field]: { not: null } }, { select: [field] });
    const broken = rows.filter((r) => !live.has(s(r[field]))).length;
    if (broken) problems.push(`${table}.${field}: ${broken} row(s) point to a missing question`);
  };
  for (const [t, f] of [["QuestionOption", "questionId"], ["QuestionAnswer", "questionId"], ["QuestionExplanation", "questionId"], ["QuestionStats", "questionId"], ["AssessmentQuestion", "questionId"], ["QuestionAttempt", "questionId"], ["PracticeSession", "currentQuestionId"], ["AdaptiveDecisionLog", "questionId"], ["AdaptiveDecisionLog", "nextQuestionId"]] as const) await check(t, f);
  const imgs = new Set((await repo.findMany("QuestionImage", {}, { select: ["id"] })).map((i) => s(i.id)));
  const brokenImg = (await repo.findMany("Question", { imageId: { not: null } }, { select: ["imageId"] })).filter((q) => !imgs.has(s(q.imageId))).length;
  if (brokenImg) problems.push(`Question.imageId: ${brokenImg} question(s) point to a missing image`);
  let unchangedTables = true;
  if (before) {
    const after = await tableCounts(repo);
    for (const t of UNCHANGED_TABLES) if (after[t] !== before[t]) { unchangedTables = false; problems.push(`${t} changed: ${before[t]} → ${after[t]}`); }
  }
  const leftActive = (await findMissingPassageQuestions(repo)).filter((f) => f.action !== "KEEP_IN_ASSIGNMENT" && f.status !== "ARCHIVED");
  if (leftActive.length) problems.push(`${leftActive.length} flagged question(s) are still active`);
  return { ok: problems.length === 0, problems, questions: live.size, unchangedTables };
}

export interface PassageCleanupResult { flagged: FlaggedQuestion[]; deleted: number; archived: number; kept: number; remaining: number; integrity: IntegrityReport }

/** Deletes / archives the flagged questions (call backupSubset first). Batched; audited. */
export async function executePassageCleanup(repo: Repo, flagged: FlaggedQuestion[], opts: { actorId?: string | null } = {}, now = new Date()): Promise<PassageCleanupResult> {
  const before = await tableCounts(repo);
  const del = flagged.filter((f) => f.action === "DELETE").map((f) => f.id);
  const arch = flagged.filter((f) => f.action === "ARCHIVE" && f.status !== "ARCHIVED").map((f) => f.id);
  for (let i = 0; i < del.length; i += 200) {
    const part = del.slice(i, i + 200);
    await repo.transaction(async (tx) => purgeQuestionRows(tx, await tx.findMany("Question", { id: { in: part } }, { select: ["id", "imageId"] })));
  }
  for (let i = 0; i < arch.length; i += 200) await repo.updateMany("Question", { id: { in: arch.slice(i, i + 200) } }, { status: "ARCHIVED", updatedAt: now });
  await repo.create("AuditLog", {
    actorId: opts.actorId ?? null, action: "questions.cleanup_missing_passage", entityType: "Question", entityId: null,
    after: { deleted: del.length, archived: arch.length, kept: flagged.filter((f) => f.action === "KEEP_IN_ASSIGNMENT").length, ids: del }, createdAt: now,
  });
  const integrity = await verifyIntegrity(repo, before);
  return { flagged, deleted: del.length, archived: arch.length, kept: flagged.filter((f) => f.action === "KEEP_IN_ASSIGNMENT").length, remaining: integrity.questions, integrity };
}
