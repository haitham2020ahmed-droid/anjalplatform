/**
 * Curriculum management for admins: create, edit, reorder, activate/deactivate and (only when safe)
 * delete Grades, Units, Skills and Standards, in the EXISTING structure:
 *
 *   Grade (school) → Curriculum (grade + book) → Unit → (UnitSkill order) → Skill → SkillStandard → Standard
 *
 * Rules
 *   - Every action: permission `curriculum:edit` → school scope → validation → write → audit.
 *   - Nothing is created automatically (no grade is ever added unless an admin creates it).
 *   - Duplicates are refused with a DuplicateWarning; the admin may confirm to create anyway
 *     (except where the database itself forbids it, e.g. two grades with the same number).
 *   - Delete only when safe: an item that has questions, student results or assignments can only be
 *     deactivated. Units and skills use the existing soft delete (deletedAt) so history survives.
 */
import { audit } from "./audit";
import { assertCan, ForbiddenError, type Actor } from "./auth/rbac";
import { ValidationError } from "./curriculum-admin";
import type { Repo, Row } from "./seeding/repo";

/** A likely duplicate: the admin must confirm (confirmDuplicate) to go ahead. */
export class DuplicateWarning extends ValidationError {
  constructor(message: string) {
    super(message);
  }
}

const DOMAINS = ["READING", "VOCABULARY", "GRAMMAR", "LANGUAGE", "WRITING", "WORD_STUDY"] as const;
const CATEGORIES = ["LITERATURE", "INFORMATIONAL", "COMPREHENSION", "VOCABULARY", "WORD_STUDY", "GRAMMAR", "MECHANICS", "PHONICS_WORD_STUDY", "WRITING"] as const;
const FRAMEWORKS = ["CCSS_ELA", "MAP_CONTINUUM", "CURRICULUM_MAP", "SCHOOL_OBJECTIVE"] as const;
export const SKILL_DOMAINS = DOMAINS;
export const SKILL_CATEGORIES = CATEGORIES;
export const STANDARD_FRAMEWORKS = FRAMEWORKS;

