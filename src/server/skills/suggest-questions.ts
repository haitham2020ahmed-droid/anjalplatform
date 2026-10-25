/**
 * 🔎 "Find matching questions" — when an admin makes a skill for a new grade (e.g. after Clone grade), this finds
 * EXISTING published questions elsewhere in the bank whose own MAP area (mapInstructionalArea — set by the import
 * file, the MAP classification or an admin, independent of the question's current skillId) matches the new
 * skill's MAP goal area, so the admin can review a short list and move a batch to the new skill in one step
 * instead of filtering the whole Question Bank by hand. Never moves anything on its own.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { GROUPS, type GroupKey } from "../map/map-plan";
import { areaFromName } from "../map/nwea-area";

const s = (v: unknown) => String(v ?? "");

export interface QuestionCandidate { id: string; stem: string; skillId: string; skillName: string; grade: number | null; difficultyLevel: number | null }

async function skillGroup(repo: Repo, skillId: string): Promise<GroupKey | null> {
  const skill = await repo.findUnique("Skill", { id: skillId });
  if (!skill?.familyId) return null;
  const fam = await repo.findUnique("SkillFamily", { id: skill.familyId });
  if (!fam?.mapGoalAreaId) return null;
  const area = await repo.findUnique("MapGoalArea", { id: fam.mapGoalAreaId });
  const code = s(area?.code);
  return GROUPS.find((g) => g.codes.includes(code))?.key ?? null;
}

/** Up to `limit` published questions (of any OTHER skill, any grade) whose own MAP area matches this skill's MAP
 *  goal area group. `group: null` means the skill itself has no MAP goal area yet (link it first, on this same
 *  page, or via Admin → MAP Classification). */
export async function suggestQuestionsForSkill(repo: Repo, actor: Actor, skillId: string, limit = 40): Promise<{ group: GroupKey | null; candidates: QuestionCandidate[] }> {
  assertCan(actor, "curriculum:edit");
  const group = await skillGroup(repo, skillId);
  if (!group) return { group: null, candidates: [] };
  const rows = await repo.findMany("Question", { skillId: { not: skillId }, status: "PUBLISHED", deletedAt: null, mapInstructionalArea: { not: null } }, { select: ["id", "stem", "skillId", "difficultyLevel", "mapInstructionalArea"] });
  const matched = rows.filter((q) => areaFromName(s(q.mapInstructionalArea)) === group);
  if (!matched.length) return { group, candidates: [] };
  const skillIds = [...new Set(matched.map((q) => s(q.skillId)))];
  const skills = await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name", "curriculumId"] });
  const curIds = [...new Set(skills.map((k) => s(k.curriculumId)))];
  const curs = curIds.length ? await repo.findMany("Curriculum", { id: { in: curIds } }, { select: ["id", "gradeId"] }) : [];
  const gradeIds = [...new Set(curs.map((c) => s(c.gradeId)))];
  const grades = gradeIds.length ? await repo.findMany("Grade", { id: { in: gradeIds } }, { select: ["id", "level"] }) : [];
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), levelOf.get(s(c.gradeId)) ?? null]));
  const skillName = new Map(skills.map((k) => [s(k.id), s(k.name)]));
  const skillGrade = new Map(skills.map((k) => [s(k.id), gradeOfCur.get(s(k.curriculumId)) ?? null]));
  const candidates = matched.slice(0, limit).map((q) => ({
    id: s(q.id), stem: s(q.stem).replace(/\s+/g, " ").slice(0, 160), skillId: s(q.skillId), skillName: skillName.get(s(q.skillId)) ?? "—",
    grade: skillGrade.get(s(q.skillId)) ?? null, difficultyLevel: q.difficultyLevel === null || q.difficultyLevel === undefined ? null : Number(q.difficultyLevel),
  }));
  return { group, candidates };
}

/** Moves the chosen questions' skillId to this skill — the same move Admin → Questions → "Move to skill…" does,
 *  just pre-filtered to good candidates instead of the whole bank. */
export async function linkQuestionsToSkill(repo: Repo, actor: Actor, skillId: string, questionIds: string[], now = new Date()): Promise<number> {
  assertCan(actor, "curriculum:edit");
  const ids = [...new Set(questionIds.filter(Boolean))].slice(0, 200);
  if (!ids.length) throw new ValidationError("Choose at least one question.");
  const skill = await repo.findUnique("Skill", { id: skillId });
  if (!skill) throw new ValidationError("Skill not found.");
  let n = 0;
  await repo.transaction(async (tx) => {
    for (const id of ids) n += await tx.updateMany("Question", { id }, { skillId });
    await audit(tx, { actorId: actor.userId, action: "question.bulk-link-skill", entityType: "Skill", entityId: skillId, after: { questionIds: ids, count: n }, at: now });
  });
  return n;
}
