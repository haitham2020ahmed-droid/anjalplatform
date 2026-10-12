/**
 * 🏦 Bank questions without a usable level (Update 54 migration): the bank is classified by skill + level only, so
 * a question whose level is missing or out of range (1–7 → Below / On / Above) is listed on Question Check → No level.
 * Curriculum Map questions are left alone (they keep Grade → Unit → Lesson). Read only, bounded.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { mapLinkedQuestionIds } from "./bank-scope";
import { schoolSkillIndex } from "./skill-questions";

const s = (v: unknown) => String(v ?? "");

export async function questionsWithoutLevel(repo: Repo, actor: Actor, limit = 300): Promise<{ id: string; stem: string; skill: string }[]> {
  assertCan(actor, "questions:read");
  const idx = await schoolSkillIndex(repo, s(actor.schoolId));
  const ids = [...idx.ids];
  if (!ids.length) return [];
  const onMap = await mapLinkedQuestionIds(repo);
  const out: { id: string; stem: string; skill: string }[] = [];
  for (let i = 0; i < ids.length && out.length < limit; i += 400) {
    const rows = await repo.findMany("Question", { skillId: { in: ids.slice(i, i + 400) }, deletedAt: null }, { select: ["id", "stem", "skillId", "difficultyLevel"] });
    for (const q of rows) {
      const lv = Number(q.difficultyLevel);
      if (onMap.has(s(q.id)) || (Number.isFinite(lv) && lv >= 1 && lv <= 7)) continue;
      out.push({ id: s(q.id), stem: s(q.stem).replace(/\s+/g, " ").slice(0, 160), skill: idx.skillOf.get(s(q.skillId))?.name ?? "" });
      if (out.length >= limit) break;
    }
  }
  return out;
}
