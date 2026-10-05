/**
 * Seeds the original question bank. Runs after seedCurriculum. Idempotent:
 * questions/passages are keyed by externalRef and never overwritten (a teacher
 * may already have edited or approved them). New items enter as UNDER_REVIEW.
 */
import { answerValues, contentPayload, QUESTION_TYPES, validateItem, type BankItem, type BankPassage } from "../../imports/questions/validate";
import { analyzeText, platformReadingLevelFor } from "../../reading/prl";
import type { Repo } from "./repo";

const TYPE_NAMES: Record<string, string> = {
  MULTIPLE_CHOICE: "Multiple choice", MULTI_SELECT: "Multiple select", TRUE_FALSE: "True / false", DROPDOWN: "Dropdown",
  FILL_BLANK: "Fill in the blank", SENTENCE_ORDER: "Sentence ordering", WORD_ORDER: "Word ordering",
  ERROR_CORRECTION: "Error correction", MATCHING: "Matching", SHORT_ANSWER: "Short answer",
};

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

  const issues = input.bank.items.flatMap((it) =>
    validateItem(it, { skillKeys: new Set(skillId.keys()), standards: new Set(standardId.keys()), passages: new Set(input.bank.passages.map((p) => p.id)) }),
  );
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
    for (const it of input.bank.items) {
      if (await tx.findUnique("Question", { skillId: skillId.get(it.skillKey)!, externalRef: it.ref })) {
        rep.skipped++;
        continue;
      }
      const q = await tx.create("Question", {
        externalRef: it.ref,
        skillId: skillId.get(it.skillKey)!,
        standardId: standardId.get(it.standard) ?? null,
        passageId: it.passage ? passageId.get(it.passage) ?? null : null,
        typeId: typeId.get(it.type)!,
        stem: it.stem,
        content: contentPayload(it),
        difficultyLevel: it.level,
        irtA: it.irt.a, irtB: it.irt.b, irtC: it.irt.c,
        estimatedSeconds: it.estimatedSeconds,
        tags: { family: it.family, grade: it.grade },
        status: "UNDER_REVIEW",
        origin: "TEACHER_AUTHORED",
      });
      for (const [i, o] of (it.options ?? []).entries())
        await tx.create("QuestionOption", { questionId: q.id, label: o.label, text: o.text, isCorrect: o.correct, rationale: o.rationale, order: i });
      for (const [i, v] of answerValues(it).entries()) await tx.create("QuestionAnswer", { questionId: q.id, value: v as object, isPrimary: i === 0 });
      await tx.create("QuestionExplanation", { questionId: q.id, kind: "WHY_CORRECT", body: [{ type: "text", text: it.explanation.whyCorrect }], order: 0 });
      await tx.create("QuestionExplanation", { questionId: q.id, kind: "TIP", body: [{ type: "text", text: it.explanation.tip }], order: 1 });
      rep.created++;
    }
  });
  return rep;
}