const s = (v: unknown) => String(v ?? "");
const norm = (t: string) => t.toLowerCase().replace(/[‘’`´]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
const slug = (t: string) => norm(t).replace(/'/g, "").replace(/ /g, "-").slice(0, 60) || "item";
function text(v: unknown, label: string, max = 191, required = true): string {
  const t = s(v).replace(/\s+/g, " ").trim();
  if (!t && required) throw new ValidationError(`${label} is required.`);
  if (t.length > max) throw new ValidationError(`${label} must be ${max} characters or fewer.`);
  return t;
}
function school(actor: Actor): string {
  assertCan(actor, "curriculum:edit");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  return actor.schoolId;
}
const log = (repo: Repo, actor: Actor, action: string, entityType: string, entityId: string, after?: unknown, before?: unknown) =>
  audit(repo, { actorId: actor.userId, action, entityType, entityId, after: after as never, before: before as never });

async function gradeInSchool(repo: Repo, actor: Actor, gradeId: string): Promise<Row> {
  const mySchool = school(actor); // permission first
  const g = await repo.findUnique("Grade", { id: gradeId });
  if (!g || g.schoolId !== mySchool) throw new ForbiddenError("Grade not found.");
  return g;
}
async function curriculumOfGrade(repo: Repo, gradeId: string): Promise<Row | null> {
  const list = (await repo.findMany("Curriculum", { gradeId })).filter((c) => !c.deletedAt);
  return list.find((c) => c.isActive) ?? list[0] ?? null;
}
async function unitInSchool(repo: Repo, actor: Actor, unitId: string): Promise<{ unit: Row; cur: Row; grade: Row }> {
  school(actor); // permission first: never reveal whether an item exists to someone who may not edit
  const unit = await repo.findUnique("Unit", { id: unitId });
  if (!unit || unit.deletedAt) throw new ValidationError("Unit not found.");
  const cur = (await repo.findUnique("Curriculum", { id: unit.curriculumId }))!;
  return { unit, cur, grade: await gradeInSchool(repo, actor, s(cur.gradeId)) };
}
async function skillInSchool(repo: Repo, actor: Actor, skillId: string): Promise<{ skill: Row; cur: Row; grade: Row }> {
  school(actor); // permission first
  const skill = await repo.findUnique("Skill", { id: skillId });
  if (!skill || skill.deletedAt) throw new ValidationError("Skill not found.");
  const cur = (await repo.findUnique("Curriculum", { id: skill.curriculumId }))!;
  return { skill, cur, grade: await gradeInSchool(repo, actor, s(cur.gradeId)) };
}

// ------------------------------------------------------------------ overview

export interface CurriculumTree {
  grades: {
    id: string; level: number; name: string; isActive: boolean; curriculumId: string | null;
    units: { id: string; number: number; title: string; isActive: boolean; skills: { id: string; code: string; name: string; isActive: boolean; standards: string[]; questions: number }[] }[];
    unplaced: { id: string; code: string; name: string; isActive: boolean; standards: string[]; questions: number }[];
  }[];
}

/** Everything the management page shows, in a fixed number of queries. */
export async function curriculumTree(repo: Repo, actor: Actor): Promise<CurriculumTree> {
  const schoolId = school(actor);
  const grades = (await repo.findMany("Grade", { schoolId })).sort((a, b) => Number(a.level) - Number(b.level));
  const curricula = grades.length ? (await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } })).filter((c) => !c.deletedAt) : [];
  const curIds = curricula.map((c) => c.id);
  const [units, skills] = await Promise.all([
    curIds.length ? repo.findMany("Unit", { curriculumId: { in: curIds }, deletedAt: null }) : Promise.resolve([] as Row[]),
    curIds.length ? repo.findMany("Skill", { curriculumId: { in: curIds }, deletedAt: null }, { select: ["id", "code", "name", "isActive", "curriculumId", "sequence"] }) : Promise.resolve([] as Row[]),
  ]);
  const skillIds = skills.map((k) => k.id);
  const [unitSkills, links, qs] = await Promise.all([
    units.length ? repo.findMany("UnitSkill", { unitId: { in: units.map((u) => u.id) } }) : Promise.resolve([] as Row[]),
    skillIds.length ? repo.findMany("SkillStandard", { skillId: { in: skillIds } }) : Promise.resolve([] as Row[]),
    skillIds.length ? repo.findMany("Question", { skillId: { in: skillIds }, deletedAt: null }, { select: ["skillId"] }) : Promise.resolve([] as Row[]),
  ]);
  const stds = links.length ? await repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => l.standardId))] } }, { select: ["id", "code"] }) : [];
  const stdCode = new Map(stds.map((x) => [s(x.id), s(x.code).replace(/^CCSS\.ELA-LITERACY\./, "")]));
  const qCount = new Map<string, number>();
  for (const q of qs) qCount.set(s(q.skillId), (qCount.get(s(q.skillId)) ?? 0) + 1);
  const skillView = (k: Row) => ({
    id: s(k.id), code: s(k.code), name: s(k.name), isActive: Boolean(k.isActive),
    standards: links.filter((l) => l.skillId === k.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((l) => stdCode.get(s(l.standardId)) ?? ""),
    questions: qCount.get(s(k.id)) ?? 0,
  });
  return {
    grades: grades.map((g) => {
      const cur = curricula.find((c) => c.gradeId === g.id && c.isActive) ?? curricula.find((c) => c.gradeId === g.id) ?? null;
      const myUnits = cur ? units.filter((u) => u.curriculumId === cur.id).sort((a, b) => Number(a.number) - Number(b.number)) : [];
      const mySkills = cur ? skills.filter((k) => k.curriculumId === cur.id) : [];
      const placed = new Set<string>();
      const unitViews = myUnits.map((u) => {
        const ordered = unitSkills.filter((x) => x.unitId === u.id).sort((a, b) => Number(a.order) - Number(b.order));
        const list = ordered.map((x) => mySkills.find((k) => k.id === x.skillId)).filter((k): k is Row => Boolean(k));
        list.forEach((k) => placed.add(s(k.id)));
        return { id: s(u.id), number: Number(u.number), title: s(u.title), isActive: u.isActive !== false, skills: list.map(skillView) };
      });
      return {
        id: s(g.id), level: Number(g.level), name: s(g.name), isActive: g.isActive !== false, curriculumId: cur ? s(cur.id) : null, units: unitViews,
        unplaced: mySkills.filter((k) => !placed.has(s(k.id))).sort((a, b) => Number(a.sequence) - Number(b.sequence)).map(skillView),
      };
    }),
  };
}

// ------------------------------------------------------------------ grades

/** Creates a grade with an empty curriculum. Never called automatically. */
export async function createGrade(repo: Repo, actor: Actor, input: { level: number; name?: string }, now = new Date()): Promise<Row> {
  const schoolId = school(actor);
  const level = Number(input.level);
  if (!Number.isInteger(level) || level < 0 || level > 12) throw new ValidationError("The grade number must be a whole number from 0 (KG) to 12.");
  const name = text(input.name || (level === 0 ? "Kindergarten" : `Grade ${level}`), "Grade name", 60);
  if ((await repo.findMany("Grade", { schoolId, level })).length) throw new ValidationError(`Grade ${level} already exists. Edit or reactivate it instead of creating it again.`);
  const sameName = (await repo.findMany("Grade", { schoolId })).find((g) => norm(s(g.name)) === norm(name));
  if (sameName) throw new ValidationError(`A grade named “${name}” already exists (grade ${sameName.level}). Choose a different name.`);
  return repo.transaction(async (tx) => {
    const grade = await tx.create("Grade", { schoolId, level, name, isActive: true });
    const book = await tx.upsert("Book", { code: `SCHOOL-${schoolId.slice(-6)}-G${level}` }, { title: `${name} curriculum`, publisher: null, edition: null });
    const cur = await tx.create("Curriculum", { gradeId: grade.id, bookId: book.id, name, isActive: true });
    await log(tx, actor, "curriculum.grade.create", "Grade", s(grade.id), { level, name, curriculumId: cur.id });
    void now;
    return grade;
  });
}

export async function updateGrade(repo: Repo, actor: Actor, gradeId: string, input: { name?: string; isActive?: boolean }): Promise<void> {
  const g = await gradeInSchool(repo, actor, gradeId);
  const patch: Row = {};
  if (input.name !== undefined) {
    patch.name = text(input.name, "Grade name", 60);
    const clash = (await repo.findMany("Grade", { schoolId: g.schoolId })).find((x) => x.id !== g.id && norm(s(x.name)) === norm(s(patch.name)));
    if (clash) throw new ValidationError(`Another grade is already named “${patch.name}”.`);
  }
  if (input.isActive !== undefined) patch.isActive = Boolean(input.isActive);
  await repo.updateMany("Grade", { id: gradeId }, patch);
  await log(repo, actor, "curriculum.grade.update", "Grade", gradeId, patch, { name: g.name, isActive: g.isActive });
}

/**
 * Deletes a grade only if nothing uses it: no classes, students, or live units/skills. Units and
 * skills that were already removed (soft-deleted) are cleaned up with it, provided none of them
 * carries questions or student history.
 */
export async function deleteGrade(repo: Repo, actor: Actor, gradeId: string): Promise<void> {
  const g = await gradeInSchool(repo, actor, gradeId);
  const curricula = await repo.findMany("Curriculum", { gradeId });
  const curIds = curricula.map((c) => c.id);
  const [classes, students, units, skills] = await Promise.all([
    repo.count("Class", { gradeId }), repo.count("Student", { gradeId }),
    curIds.length ? repo.findMany("Unit", { curriculumId: { in: curIds } }, { select: ["id", "deletedAt"] }) : Promise.resolve([] as Row[]),
    curIds.length ? repo.findMany("Skill", { curriculumId: { in: curIds } }, { select: ["id", "deletedAt"] }) : Promise.resolve([] as Row[]),
  ]);
  const liveUnits = units.filter((u) => !u.deletedAt).length, liveSkills = skills.filter((k) => !k.deletedAt).length;
  const uses = [classes && `${classes} class(es)`, students && `${students} student(s)`, liveUnits && `${liveUnits} unit(s)`, liveSkills && `${liveSkills} skill(s)`].filter(Boolean);
  if (uses.length) throw new ValidationError(`Grade ${g.level} cannot be deleted because it has ${uses.join(", ")}. Deactivate it instead.`);
  const skillIds = skills.map((k) => k.id), unitIds = units.map((u) => u.id);
  if (skillIds.length) {
    const [q, m, a] = await Promise.all([repo.count("Question", { skillId: { in: skillIds } }), repo.count("StudentSkillMastery", { skillId: { in: skillIds } }), repo.count("QuestionAttempt", { skillId: { in: skillIds } })]);
    if (q || m || a) throw new ValidationError(`Grade ${g.level} cannot be deleted because removed skills still hold questions or student history. Deactivate it instead.`);
  }
  await repo.transaction(async (tx) => {
    const lessons = unitIds.length ? await tx.findMany("Lesson", { unitId: { in: unitIds } }, { select: ["id"] }) : [];
    if (lessons.length) {
      await tx.deleteMany("LessonSkill", { lessonId: { in: lessons.map((l) => l.id) } });
      await tx.deleteMany("Lesson", { id: { in: lessons.map((l) => l.id) } });
    }
    if (unitIds.length) await tx.deleteMany("UnitSkill", { unitId: { in: unitIds } });
    if (skillIds.length) {
      await tx.deleteMany("SkillStandard", { skillId: { in: skillIds } });
      await tx.deleteMany("SkillPrerequisite", { skillId: { in: skillIds } });
      await tx.deleteMany("SkillPrerequisite", { prerequisiteSkillId: { in: skillIds } });
      await tx.deleteMany("Skill", { id: { in: skillIds } });
    }
    if (unitIds.length) await tx.deleteMany("Unit", { id: { in: unitIds } });
    await tx.deleteMany("Curriculum", { gradeId });
    await tx.deleteMany("Grade", { id: gradeId });
    await log(tx, actor, "curriculum.grade.delete", "Grade", gradeId, undefined, { level: g.level, name: g.name });
  });
}

// ------------------------------------------------------------------ units

export async function createUnit(repo: Repo, actor: Actor, input: { gradeId: string; title: string; description?: string; confirmDuplicate?: boolean }): Promise<Row> {
  await gradeInSchool(repo, actor, input.gradeId);
  const cur = await curriculumOfGrade(repo, input.gradeId);
  if (!cur) throw new ValidationError("This grade has no curriculum yet.");
  const title = text(input.title, "Unit title");
  const units = await repo.findMany("Unit", { curriculumId: cur.id });
  const dup = units.find((u) => !u.deletedAt && norm(s(u.title)) === norm(title));
  if (dup && !input.confirmDuplicate) throw new DuplicateWarning(`Unit ${dup.number} in this grade is already called “${dup.title}”. Tick “create anyway” if you really want a second one.`);
  const number = units.reduce((m, u) => Math.max(m, Number(u.number)), 0) + 1; // deleted units keep their numbers
  const unit = await repo.create("Unit", { curriculumId: cur.id, number, title, description: s(input.description).trim() || null, isActive: true });
  await log(repo, actor, "curriculum.unit.create", "Unit", s(unit.id), { title, number });
  return unit;
}

export async function setUnitActive(repo: Repo, actor: Actor, unitId: string, isActive: boolean): Promise<void> {
  await unitInSchool(repo, actor, unitId);
  await repo.updateMany("Unit", { id: unitId }, { isActive: Boolean(isActive) });
  await log(repo, actor, "curriculum.unit.active", "Unit", unitId, { isActive });
}

/** Moves a unit one place up or down among the grade's units (swaps numbers safely). */
export async function moveUnit(repo: Repo, actor: Actor, unitId: string, direction: "up" | "down"): Promise<void> {
  const { unit, cur } = await unitInSchool(repo, actor, unitId);
  const units = (await repo.findMany("Unit", { curriculumId: cur.id, deletedAt: null })).sort((a, b) => Number(a.number) - Number(b.number));
  const i = units.findIndex((u) => u.id === unit.id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= units.length) return;
  const a = units[i], b = units[j];
  const temp = -1 - Number(a.number); // numbers are unique per curriculum: park one first
  await repo.transaction(async (tx) => {
    await tx.updateMany("Unit", { id: a.id }, { number: temp });
    await tx.updateMany("Unit", { id: b.id }, { number: a.number });
    await tx.updateMany("Unit", { id: a.id }, { number: b.number });
    await log(tx, actor, "curriculum.unit.move", "Unit", s(a.id), { from: a.number, to: b.number });
  });
}

/** Removes a unit only when no assignment or lesson question depends on it (soft delete). */
export async function deleteUnit(repo: Repo, actor: Actor, unitId: string, now = new Date()): Promise<void> {
  const { unit } = await unitInSchool(repo, actor, unitId);
  const lessons = await repo.findMany("Lesson", { unitId, deletedAt: null });
  const [assignments, questions] = await Promise.all([
    repo.count("Assignment", { unitId, deletedAt: null }),
    lessons.length ? repo.count("Question", { lessonId: { in: lessons.map((l) => l.id) }, deletedAt: null }) : 0,
  ]);
  if (assignments || questions) throw new ValidationError(`Unit ${unit.number} cannot be deleted: ${[assignments && `${assignments} assignment(s)`, questions && `${questions} question(s)`].filter(Boolean).join(" and ")} use it. Deactivate it instead.`);
  await repo.transaction(async (tx) => {
    await tx.updateMany("Unit", { id: unitId }, { deletedAt: now });
    await tx.deleteMany("UnitSkill", { unitId }); // the skills stay in the grade; they just leave this unit
    await log(tx, actor, "curriculum.unit.delete", "Unit", unitId, undefined, { title: unit.title });
  });
}

// ------------------------------------------------------------------ skills

/** Creates a skill in a grade (optionally placed in a unit) with its domain, category and standards. */
export async function createSkill(repo: Repo, actor: Actor, input: { gradeId: string; unitId?: string | null; name: string; description?: string; domain: string; category: string; standardCodes?: string[]; confirmDuplicate?: boolean }): Promise<Row> {
  const grade = await gradeInSchool(repo, actor, input.gradeId);
  const cur = await curriculumOfGrade(repo, input.gradeId);
  if (!cur) throw new ValidationError("This grade has no curriculum yet.");
  const name = text(input.name, "Skill name");
  if (!(DOMAINS as readonly string[]).includes(input.domain)) throw new ValidationError("Choose a domain.");
  if (!(CATEGORIES as readonly string[]).includes(input.category)) throw new ValidationError("Choose a category.");
  const skills = await repo.findMany("Skill", { curriculumId: cur.id });
  const dup = skills.find((k) => !k.deletedAt && norm(s(k.name)) === norm(name));
  if (dup && !input.confirmDuplicate) throw new DuplicateWarning(`Grade ${grade.level} already has a skill called “${dup.name}” (${dup.code}). Tick “create anyway” if this is a different skill.`);
  const standards = await resolveStandards(repo, input.standardCodes ?? []);
  if (input.unitId) {
    const { cur: unitCur } = await unitInSchool(repo, actor, input.unitId);
    if (unitCur.id !== cur.id) throw new ValidationError("That unit belongs to another grade.");
  }
  let code = `G${grade.level}.${slug(name)}`;
  for (let n = 2; skills.some((k) => k.code === code); n++) code = `G${grade.level}.${slug(name)}-${n}`;
  return repo.transaction(async (tx) => {
    const famCode = `school.${input.domain.toLowerCase()}.${input.category.toLowerCase()}`;
    const family = await tx.upsert("SkillFamily", { code: famCode }, { name: `${input.domain} · ${input.category}`.toLowerCase(), domain: input.domain, category: input.category });
    const sequence = skills.reduce((m, k) => Math.max(m, Number(k.sequence)), 0) + 1;
    const skill = await tx.create("Skill", { curriculumId: cur.id, familyId: family.id, code, name, description: s(input.description).trim() || null, domain: input.domain, category: input.category, sequence, isActive: true });
    for (const [i, st] of standards.entries()) await tx.create("SkillStandard", { skillId: skill.id, standardId: st.id, isPrimary: i === 0 });
    if (input.unitId) {
      const order = (await tx.findMany("UnitSkill", { unitId: input.unitId })).reduce((m, x) => Math.max(m, Number(x.order)), -1) + 1;
      await tx.create("UnitSkill", { unitId: input.unitId, skillId: skill.id, order });
    }
    await log(tx, actor, "curriculum.skill.create", "Skill", s(skill.id), { code, name, unitId: input.unitId ?? null, standards: standards.map((x) => x.code) });
    return skill;
  });
}

async function resolveStandards(repo: Repo, codes: string[]): Promise<Row[]> {
  const wanted = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  if (!wanted.length) return [];
  const all = await repo.findMany("Standard", {}, { select: ["id", "code", "isActive"] });
  const short = (c: string) => c.replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase();
  return wanted.map((w) => {
    const hit = all.find((x) => s(x.code).toUpperCase() === w.toUpperCase() || short(s(x.code)) === short(w));
    if (!hit) throw new ValidationError(`Standard “${w}” does not exist. Create it first on the Standards page.`);
    return hit;
  });
}

/** Adds an existing skill to a unit (end of the list), or moves it within the unit. */
export async function placeSkillInUnit(repo: Repo, actor: Actor, skillId: string, unitId: string): Promise<void> {
  const { cur } = await skillInSchool(repo, actor, skillId);
  const { cur: unitCur } = await unitInSchool(repo, actor, unitId);
  if (cur.id !== unitCur.id) throw new ValidationError("A skill can only be placed in a unit of its own grade.");
  if ((await repo.findMany("UnitSkill", { unitId, skillId })).length) return;
  const order = (await repo.findMany("UnitSkill", { unitId })).reduce((m, x) => Math.max(m, Number(x.order)), -1) + 1;
  await repo.create("UnitSkill", { unitId, skillId, order });
  await log(repo, actor, "curriculum.skill.place", "Skill", skillId, { unitId });
}

export async function moveSkillInUnit(repo: Repo, actor: Actor, unitId: string, skillId: string, direction: "up" | "down"): Promise<void> {
  await unitInSchool(repo, actor, unitId);
  const list = (await repo.findMany("UnitSkill", { unitId })).sort((a, b) => Number(a.order) - Number(b.order));
  const i = list.findIndex((x) => x.skillId === skillId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  await repo.transaction(async (tx) => {
    // renumber the whole unit 0..n so equal or missing orders can never stick
    const ordered = [...list];
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    for (const [k, x] of ordered.entries()) await tx.updateMany("UnitSkill", { unitId, skillId: x.skillId }, { order: k });
    await log(tx, actor, "curriculum.skill.move", "Skill", skillId, { unitId, direction });
  });
}

export async function setSkillActive(repo: Repo, actor: Actor, skillId: string, isActive: boolean): Promise<void> {
  await skillInSchool(repo, actor, skillId);
  await repo.updateMany("Skill", { id: skillId }, { isActive: Boolean(isActive) });
  await log(repo, actor, "curriculum.skill.active", "Skill", skillId, { isActive });
}

/** Removes a skill only when nothing depends on it: no questions, student results or assignments. */
export async function deleteSkill(repo: Repo, actor: Actor, skillId: string, now = new Date()): Promise<void> {
  const { skill, cur } = await skillInSchool(repo, actor, skillId);
  const classes = (await repo.findMany("Class", { gradeId: cur.gradeId }, { select: ["id"] })).map((c) => c.id);
  const [questions, mastery, attempts, assignments] = await Promise.all([
    repo.count("Question", { skillId, deletedAt: null }), repo.count("StudentSkillMastery", { skillId }), repo.count("QuestionAttempt", { skillId }),
    classes.length ? repo.findMany("Assignment", { classId: { in: classes }, deletedAt: null }, { select: ["skillId", "skillIds"] }) : Promise.resolve([] as Row[]),
  ]);
  const assigned = assignments.filter((a) => a.skillId === skillId || (Array.isArray(a.skillIds) && (a.skillIds as string[]).includes(skillId))).length;
  const uses = [questions && `${questions} question(s)`, (mastery || attempts) && "student results", assigned && `${assigned} assignment(s)`].filter(Boolean);
  if (uses.length) throw new ValidationError(`“${skill.name}” cannot be deleted because it has ${uses.join(", ")}. Deactivate it instead.`);
  await repo.transaction(async (tx) => {
    await tx.updateMany("Skill", { id: skillId }, { deletedAt: now, isActive: false });
    await tx.deleteMany("UnitSkill", { skillId });
    await tx.deleteMany("LessonSkill", { skillId });
    await log(tx, actor, "curriculum.skill.delete", "Skill", skillId, undefined, { code: skill.code, name: skill.name });
  });
}

// ------------------------------------------------------------------ standards

export interface StandardView { id: string; framework: string; code: string; description: string; gradeLevel: number | null; isActive: boolean; skills: number; questions: number }

export async function listStandards(repo: Repo, actor: Actor): Promise<StandardView[]> {
  school(actor);
  const [stds, links, qs] = await Promise.all([
    repo.findMany("Standard", {}),
    repo.findMany("SkillStandard", {}, { select: ["standardId"] }),
    repo.findMany("Question", { deletedAt: null }, { select: ["standardId"] }),
  ]);
  const count = (rows: Row[]) => rows.reduce((m, r) => m.set(s(r.standardId), (m.get(s(r.standardId)) ?? 0) + 1), new Map<string, number>());
  const lc = count(links), qc = count(qs.filter((q) => q.standardId));
  return stds.map((x) => ({ id: s(x.id), framework: s(x.framework), code: s(x.code), description: s(x.description), gradeLevel: x.gradeLevel === null || x.gradeLevel === undefined ? null : Number(x.gradeLevel), isActive: x.isActive !== false, skills: lc.get(s(x.id)) ?? 0, questions: qc.get(s(x.id)) ?? 0 }))
    .sort((a, b) => (a.gradeLevel ?? 99) - (b.gradeLevel ?? 99) || a.code.localeCompare(b.code, "en", { numeric: true }));
}

export async function createStandard(repo: Repo, actor: Actor, input: { framework: string; code: string; description?: string; gradeLevel?: number | null; confirmDuplicate?: boolean }): Promise<Row> {
  school(actor);
  if (!(FRAMEWORKS as readonly string[]).includes(input.framework)) throw new ValidationError("Choose a framework.");
  const code = text(input.code, "Standard code", 120).replace(/\s+/g, "");
  const all = await repo.findMany("Standard", {}, { select: ["id", "framework", "code", "description"] });
  if (all.some((x) => x.framework === input.framework && s(x.code).toUpperCase() === code.toUpperCase())) throw new ValidationError(`Standard ${code} already exists. Edit it instead.`);
  const short = (c: string) => c.replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase();
  const near = all.find((x) => short(s(x.code)) === short(code));
  if (near && !input.confirmDuplicate) throw new DuplicateWarning(`A standard with the same code already exists (${near.code}). Tick “create anyway” if this is a different standard.`);
  const description = text(input.description, "Description", 2000, false) || null;
  const gradeLevel = input.gradeLevel === null || input.gradeLevel === undefined || String(input.gradeLevel) === "" ? null : Number(input.gradeLevel);
  if (gradeLevel !== null && (!Number.isInteger(gradeLevel) || gradeLevel < 0 || gradeLevel > 12)) throw new ValidationError("Grade level must be 0–12 or empty.");
  const st = await repo.create("Standard", { framework: input.framework, code, description, gradeLevel, isActive: true });
  await log(repo, actor, "curriculum.standard.create", "Standard", s(st.id), { framework: input.framework, code });
  return st;
}

export async function updateStandard(repo: Repo, actor: Actor, standardId: string, input: { description?: string; gradeLevel?: number | null; isActive?: boolean }): Promise<void> {
  school(actor);
  const st = await repo.findUnique("Standard", { id: standardId });
  if (!st) throw new ValidationError("Standard not found.");
  const patch: Row = {};
  if (input.description !== undefined) patch.description = text(input.description, "Description", 2000, false) || null;
  if (input.gradeLevel !== undefined) patch.gradeLevel = input.gradeLevel === null || String(input.gradeLevel) === "" ? null : Number(input.gradeLevel);
  if (input.isActive !== undefined) patch.isActive = Boolean(input.isActive);
  await repo.updateMany("Standard", { id: standardId }, patch);
  await log(repo, actor, "curriculum.standard.update", "Standard", standardId, patch);
}

/** Deletes a standard only if no skill or question uses it. */
export async function deleteStandard(repo: Repo, actor: Actor, standardId: string): Promise<void> {
  school(actor);
  const st = await repo.findUnique("Standard", { id: standardId });
  if (!st) throw new ValidationError("Standard not found.");
  const [skills, questions] = await Promise.all([repo.count("SkillStandard", { standardId }), repo.count("Question", { standardId })]);
  if (skills || questions) throw new ValidationError(`${st.code} cannot be deleted: ${[skills && `${skills} skill(s)`, questions && `${questions} question(s)`].filter(Boolean).join(" and ")} use it. Deactivate it instead.`);
  await repo.deleteMany("Standard", { id: standardId });
  await log(repo, actor, "curriculum.standard.delete", "Standard", standardId, undefined, { code: st.code });
}
