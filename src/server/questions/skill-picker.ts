/**
 * 🧺 The question picker's server side: a skill's questions for a teacher to choose from — ONE bank (every grade's
 * copy of the skill, see skill-questions.ts), optionally one level and a word search, at most 200 at a time.
 *
 * Teachers and admins only (checked here, on the server); the skill must be of the actor's school. Published,
 * auto-marked questions only (the ones that can be assigned). Read only.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { correctAnswerText, loadQuestionItems } from "../practice/items";
import { familyIdsInSchool, LEVEL_OF, questionsOfSkill, schoolSkillIndex } from "./skill-questions";

const s = (v: unknown) => String(v ?? "");
export const PICKER_MAX = 200;
export type PickerLevel = "BELOW" | "ON" | "ABOVE";
const LEVEL_RANGE: Record<PickerLevel, number[]> = { BELOW: [1, 2, 3], ON: [4], ABOVE: [5, 6, 7] };

export interface PickerQuestion {
  id: string; stem: string; choices: { label: string; text: string }[]; correctAnswer: string;
  level: PickerLevel; difficultyLevel: number; type: string; passageTitle: string | null;
  /** the skill row the question is stored on (any grade's copy of the skill) */
  skillId: string;
}
export interface PickerResult { skill: { id: string; name: string; grade: number }; total: number; questions: PickerQuestion[] }
export interface PickerOpts { level?: PickerLevel; search?: string; limit?: number }

export function canUsePicker(actor: Actor | null | undefined): boolean {
  return !!actor && (actor.role === "TEACHER" || actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") && !!actor.schoolId;
}

/** The skill's pooled questions for the picker (teacher / admin only). */
export async function listSkillQuestionsForTeacher(repo: Repo, actor: Actor, skillId: string, opts: PickerOpts = {}): Promise<PickerResult> {
  if (!canUsePicker(actor)) throw new ForbiddenError("Only teachers and admins can choose questions.");
  const schoolId = s(actor.schoolId);
  const fam = await familyIdsInSchool(repo, schoolId, s(skillId));
  if (!fam.length) throw new ForbiddenError("Skill not found.");
  const idx = await schoolSkillIndex(repo, schoolId);
  const sk = idx.skillOf.get(s(skillId))!;
  const limit = Math.max(1, Math.min(PICKER_MAX, Math.floor(Number(opts.limit) || 50)));
  const level = opts.level && LEVEL_RANGE[opts.level] ? LEVEL_RANGE[opts.level] : undefined;
  // pooled ids (bounded page), then the word search on those ids only — never the whole bank
  let rows = await questionsOfSkill(repo, schoolId, s(skillId), { level, take: 1000 });
  const search = s(opts.search).replace(/\s+/g, " ").trim().slice(0, 80);
  if (search && rows.length) {
    const hit = new Set<string>();
    for (let i = 0; i < rows.length; i += 400) {
      for (const q of await repo.findMany("Question", { id: { in: rows.slice(i, i + 400).map((r) => r.id) }, stem: { contains: search } }, { select: ["id"] }) as Row[]) hit.add(s(q.id));
    }
    rows = rows.filter((r) => hit.has(r.id));
  }
  // own grade first, then the other grades; inside, by level then id (stable)
  const own = s(skillId);
  rows = [...rows].sort((a, b) => Number(b.skillId === own) - Number(a.skillId === own) || a.difficultyLevel - b.difficultyLevel || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const skillOf = new Map(rows.map((r) => [r.id, r.skillId]));
  // auto-marked only (loadQuestionItems keeps the types the platform marks itself), so read a little more than asked
  const items = await loadQuestionItems(repo, rows.slice(0, Math.min(rows.length, limit + 50)).map((r) => r.id));
  const questions = items.slice(0, limit).map((it): PickerQuestion => ({
    id: it.questionId, stem: it.stem, choices: (it.options ?? []).map((o) => ({ label: o.label, text: o.text })),
    correctAnswer: (() => { try { return correctAnswerText(it); } catch { return ""; } })(),
    level: LEVEL_OF(Number(it.level) || 4), difficultyLevel: Number(it.level) || 4, type: s(it.type), passageTitle: it.passageTitle ? s(it.passageTitle) : null,
    skillId: skillOf.get(it.questionId) ?? own,
  }));
  return { skill: { id: sk.id, name: sk.name, grade: sk.grade }, total: rows.length, questions };
}
