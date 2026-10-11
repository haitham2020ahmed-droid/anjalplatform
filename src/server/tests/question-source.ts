/**
 * The ONE place Assessments reads a skill's questions from (UI reorg Phase 5), now backed by Phase 1's shared
 * questionsOfSkill (src/server/questions/skill-questions.ts) — the same answer to "which questions belong to skill X?"
 * that the search, the MAP / NAFS sections and the Plans wizard use, so a test can never see a different bank.
 *
 * Kept as a thin adapter with the shape Assessments needs ({ id, level }): published by default, not deleted,
 * auto-marked only (no short answers / hand-marked types), the level from the difficulty (1–3 Below, 4 On, 5–7 Above).
 * Reads are bounded (a page of at most 1000 questions per skill). Never deletes or edits a question.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError } from "../auth/rbac";
import { fromDifficulty } from "../curriculum-map/leveled-run";
import { questionsOfSkill as sharedQuestionsOfSkill, schoolSkillIndex, type SkillQuestionStatus } from "../questions/skill-questions";

export type QLevel = "BELOW" | "ON" | "ABOVE";
export interface SkillQuestion { id: string; level: QLevel }
const s = (v: unknown) => String(v ?? "");
/** Difficulty levels of each practice level (authoring levels are 1–7; 7 is Above, as before). */
const LEVEL_RANGE: Record<QLevel, number[]> = { BELOW: [1, 2, 3], ON: [4], ABOVE: [5, 6, 7] };
const PAGE = 1000;

export async function questionsOfSkill(repo: Repo, schoolId: string, skillId: string, opts: { level?: QLevel; status?: string; take?: number } = {}): Promise<SkillQuestion[]> {
  // a skill of another school (or a deleted one) is refused, as before — the shared function would just return []
  const idx = await schoolSkillIndex(repo, schoolId);
  if (!idx.ids.has(s(skillId))) {
    const skill = await repo.findUnique("Skill", { id: skillId });
    if (!skill || skill.deletedAt) return [];
    throw new ForbiddenError("Skill not found.");
  }
  const rows = await sharedQuestionsOfSkill(repo, schoolId, skillId, {
    status: (opts.status ?? "PUBLISHED") as SkillQuestionStatus,
    level: opts.level ? LEVEL_RANGE[opts.level] : undefined,
    take: PAGE,
  });
  if (!rows.length) return [];
  const types = await repo.findMany("QuestionType", { id: { in: [...new Set(rows.map((q) => q.typeId))] } }, { select: ["id", "code", "isAutoScored"] });
  const manual = new Set(types.filter((t) => t.code === "SHORT_ANSWER" || t.isAutoScored === false).map((t) => s(t.id)));
  // stable order by id (as before), whatever order the shared page uses
  const out = rows.filter((q) => !manual.has(q.typeId)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((q) => ({ id: q.id, level: fromDifficulty(q.difficultyLevel) as QLevel }));
  return opts.take ? out.slice(0, opts.take) : out;
}
