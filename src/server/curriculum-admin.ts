/**
 * Curriculum editor (admins; teachers only with an explicit `curriculum:edit` grant).
 * Every operation: permission check → school-scope check → validate → write → audit.
 * Nothing is hard-deleted: units/lessons/skills use soft delete so mastery history survives.
 */
import { audit } from "./audit";
import { assertCan, ForbiddenError, type Actor } from "./auth/rbac";
import type { Repo, Row } from "./seeding/repo";

export class ValidationError extends Error {
  readonly status = 422;
}

const s = (v: unknown) => String(v);

/** School that owns a curriculum object (walks unit/lesson/skill up to Grade.schoolId). */
async function schoolOf(repo: Repo, kind: "Curriculum" | "Unit" | "Lesson" | "Skill", id: string): Promise<string> {
  let curriculumId: string;
  if (kind === "Curriculum") curriculumId = id;
  else if (kind === "Unit" || kind === "Skill") {
    const row = await repo.findUnique(kind, { id });
    if (!row) throw new ValidationError(`${kind} not found`);
    curriculumId = s(row.curriculumId);
  } else {
    const lesson = await repo.findUnique("Lesson", { id });
    if (!lesson) throw new ValidationError("Lesson not found");
    curriculumId = s((await repo.findUnique("Unit", { id: lesson.unitId }))!.curriculumId);
  }
  const cur = await repo.findUnique("Curriculum", { id: curriculumId });
  if (!cur) throw new ValidationError("Curriculum not found");
  return s((await repo.findUnique("Grade", { id: cur.gradeId }))!.schoolId);
}

async function guard(repo: Repo, actor: Actor, kind: "Curriculum" | "Unit" | "Lesson" | "Skill", id: string) {
  assertCan(actor, "curriculum:edit");
  const school = await schoolOf(repo, kind, id);
  if (actor.role !== "SUPER_ADMIN" && actor.schoolId !== school) throw new ForbiddenError("This curriculum belongs to another school.");
}

const cleanTitle = (t: string, max = 191) => {
  const v = t.replace(/\s+/g, " ").trim();
  if (!v) throw new ValidationError("A title is required.");
  if (v.length > max) throw new ValidationError(`Keep the title under ${max} characters.`);
  return v;
};

export async function updateUnit(repo: Repo, actor: Actor, unitId: string, data: { title?: string; description?: string | null }): Promise<Row> {
  await guard(repo, actor, "Unit", unitId);
  const before = (await repo.findUnique("Unit", { id: unitId }))!;
  const patch: Row = {};
  if (data.title !== undefined) patch.title = cleanTitle(data.title);
  if (data.description !== undefined) patch.description = data.description?.trim() || null;
  await repo.updateMany("Unit", { id: unitId }, patch);
  await audit(repo, { actorId: actor.userId, action: "curriculum.unit.update", entityType: "Unit", entityId: unitId, before: { title: before.title }, after: patch });
  return (await repo.findUnique("Unit", { id: unitId }))!;
}

export async function addLesson(repo: Repo, actor: Actor, unitId: string, data: { title: string; code?: string; genre?: string | null }): Promise<Row> {
  await guard(repo, actor, "Unit", unitId);
  const existing = await repo.findMany("Lesson", { unitId });
  const number = existing.reduce((mx, l) => Math.max(mx, Number(l.number)), 0) + 1;
  const unit = (await repo.findUnique("Unit", { id: unitId }))!;
  const code = (data.code?.trim() || `U${unit.number}-L${number}`).slice(0, 64);
  if (existing.some((l) => l.code === code)) throw new ValidationError(`A lesson with code ${code} already exists in this unit.`);
  const row = await repo.create("Lesson", { unitId, number, code, title: cleanTitle(data.title), genre: data.genre?.trim() || null });
  await audit(repo, { actorId: actor.userId, action: "curriculum.lesson.create", entityType: "Lesson", entityId: s(row.id), after: { title: row.title, code } });
  return row;
}

export async function archiveLesson(repo: Repo, actor: Actor, lessonId: string): Promise<void> {
  await guard(repo, actor, "Lesson", lessonId);
  await repo.updateMany("Lesson", { id: lessonId }, { deletedAt: new Date() });
  await audit(repo, { actorId: actor.userId, action: "curriculum.lesson.archive", entityType: "Lesson", entityId: lessonId });
}

export async function updateSkill(repo: Repo, actor: Actor, skillId: string, data: { name?: string; description?: string | null; isActive?: boolean }): Promise<Row> {
  await guard(repo, actor, "Skill", skillId);
  const patch: Row = {};
  if (data.name !== undefined) patch.name = cleanTitle(data.name);
  if (data.description !== undefined) patch.description = data.description?.trim() || null;
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  await repo.updateMany("Skill", { id: skillId }, patch);
  await audit(repo, { actorId: actor.userId, action: "curriculum.skill.update", entityType: "Skill", entityId: skillId, after: patch });
  return (await repo.findUnique("Skill", { id: skillId }))!;
}

/** Link a skill to a lesson (idempotent) and make sure it appears in the unit's skill list. */
export async function linkSkillToLesson(repo: Repo, actor: Actor, lessonId: string, skillId: string, role: string, label?: string): Promise<void> {
  await guard(repo, actor, "Lesson", lessonId);
  const lesson = (await repo.findUnique("Lesson", { id: lessonId }))!;
  const unit = (await repo.findUnique("Unit", { id: lesson.unitId }))!;
  const skill = await repo.findUnique("Skill", { id: skillId });
  if (!skill || skill.curriculumId !== unit.curriculumId) throw new ValidationError("That skill is not part of this grade's curriculum.");
  const l = (label ?? s(skill.name)).trim();
  await repo.upsert("LessonSkill", { lessonId, skillId, label: l }, { role }, { role });
  const order = (await repo.findMany("UnitSkill", { unitId: unit.id })).length;
  await repo.upsert("UnitSkill", { unitId: unit.id, skillId }, { order });
  await audit(repo, { actorId: actor.userId, action: "curriculum.lesson.link_skill", entityType: "Lesson", entityId: lessonId, after: { skillId, role, label: l } });
}

