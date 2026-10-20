/**
 * 🔁 Duplicate-answer scanner (Question quality): finds a multiple-choice / dropdown / multi-select question whose
 * options repeat the same words under two different letters (a copy-paste slip when the question was written).
 * The grader always goes by the LETTER the student picked, never by the words — so when only one of two
 * identical-reading options is marked the correct answer, picking the other one is scored wrong even though its
 * text is identical to the "correct answer" shown right after it. This is exactly the very confusing report a
 * parent or student gives as "I picked the right answer and it still said wrong, and the correction shown is the
 * same answer I picked" — and it needs no student-answer data to find: the bank's own text says so.
 * School-scoped through skill → curriculum → grade, same as question-data.ts.
 */
import { assertCan, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
/** case / spacing / trailing-punctuation insensitive: "Paris." and "paris" read as the same answer */
const norm = (t: string) => t.trim().toLowerCase().replace(/[.,!?;:"'’`“”]+$/g, "").replace(/\s+/g, " ");

export interface DupOptionGroup { labels: string[]; text: string; mixedCorrectness: boolean }
export interface DupOptionQuestion { questionId: string; stem: string; skill: string; grade: number; groups: DupOptionGroup[]; risky: boolean }

const MAX_QUESTIONS = 4000;

/**
 * Scans every published MULTIPLE_CHOICE / DROPDOWN / MULTI_SELECT question in the school's curriculum for two or
 * more options whose text reads the same. `risky` questions are the dangerous kind: among the matching options,
 * one is marked correct and another is not — a student choosing the "wrong-lettered" twin of the right answer is
 * marked wrong while seeing the identical words as the "correct answer" afterward.
 */
export async function duplicateOptionQuestions(repo: Repo, actor: Actor): Promise<{ rows: DupOptionQuestion[]; checked: number }> {
  assertCan(actor, "questions:read");
  const schoolId = s(actor.schoolId);
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  if (!grades.length) return { rows: [], checked: 0 };
  const curs = await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] });
  if (!curs.length) return { rows: [], checked: 0 };
  const skills = await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) } }, { select: ["id", "name", "curriculumId"] });
  if (!skills.length) return { rows: [], checked: 0 };
  const types = await repo.findMany("QuestionType", { code: { in: ["MULTIPLE_CHOICE", "DROPDOWN", "MULTI_SELECT"] } }, { select: ["id", "code"] });
  if (!types.length) return { rows: [], checked: 0 };
  const skillIds = skills.map((k) => k.id);
  const qs = await repo.findMany(
    "Question",
    { skillId: { in: skillIds }, typeId: { in: types.map((t) => t.id) }, status: "PUBLISHED", deletedAt: null },
    { select: ["id", "stem", "skillId", "typeId"], take: MAX_QUESTIONS },
  );
  if (!qs.length) return { rows: [], checked: 0 };
  const ids = qs.map((q) => q.id);
  const opts: { questionId: unknown; label: unknown; text: unknown; isCorrect: unknown }[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await repo.findMany("QuestionOption", { questionId: { in: ids.slice(i, i + 1000) } }, { select: ["questionId", "label", "text", "isCorrect"] });
    for (const r of rows) opts.push({ questionId: r.questionId, label: r.label, text: r.text, isCorrect: r.isCorrect });
  }
  const optsOf = new Map<string, { label: string; text: string; correct: boolean }[]>();
  for (const o of opts) {
    const k = s(o.questionId);
    const row = { label: s(o.label), text: s(o.text), correct: Boolean(o.isCorrect) };
    const l = optsOf.get(k);
    if (l) l.push(row); else optsOf.set(k, [row]);
  }
  const skillOf = new Map(skills.map((k) => [k.id, k]));
  const gradeOf = new Map(curs.map((c) => [c.id, Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const rows: DupOptionQuestion[] = [];
  let checked = 0;
  for (const q of qs) {
    const options = optsOf.get(s(q.id));
    if (!options || options.length < 2) continue;
    checked++;
    const byText = new Map<string, { label: string; correct: boolean }[]>();
    for (const o of options) {
      const k = norm(o.text);
      if (!k) continue;
      const l = byText.get(k);
      if (l) l.push(o); else byText.set(k, [o]);
    }
    const groups: DupOptionGroup[] = [...byText.entries()]
      .filter(([, v]) => v.length >= 2)
      .map(([text, v]) => ({ labels: v.map((x) => x.label), text, mixedCorrectness: new Set(v.map((x) => x.correct)).size > 1 }));
    if (!groups.length) continue;
    const skill = skillOf.get(s(q.skillId));
    rows.push({
      questionId: s(q.id),
      stem: s(q.stem),
      skill: s(skill?.name ?? ""),
      grade: Number(gradeOf.get(s(skill?.curriculumId)) ?? 0),
      groups,
      risky: groups.some((g) => g.mixedCorrectness),
    });
  }
  // the dangerous ones (a wrong-lettered twin of the right answer) come first, then lower grades first
  rows.sort((a, b) => Number(b.risky) - Number(a.risky) || a.grade - b.grade);
  return { rows, checked };
}
