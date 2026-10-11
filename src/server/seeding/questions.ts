/**
 * Seeds the original question bank. Runs after seedCurriculum. Idempotent:
 * questions/passages are keyed by externalRef and never overwritten (a teacher
 * may already have edited or approved them). New items enter as UNDER_REVIEW.
 */
import { answerValues, contentPayload, duplicateRefs, QUESTION_TYPES, validateItem, type BankItem, type BankPassage } from "../../imports/questions/validate";
import { analyzeText, platformReadingLevelFor } from "../../reading/prl";
import type { Repo, Row } from "./repo";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const newId = () => "c" + Date.now().toString(36) + randomBytes(8).toString("hex");

const TYPE_NAMES: Record<string, string> = {
  MULTIPLE_CHOICE: "Multiple choice", MULTI_SELECT: "Multiple select", TRUE_FALSE: "True / false", DROPDOWN: "Dropdown",
  FILL_BLANK: "Fill in the blank", SENTENCE_ORDER: "Sentence ordering", WORD_ORDER: "Word ordering",
  ERROR_CORRECTION: "Error correction", MATCHING: "Matching", SHORT_ANSWER: "Short answer",
  TWO_PART: "Two-part (Part A / Part B)", GRID: "Table match (grid)", HOT_TEXT: "Hot text (select sentences)",
  DICTATION: "Dictation (hear and spell)",
  SENTENCE_COMBINE: "Sentence combining",
};

/** Optional original samples of the newer item types (data/questions/new-types-samples.json). */
export const NEW_TYPE_SAMPLES_FILE = "data/questions/new-types-samples.json";

/** The bank plus the new-type samples, when that file is present (refs/passages already in the bank are not repeated). */
export function withNewTypeSamples(root: string, bank: { passages: BankPassage[]; items: BankItem[] }): { passages: BankPassage[]; items: BankItem[] } {
  return withExtraItems(root, NEW_TYPE_SAMPLES_FILE, bank);
}

/** Optional original word-study items, Grades 4–6 (data/questions/word-study-items.json): dictation, spelling rules, syllables, affixes. */
export const WORD_STUDY_ITEMS_FILE = "data/questions/word-study-items.json";

/** The bank plus the word-study items, when that file is present (refs already in the bank are not repeated). */
export function withWordStudyItems(root: string, bank: { passages: BankPassage[]; items: BankItem[] }): { passages: BankPassage[]; items: BankItem[] } {
  return withExtraItems(root, WORD_STUDY_ITEMS_FILE, bank);
}

/** Optional original sentence-combining items, Grades 4–6 (data/questions/sentence-combine-items.json). */
export const SENTENCE_COMBINE_ITEMS_FILE = "data/questions/sentence-combine-items.json";

/** The bank plus the sentence-combining items, when that file is present (refs already in the bank are not repeated). */
export function withSentenceCombineItems(root: string, bank: { passages: BankPassage[]; items: BankItem[] }): { passages: BankPassage[]; items: BankItem[] } {
  return withExtraItems(root, SENTENCE_COMBINE_ITEMS_FILE, bank);
}

function withExtraItems(root: string, rel: string, bank: { passages: BankPassage[]; items: BankItem[] }): { passages: BankPassage[]; items: BankItem[] } {
  const file = join(root, rel);
  if (!existsSync(file)) return bank;
  const extra = JSON.parse(readFileSync(file, "utf8")) as { passages?: BankPassage[]; items?: BankItem[] };
  const refs = new Set(bank.items.map((i) => i.ref)), pids = new Set(bank.passages.map((p) => p.id));
  return { passages: [...bank.passages, ...(extra.passages ?? []).filter((p) => !pids.has(p.id))], items: [...bank.items, ...(extra.items ?? []).filter((i) => !refs.has(i.ref))] };
}

export interface QuestionReport {
  passages: number;
  created: number;
  skipped: number;
}