export async function unlinkSkillFromLesson(repo: Repo, actor: Actor, lessonId: string, skillId: string): Promise<void> {
  await guard(repo, actor, "Lesson", lessonId);
  await repo.deleteMany("LessonSkill", { lessonId, skillId });
  // keep the unit link only if another lesson of the unit still teaches it
  const lesson = (await repo.findUnique("Lesson", { id: lessonId }))!;
  const siblings = (await repo.findMany("Lesson", { unitId: lesson.unitId })).map((x) => x.id);
  if ((await repo.count("LessonSkill", { lessonId: { in: siblings }, skillId })) === 0) await repo.deleteMany("UnitSkill", { unitId: lesson.unitId, skillId });
  await audit(repo, { actorId: actor.userId, action: "curriculum.lesson.unlink_skill", entityType: "Lesson", entityId: lessonId, after: { skillId } });
}

/** True if adding edge skill → prerequisite would create a cycle (prerequisite already depends on skill). */
export async function wouldCreateCycle(repo: Repo, skillId: string, prerequisiteId: string): Promise<boolean> {
  if (skillId === prerequisiteId) return true;
  const seen = new Set<string>();
  const stack = [prerequisiteId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === skillId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const e of await repo.findMany("SkillPrerequisite", { skillId: cur })) stack.push(s(e.prerequisiteSkillId));
  }
  return false;
}

export async function addPrerequisite(repo: Repo, actor: Actor, skillId: string, prerequisiteId: string, weight = 0.5, minimumMastery = 60): Promise<void> {
  await guard(repo, actor, "Skill", skillId);
  await guard(repo, actor, "Skill", prerequisiteId);
  if (!(weight > 0 && weight <= 1)) throw new ValidationError("Weight must be between 0 and 1.");
  if (!(minimumMastery >= 0 && minimumMastery <= 100)) throw new ValidationError("Minimum mastery must be 0–100.");
  if (await wouldCreateCycle(repo, skillId, prerequisiteId))
    throw new ValidationError("That would create a loop: the prerequisite already depends on this skill.");
  await repo.upsert("SkillPrerequisite", { skillId, prerequisiteSkillId: prerequisiteId }, { weight, minimumMastery }, { weight, minimumMastery });
  await audit(repo, { actorId: actor.userId, action: "curriculum.prerequisite.add", entityType: "Skill", entityId: skillId, after: { prerequisiteId, weight, minimumMastery } });
}

export async function removePrerequisite(repo: Repo, actor: Actor, skillId: string, prerequisiteId: string): Promise<void> {
  await guard(repo, actor, "Skill", skillId);
  await repo.deleteMany("SkillPrerequisite", { skillId, prerequisiteSkillId: prerequisiteId });
  await audit(repo, { actorId: actor.userId, action: "curriculum.prerequisite.remove", entityType: "Skill", entityId: skillId, after: { prerequisiteId } });
}

export async function linkStandard(repo: Repo, actor: Actor, skillId: string, standardCode: string, isPrimary = false): Promise<void> {
  await guard(repo, actor, "Skill", skillId);
  const std = (await repo.findMany("Standard", { code: standardCode }))[0];
  if (!std) throw new ValidationError(`Unknown standard ${standardCode}.`);
  await repo.upsert("SkillStandard", { skillId, standardId: std.id }, { isPrimary }, { isPrimary });
  await audit(repo, { actorId: actor.userId, action: "curriculum.skill.link_standard", entityType: "Skill", entityId: skillId, after: { standardCode } });
}

export async function unlinkStandard(repo: Repo, actor: Actor, skillId: string, standardCode: string): Promise<void> {
  await guard(repo, actor, "Skill", skillId);
  const std = (await repo.findMany("Standard", { code: standardCode }))[0];
  if (std) await repo.deleteMany("SkillStandard", { skillId, standardId: std.id });
  await audit(repo, { actorId: actor.userId, action: "curriculum.skill.unlink_standard", entityType: "Skill", entityId: skillId, after: { standardCode } });
}

/** Read model for the editor: one unit with lessons, their skills, and the skill pool to add from. */
export async function getUnitEditor(repo: Repo, actor: Actor, unitId: string) {
  await guard(repo, actor, "Unit", unitId);
  const unit = (await repo.findUnique("Unit", { id: unitId }))!;
  const lessons = (await repo.findMany("Lesson", { unitId, deletedAt: null })).sort((a, b) => Number(a.number) - Number(b.number));
  const links = lessons.length ? await repo.findMany("LessonSkill", { lessonId: { in: lessons.map((l) => l.id) } }) : [];
  const pool = (await repo.findMany("Skill", { curriculumId: unit.curriculumId, deletedAt: null })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const name = new Map(pool.map((p) => [s(p.id), s(p.name)]));
  return {
    unit: { id: s(unit.id), number: Number(unit.number), title: s(unit.title), description: unit.description ? s(unit.description) : "" },
    lessons: lessons.map((l) => ({
      id: s(l.id), code: s(l.code), title: s(l.title), genre: l.genre ? s(l.genre) : null,
      skills: links.filter((k) => k.lessonId === l.id).map((k) => ({ skillId: s(k.skillId), name: name.get(s(k.skillId)) ?? "?", label: s(k.label), role: s(k.role) })),
    })),
    skillPool: pool.map((p) => ({ id: s(p.id), name: s(p.name), category: s(p.category) })),
  };
}
