import type { Repo } from "../../src/server/seeding/repo";

/** Test helper: a skill made for a test gets one published multiple-choice question (a skill with none cannot be assigned). */
export async function giveQuestion(repo: Repo, skillId: string): Promise<string> {
  const mc = String((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
  const now = new Date("2026-01-01T00:00:00Z");
  const q = await repo.create("Question", { skillId, typeId: mc, stem: `Which choice is correct? (${skillId.slice(-6)})`, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", createdAt: now, updatedAt: now });
  for (const [i, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Choice ${o}`, isCorrect: i === 0, order: i });
  return String(q.id);
}
