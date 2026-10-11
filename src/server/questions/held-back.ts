/**
 * ⏸ Questions held out of adaptive practice by an open data alert (KEY_SUSPECT or NEGATIVE_DISCRIMINATION,
 * src/server/questions/reclassify.ts) until an admin reviews them. Read by the adaptive pool's hold-back
 * (src/server/practice/items.ts), which still keeps them when the skill has fewer than 4 other questions.
 * Kept tiny on purpose: the practice module imports it.
 */
import type { Repo } from "../seeding/repo";

export async function heldBackQuestionIds(repo: Repo, questionIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < questionIds.length; i += 1000) {
    const rows = await repo.findMany("QuestionAlert", { questionId: { in: questionIds.slice(i, i + 1000) }, status: "OPEN", heldBack: true }, { select: ["questionId"] });
    for (const r of rows) out.add(String(r.questionId));
  }
  return out;
}