export async function seedQuestions(repo: Repo, input: { schoolCode: string; bank: { passages: BankPassage[]; items: BankItem[] } }): Promise<QuestionReport> {
  const school = await repo.findUnique("School", { code: input.schoolCode });
  if (!school) throw new Error(`School ${input.schoolCode} not found — run the curriculum seed first.`);
  const grades = await repo.findMany("Grade", { schoolId: school.id });
  const curricula = await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } });
  const skills = await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } });
  const skillId = new Map(skills.map((s) => [String(s.code), String(s.id)]));
  const standards = await repo.findMany("Standard", { framework: "CCSS_ELA" });
  const standardId = new Map(standards.map((s) => [String(s.code), String(s.id)]));

  const ctx = { skillKeys: new Set(skillId.keys()), standards: new Set(standardId.keys()), passages: new Set(input.bank.passages.map((p) => p.id)) };
  const issues = [...input.bank.items.flatMap((it) => validateItem(it, ctx)), ...duplicateRefs(input.bank.items)];
  if (issues.length) throw new Error("Bank validation failed:\n" + issues.map((i) => `${i.ref}: ${i.message}`).join("\n"));

  const rep: QuestionReport = { passages: 0, created: 0, skipped: 0 };
  await repo.transaction(async (tx) => {
    const typeId = new Map<string, string>();
    for (const code of QUESTION_TYPES) {
      const row = await tx.upsert("QuestionType", { code }, { name: TYPE_NAMES[code], isAutoScored: code !== "SHORT_ANSWER" });
      typeId.set(code, row.id!);
    }
    const passageId = new Map<string, string>();
    for (const p of input.bank.passages) {
      const st = analyzeText(p.text);
      const row = await tx.upsert("ReadingPassage", { externalRef: p.id }, {
        title: p.title, body: p.text, genre: p.genre, gradeLevel: p.grade, gradeBand: String(p.grade),
        wordCount: st.wordCount, sentenceCount: st.sentenceCount, avgSentenceLength: st.avgSentenceLength, avgWordLength: st.avgWordLength,
        platformReadingLevel: platformReadingLevelFor(p.text, p.genre), status: "UNDER_REVIEW", origin: "TEACHER_AUTHORED",
      });
      passageId.set(p.id, row.id!);
      rep.passages++;
    }
    // batched: one lookup for what exists, then inserts in chunks (a few dozen queries instead of thousands)
    const skillIds = [...new Set(input.bank.items.map((it) => skillId.get(it.skillKey)!))];
    const existing = new Set((await tx.findMany("Question", { skillId: { in: skillIds } }, { select: ["skillId", "externalRef"] })).map((q) => `${q.skillId}|${q.externalRef}`));
    const questions: Row[] = [], options: Row[] = [], answers: Row[] = [], explanations: Row[] = [];
    for (const it of input.bank.items) {
      const sid = skillId.get(it.skillKey)!;
      if (existing.has(`${sid}|${it.ref}`)) { rep.skipped++; continue; }
      existing.add(`${sid}|${it.ref}`);
      const id = newId();
      questions.push({
        id, externalRef: it.ref, skillId: sid, standardId: standardId.get(it.standard) ?? null, passageId: it.passage ? passageId.get(it.passage) ?? null : null,
        typeId: typeId.get(it.type)!, stem: it.stem, content: contentPayload(it), difficultyLevel: it.level, irtA: it.irt.a, irtB: it.irt.b, irtC: it.irt.c,
        estimatedSeconds: it.estimatedSeconds, tags: { family: it.family, grade: it.grade }, status: "UNDER_REVIEW", origin: "TEACHER_AUTHORED",
      });
      for (const [i, o] of (it.options ?? []).entries()) options.push({ id: newId(), questionId: id, label: o.label, text: o.text, isCorrect: o.correct, rationale: o.rationale, order: i, ...(o.misconception ? { misconception: o.misconception, misconceptionSource: "AUTHOR" } : {}) });
      for (const [i, v] of answerValues(it).entries()) answers.push({ id: newId(), questionId: id, value: v as object, isPrimary: i === 0 });
      explanations.push({ id: newId(), questionId: id, kind: "WHY_CORRECT", body: [{ type: "text", text: it.explanation.whyCorrect }], order: 0 });
      explanations.push({ id: newId(), questionId: id, kind: "TIP", body: [{ type: "text", text: it.explanation.tip }], order: 1 });
      rep.created++;
    }
    for (const [model, rows] of [["Question", questions], ["QuestionOption", options], ["QuestionAnswer", answers], ["QuestionExplanation", explanations]] as const)
      for (let i = 0; i < rows.length; i += 200) await tx.createMany(model, rows.slice(i, i + 200));
  });
  return rep;
}
