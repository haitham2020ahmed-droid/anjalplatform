/**
 * 📝 Assessments (UI reorg Phase 5): a teacher builds a test from skills of ANY grade, gives it a type (NAFS, MAP,
 * Diagnostic, Weekly Quiz, Chapter Test or a custom name), chooses the question level (same for all, or at each
 * student's level), dates, an optional time limit and per-student shuffle, previews it (removing questions) and
 * assigns it to one student, a group or the whole class of THEIR OWN classes (checked on the server).
 *
 * Nothing new is built for answering or marking: each test is one question set per level group made by
 * assignQuestions (Assessment TEACHER_QUIZ + Assignment), answered in the existing quiz player (/quiz/[id]) with the
 * same scoring and mastery engine. The sets carry testId (TeacherTest) and the mark curriculumPlanId = "TEST", which keeps
 * them in My Tests and out of My Work. Results are read per skill; Reteach assigns each skill under 70% to that
 * student's My Work with the existing assignSkill.
 */
import { hideLevels } from "../../lib/hide-levels";
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { accessibleClasses, assignQuestions, assignSkill, MAX_TEST_SET_QUESTIONS, openAssignmentFor, refreshQuestionSets } from "../teacher/assign";
import { skillPickerList } from "../skills/picker";
import type { SkillTab, SkillTabFilter } from "../../lib/skill-picker";
import { evidenceLevels } from "../curriculum-map/evidence-level";
import { instructionalWeekOf, loadCycle } from "../assessment-cycle/cycle";
import { correctAnswerText, loadQuestionItems, seededShuffle, studentAnswerText } from "../practice/items";
import { questionsOfSkill, type QLevel } from "./question-source";
import { familyRepresentatives } from "../questions/skill-questions";
import { TEST_MARK, testOrder } from "./runtime";
import { contentKeysForIds, Sitting } from "../questions/fresh";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const iso = (v: unknown) => d(v)?.toISOString() ?? null;
const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };
/** Reads in batches so no page holds a whole table (512 MB server). */
async function inBatches(ids: string[], size: number, fn: (chunk: string[]) => Promise<Row[]>): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

// ------------------------------------------------------------------ types, names, defaults

export const TEST_TYPES = ["NAFS", "MAP", "DIAGNOSTIC", "WEEKLY_QUIZ", "CHAPTER_TEST", "CUSTOM"] as const;
export type TestType = (typeof TEST_TYPES)[number];
export const TEST_TYPE_NAME: Record<TestType, string> = { NAFS: "NAFS", MAP: "MAP", DIAGNOSTIC: "Diagnostic", WEEKLY_QUIZ: "Weekly Quiz", CHAPTER_TEST: "Chapter Test", CUSTOM: "Other" };
export type LevelMode = "SAME" | "LEVEL";
export const LEVELS: QLevel[] = ["BELOW", "ON", "ABOVE"];
export const LEVEL_NAME: Record<QLevel, string> = { BELOW: "Below Level", ON: "On Level", ABOVE: "Above Level" };
/** A skill scored under this (percent) goes back to the student's My Work with Reteach. */
export const RETEACH_PCT = 70;
export const MAX_PER_SKILL = 20;
export const MAX_TEST_QUESTIONS = MAX_TEST_SET_QUESTIONS;
export const MAX_TIME_LIMIT_MIN = 240;

export const asTestType = (v: unknown): TestType => (TEST_TYPES as readonly string[]).includes(s(v)) ? (s(v) as TestType) : "CUSTOM";
/** Same for all: recommended for NAFS, MAP, Chapter Test (and Diagnostic); at each student's level: the Weekly Quiz. */
export const defaultLevelMode = (t: TestType): LevelMode => (t === "WEEKLY_QUIZ" ? "LEVEL" : "SAME");
/** The tag shown on a test (custom tests show their own name in My Tests and group as "Other" in reports). */
export const typeTag = (t: TestType): string => TEST_TYPE_NAME[t];

/** The school's instructional week now (at least 1). */
export async function schoolWeek(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  try { return Math.max(1, instructionalWeekOf((await loadCycle(repo, schoolId, now)).cycle, now)); } catch { return 1; }
}
/** Automatic names, e.g. "Weekly Quiz – Week 6" (editable by the teacher). */
export function autoTestName(t: TestType, week: number): string {
  return t === "CUSTOM" ? "" : `${TEST_TYPE_NAME[t]} – Week ${week}`;
}

/** Name and grade of just these skills (this school only) — not the whole list (bounded reads). */
export async function skillMeta(repo: Repo, schoolId: string, ids: string[]): Promise<{ id: string; name: string; grade: number }[]> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return [];
  const skills = await inBatches(uniq, 500, (c) => repo.findMany("Skill", { id: { in: c }, deletedAt: null }, { select: ["id", "name", "curriculumId"] }));
  const curs = skills.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }) : [];
  const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => s(c.gradeId)))] } }, { select: ["id", "level", "schoolId"] }) : [];
  return skills.flatMap((k) => {
    const g = grades.find((x) => x.id === curs.find((c) => c.id === k.curriculumId)?.gradeId);
    return g && s(g.schoolId) === schoolId ? [{ id: s(k.id), name: s(k.name), grade: Number(g.level) }] : [];
  });
}

function staff(actor: Actor): void {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers can build tests.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
}

// ------------------------------------------------------------------ 1. pick skills (any grade)

export type SkillFilter = SkillTabFilter;
export interface BuilderSkill {
  id: string; name: string; grade: number; filter: SkillTab; available: number;
  /** every name / skill id of the skill's shared pool (all grades): the search finds it by any name */
  names: string[]; skillIds: string[];
}

/**
 * Every active skill (ACCESS RULES: all content is open to every teacher), one row per shared pool, from the one
 * picker source (skillPickerList), A–Z; `available` = the pooled published count (0 → shown disabled).
 * A name is found whatever its case, "&" / "and" or apostrophe ("Character Traits & Development").
 */
export async function builderSkills(repo: Repo, actor: Actor, opts: { q?: string; filter?: SkillFilter; grade?: number } = {}): Promise<BuilderSkill[]> {
  staff(actor);
  return (await skillPickerList(repo, actor, { onlyGrade: opts.grade, q: opts.q, tab: opts.filter }))
    .map((k) => ({ id: k.id, name: k.name, grade: k.grade, filter: k.tab, available: k.questions, names: k.names, skillIds: k.skillIds }));
}

// ------------------------------------------------------------------ 2. preview (choose the questions)

export interface PickedSkill { skillId: string; count: number }
export interface PreviewQuestion { id: string; skillId: string; skill: string; grade: number; stem: string; type: string; level: QLevel }
export type Versions = Partial<Record<"SAME" | QLevel, string[]>>;
export interface TestPreview { levelMode: LevelMode; versions: Partial<Record<"SAME" | QLevel, PreviewQuestion[]>>; notes: string[] }

function cleanSkills(skills: PickedSkill[]): PickedSkill[] {
  const seen = new Set<string>();
  const out: PickedSkill[] = [];
  for (const k of skills ?? []) {
    const id = s(k?.skillId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ skillId: id, count: Math.max(1, Math.min(MAX_PER_SKILL, Math.round(Number(k.count) || 5))) });
  }
  if (!out.length) throw new ValidationError("Choose at least one skill.");
  if (out.length > MAX_TEST_QUESTIONS) throw new ValidationError(`Choose at most ${MAX_TEST_QUESTIONS} skills.`);
  return out;
}

/** The questions of each version: per skill, `count` questions (at the version's level, topped up from On Level, then any level). */
export async function previewTest(repo: Repo, actor: Actor, input: { skills: PickedSkill[]; levelMode: LevelMode; seed?: string }): Promise<TestPreview> {
  staff(actor);
  assertCan(actor, "questions:read");
  const skills = cleanSkills(input.skills);
  const mode: LevelMode = input.levelMode === "LEVEL" ? "LEVEL" : "SAME";
  const keys: ("SAME" | QLevel)[] = mode === "SAME" ? ["SAME"] : LEVELS;
  const chosen: Record<string, string[]> = Object.fromEntries(keys.map((k) => [k, []]));
  const notes: string[] = [];
  const all = await skillMeta(repo, actor.schoolId!, skills.map((k) => k.skillId));
  // 👯 one version never holds two copies of the same content (also across skills: copies stored under different
  // skills, grades or map places) — questions/fresh.ts
  const inVersion = Object.fromEntries(keys.map((k) => [k, new Sitting()])) as Record<string, Sitting>;
  for (const k of skills) {
    const meta = all.find((x) => x.id === k.skillId);
    if (!meta) throw new ValidationError("A chosen skill was not found.");
    const pool = await questionsOfSkill(repo, actor.schoolId!, k.skillId);
    if (!pool.length) { notes.push(`${meta.name} has no questions yet.`); continue; }
    const contentOf = await contentKeysForIds(repo, pool.map((p) => p.id));
    for (const key of keys) {
      const seed = `${s(input.seed)}:${k.skillId}:${key}`;
      const order = (lv: QLevel | null) => seededShuffle(pool.filter((p) => !lv || p.level === lv).map((p) => p.id), seed);
      // same for all: a spread of levels; a level version: that level first, then On Level, then the rest
      const ranked = key === "SAME" ? order(null) : [...new Set([...order(key), ...order("ON"), ...order(null)])];
      const take: string[] = [];
      for (const id of ranked) {
        if (take.length >= k.count) break;
        const ck = contentOf.get(id) ?? [];
        if (inVersion[key].has(id, ck)) continue;
        inVersion[key].add(id, ck);
        take.push(id);
      }
      if (take.length < k.count) notes.push(`${meta.name}: only ${take.length} question(s) available${key === "SAME" ? "" : ` for ${LEVEL_NAME[key]}`}.`);
      else if (key !== "SAME" && pool.filter((p) => p.level === key).length < k.count) notes.push(`${meta.name}: not enough ${LEVEL_NAME[key]} questions — topped up from other levels.`);
      chosen[key].push(...take);
    }
  }
  for (const key of keys) if (chosen[key].length > MAX_TEST_QUESTIONS) throw new ValidationError(`A test can have at most ${MAX_TEST_QUESTIONS} questions — lower the numbers.`);
  return { levelMode: mode, versions: await describe(repo, actor, chosen, skills.map((k) => k.skillId)), notes: [...new Set(notes)] };
}

/** The preview rows of chosen question ids (short stems; no answers). */
export async function describe(repo: Repo, actor: Actor, versions: Versions, pickedSkillIds: string[] = []): Promise<TestPreview["versions"]> {
  const ids = [...new Set(Object.values(versions).flat().filter(Boolean) as string[])];
  const [items, qs0] = await Promise.all([loadQuestionItems(repo, ids), ids.length ? repo.findMany("Question", { id: { in: ids } }, { select: ["id", "skillId", "difficultyLevel"] }) : Promise.resolve([] as Row[])]);
  // one question bank: a question of another grade's copy of a picked skill is shown under the picked skill
  const rep = await familyRepresentatives(repo, actor.schoolId!, qs0.map((q) => s(q.skillId)), { ids: pickedSkillIds });
  const qs: Row[] = qs0.map((q) => ({ ...q, skillId: rep.get(s(q.skillId)) ?? s(q.skillId) }));
  const all = await skillMeta(repo, actor.schoolId!, qs.map((q) => s(q.skillId)));
  const out: TestPreview["versions"] = {};
  for (const [key, list] of Object.entries(versions) as ["SAME" | QLevel, string[]][]) {
    out[key] = (list ?? []).map((id) => {
      const it = items.find((x) => x.questionId === id);
      const q = qs.find((x) => x.id === id);
      const k = all.find((x) => x.id === s(q?.skillId));
      const dl = Number(q?.difficultyLevel ?? 4);
      return { id, skillId: s(q?.skillId), skill: k?.name ?? "Skill", grade: k?.grade ?? 0, stem: s(it?.stem).slice(0, 240), type: s(it?.type), level: (dl <= 3 ? "BELOW" : dl >= 5 ? "ABOVE" : "ON") as QLevel };
    }).filter((x) => all.some((k) => k.id === x.skillId)); // this school's questions only
  }
  return out;
}

// ------------------------------------------------------------------ 3. assign

/** The skill rows ordered by how many of the questions are stored on them (most first). */
function majorityRows(skillIds: string[]): string[] {
  const n = new Map<string, number>();
  for (const id of skillIds) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export interface AssignTestInput {
  classId: string; type: TestType | string; title?: string; levelMode?: LevelMode;
  /** empty = the whole class; one id = one student; several = a group */
  studentIds?: string[];
  openAt?: Date | null; dueAt?: Date | null; timeLimitMin?: number | null; shuffle?: boolean;
  /** the previewed questions (after removals) */
  questions: Versions;
  /** one question bank (optional): the skills the teacher picked, so pooled questions count for them */
  skillIds?: string[];
  templateId?: string | null;
  /** points per question (questionId → points); missing questions count 1 point */
  marks?: Record<string, number> | null;
}

/** Highest points one question may carry. */
export const MAX_QUESTION_MARKS = 100;
/** Points rounded to two decimals (0.5, 1.25, 3.33…). */
const roundMark = (n: number) => Math.round(n * 100) / 100;

/**
 * The marks of a test's questions, cleaned: only the test's questions, numbers 0–100 (two decimals). Null when every
 * question has the default 1 point (nothing to store).
 */
export function cleanMarks(marks: unknown, ids: string[]): Record<string, number> | null {
  if (!marks || typeof marks !== "object" || Array.isArray(marks)) return null;
  const raw = marks as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const id of new Set(ids)) {
    if (raw[id] === undefined || raw[id] === null || raw[id] === "") continue;
    const n = Number(raw[id]);
    if (!Number.isFinite(n) || n < 0 || n > MAX_QUESTION_MARKS) throw new ValidationError(`Marks must be 0 to ${MAX_QUESTION_MARKS} for each question.`);
    out[id] = roundMark(n);
  }
  return Object.values(out).some((v) => v !== 1) ? out : null;
}

/**
 * Total marks shared out over the questions: total / number each (two decimals); the last question takes the
 * rounding difference, so the marks always add up to the total.
 */
export function spreadMarks(ids: string[], total: number): Record<string, number> {
  const list = [...new Set(ids)];
  if (!list.length) return {};
  const t = roundMark(Math.max(0, Math.min(MAX_QUESTION_MARKS * list.length, Number(total) || list.length)));
  const each = roundMark(t / list.length);
  const out: Record<string, number> = Object.fromEntries(list.map((id) => [id, each]));
  out[list[list.length - 1]] = roundMark(t - each * (list.length - 1));
  return out;
}
/** A question's points (1 when the test has no marks for it). */
export const markOf = (marks: Record<string, number> | null | undefined, id: string): number => (marks && typeof marks[id] === "number" ? marks[id] : 1);

/** Who built it: the teacher; for an admin, the class's teacher. */
async function testTeacher(repo: Repo, actor: Actor, classId: string): Promise<Row | null> {
  const own = await repo.findUnique("Teacher", { userId: actor.userId });
  if (own || actor.role === "TEACHER") return own ?? null;
  const ct = (await repo.findMany("ClassTeacher", { classId }, { select: ["teacherId"] }))[0];
  return ct ? await repo.findUnique("Teacher", { id: ct.teacherId }) : null;
}

export async function assignTest(repo: Repo, actor: Actor, input: AssignTestInput, now = new Date()): Promise<{ testId: string; students: number; sets: number }> {
  staff(actor);
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, s(input.classId)); // teacher: own classes only
  const type = asTestType(input.type);
  const title = s(input.title).replace(/\s+/g, " ").trim().slice(0, 150) || autoTestName(type, await schoolWeek(repo, s(klass.schoolId), now));
  if (!title) throw new ValidationError("Type a name for the test.");
  const levelMode: LevelMode = input.levelMode === "LEVEL" ? "LEVEL" : input.levelMode === "SAME" ? "SAME" : defaultLevelMode(type);
  const limit = input.timeLimitMin === null || input.timeLimitMin === undefined || s(input.timeLimitMin) === "" ? null : Math.round(Number(input.timeLimitMin));
  if (limit !== null && (!Number.isFinite(limit) || limit < 1 || limit > MAX_TIME_LIMIT_MIN)) throw new ValidationError(`The time limit must be 1 to ${MAX_TIME_LIMIT_MIN} minutes.`);
  const openAt = d(input.openAt), dueAt = d(input.dueAt);
  const clean = (l: unknown) => [...new Set((Array.isArray(l) ? l : []).map(s).filter(Boolean))];
  const versions: Versions = levelMode === "SAME" ? { SAME: clean(input.questions?.SAME) } : { BELOW: clean(input.questions?.BELOW), ON: clean(input.questions?.ON), ABOVE: clean(input.questions?.ABOVE) };
  if (!Object.values(versions).some((l) => l && l.length)) throw new ValidationError("The test has no questions: choose skills and press Preview.");
  const teacher = await testTeacher(repo, actor, s(klass.id));
  if (!teacher) throw new ForbiddenError("This class has no teacher yet.");
  // who: the class's students (a chosen student or group must be in the class)
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const chosen = clean(input.studentIds);
  for (const id of chosen) if (!members.includes(id)) throw new ForbiddenError("You can only assign tests to students in your class.");
  const recipients = chosen.length ? chosen : members;
  if (!recipients.length) throw new ValidationError("This class has no students yet.");
  // groups: everyone, or each student at their level (from all their data; On Level without data)
  const groups: { key: "SAME" | QLevel; students: string[] }[] = [];
  if (levelMode === "SAME") groups.push({ key: "SAME", students: recipients });
  else {
    const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
    const lv = await evidenceLevels(repo, s(klass.schoolId), recipients, grade, {}, now);
    for (const key of LEVELS) {
      const who = recipients.filter((id) => (s(lv.get(id)?.level) || "ON") === key);
      if (who.length) groups.push({ key, students: who });
    }
  }
  const qOf = (key: "SAME" | QLevel): string[] => { const l = versions[key] ?? []; return l.length ? l : versions.ON?.length ? versions.ON : (Object.values(versions).find((x) => x && x.length) ?? []); };
  const allIds = [...new Set(groups.flatMap((g) => qOf(g.key)))];
  const qRows = await repo.findMany("Question", { id: { in: allIds } }, { select: ["id", "skillId"] });
  // one question bank: the questions of one skill family count for ONE skill — the picked one (skillIds), else the
  // class's grade copy, else the family's row most of the test's questions come from
  const classGrade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const first = await familyRepresentatives(repo, s(klass.schoolId), qRows.map((q) => s(q.skillId)), { ids: input.skillIds ?? [], grade: classGrade });
  const firstOf = qRows.map((q) => first.get(s(q.skillId)) ?? s(q.skillId));
  const second = await familyRepresentatives(repo, s(klass.schoolId), firstOf, { ids: [...(input.skillIds ?? []), ...majorityRows(firstOf)] });
  const repOf = new Map(qRows.map((q, n) => [s(q.skillId), second.get(firstOf[n]) ?? firstOf[n]]));
  const skillIds = [...new Set(qRows.map((q) => repOf.get(s(q.skillId)) ?? s(q.skillId)))];
  const marks = cleanMarks(input.marks, allIds);
  const test = await repo.create("TeacherTest", {
    schoolId: klass.schoolId, classId: klass.id, teacherId: teacher.id, createdById: actor.userId, title, testType: type, levelMode, skillIds, marks,
    openAt, dueAt, timeLimitMin: limit, shuffle: Boolean(input.shuffle), templateId: input.templateId ? s(input.templateId) : null, createdAt: now,
  });
  const made: string[] = [];
  try {
    for (const g of groups) {
      const r = await assignQuestions(repo, actor, {
        classId: s(klass.id), studentIds: g.students, questionIds: qOf(g.key), title: g.key === "SAME" ? title : `${title} (${LEVEL_NAME[g.key]})`, exactTitle: true,
        startAt: openAt, dueAt, curriculumPlanId: TEST_MARK, silent: true, track: type === "MAP" ? "MAP" : "CURRICULUM", test: true,
      }, now);
      made.push(r.assignmentId);
    }
  } catch (e) {
    // nothing half-made stays visible
    if (made.length) await repo.updateMany("Assignment", { id: { in: made } }, { deletedAt: now });
    await repo.updateMany("TeacherTest", { id: test.id }, { deletedAt: now });
    throw e;
  }
  await repo.updateMany("Assignment", { id: { in: made } }, { testId: test.id, shuffle: Boolean(input.shuffle) });
  const sets = await repo.findMany("Assignment", { id: { in: made } }, { select: ["assessmentId"] });
  await repo.updateMany("Assessment", { id: { in: sets.map((x) => s(x.assessmentId)) } }, { timeLimitMin: limit });
  const users = await repo.findMany("Student", { id: { in: recipients } }, { select: ["userId"] });
  const due = dueAt ? ` Due ${dueAt.toISOString().slice(0, 10)}.` : "";
  await repo.createMany("Notification", users.map((u) => ({ userId: u.userId, type: "NEW_ASSIGNMENT", title: "New test in My Tests", body: `${title} (${type === "CUSTOM" ? title : TEST_TYPE_NAME[type]}).${due}`, link: "/student/tests", createdAt: now })));
  await audit(repo, { actorId: actor.userId, action: "test.assign", entityType: "TeacherTest", entityId: s(test.id), after: { classId: klass.id, type, levelMode, students: recipients.length, sets: made.length, timeLimitMin: limit, shuffle: Boolean(input.shuffle) } });
  return { testId: s(test.id), students: recipients.length, sets: made.length };
}

// ------------------------------------------------------------------ 4. templates

/** `mapQuestionIds`: the Curriculum Map questions the teacher picked (in order), kept with the draft. */
export interface TemplateSpec { skills: PickedSkill[]; levelMode: LevelMode; timeLimitMin: number | null; shuffle: boolean; questions: Versions; mapQuestionIds?: string[]; marks?: Record<string, number> | null }
/** Rows of TestTemplate that are not test templates (skill-assignment drafts, "Preview as student" records). */
const NOT_TEMPLATES = new Set(["ASSIGN_DRAFT", "TEST_PREVIEW"]);
export interface TemplateRow { id: string; title: string; type: TestType; typeName: string; skills: number; questions: number; updatedAt: string }

export async function saveTemplate(repo: Repo, actor: Actor, input: { id?: string | null; title: string; type: TestType | string; spec: TemplateSpec }, now = new Date()): Promise<string> {
  staff(actor);
  const title = s(input.title).replace(/\s+/g, " ").trim().slice(0, 150);
  if (!title) throw new ValidationError("Give the template a name.");
  const type = asTestType(input.type);
  const sp = input.spec ?? ({} as TemplateSpec);
  const mapQuestionIds = [...new Set((Array.isArray(sp.mapQuestionIds) ? sp.mapQuestionIds : []).map(s).filter(Boolean))].slice(0, MAX_TEST_QUESTIONS);
  const hasQuestions = mapQuestionIds.length > 0 || Object.values(sp.questions ?? {}).some((l) => Array.isArray(l) && l.length > 0);
  const spec: TemplateSpec = {
    // a test made only of Curriculum Map questions has no skills
    skills: (sp.skills ?? []).length || !hasQuestions ? cleanSkills(sp.skills) : [], mapQuestionIds, levelMode: sp.levelMode === "LEVEL" ? "LEVEL" : "SAME",
    timeLimitMin: sp.timeLimitMin ? Math.max(1, Math.min(MAX_TIME_LIMIT_MIN, Math.round(Number(sp.timeLimitMin)))) : null, shuffle: Boolean(sp.shuffle),
    questions: Object.fromEntries(Object.entries(sp.questions ?? {}).filter(([k]) => ["SAME", ...LEVELS].includes(k)).map(([k, v]) => [k, [...new Set((Array.isArray(v) ? v : []).map(s).filter(Boolean))].slice(0, MAX_TEST_QUESTIONS)])),
  };
  const marks = cleanMarks(sp.marks, [...mapQuestionIds, ...Object.values(spec.questions).flatMap((l) => l ?? [])]);
  if (marks) spec.marks = marks;
  if (input.id) {
    const t = await ownTemplate(repo, actor, s(input.id));
    await repo.updateMany("TestTemplate", { id: t.id }, { title, testType: type, spec, updatedAt: now });
    return s(t.id);
  }
  const row = await repo.create("TestTemplate", { schoolId: actor.schoolId, createdById: actor.userId, title, testType: type, spec, createdAt: now, updatedAt: now });
  return s(row.id);
}

async function ownTemplate(repo: Repo, actor: Actor, id: string): Promise<Row> {
  staff(actor);
  const t = await repo.findUnique("TestTemplate", { id });
  if (!t || t.deletedAt || NOT_TEMPLATES.has(s(t.testType)) || s(t.schoolId) !== s(actor.schoolId) || s(t.createdById) !== actor.userId) throw new ForbiddenError("Template not found.");
  return t;
}

export async function openTemplate(repo: Repo, actor: Actor, id: string): Promise<{ id: string; title: string; type: TestType; spec: TemplateSpec }> {
  const t = await ownTemplate(repo, actor, id);
  return { id: s(t.id), title: s(t.title), type: asTestType(t.testType), spec: json<TemplateSpec>(t.spec, { skills: [], levelMode: "SAME", timeLimitMin: null, shuffle: false, questions: {} }) };
}

export async function listTemplates(repo: Repo, actor: Actor): Promise<TemplateRow[]> {
  staff(actor);
  const rows = await repo.findMany("TestTemplate", { schoolId: actor.schoolId, createdById: actor.userId, deletedAt: null }, { orderBy: [{ field: "updatedAt", dir: "desc" }], take: 100 });
  // (📝 Review & Send drafts of skill assignments share this table; they are not test templates)
  return rows.filter((t) => !NOT_TEMPLATES.has(s(t.testType))).map((t) => {
    const sp = json<TemplateSpec>(t.spec, { skills: [], levelMode: "SAME", timeLimitMin: null, shuffle: false, questions: {} });
    const type = asTestType(t.testType);
    return { id: s(t.id), title: s(t.title), type, typeName: TEST_TYPE_NAME[type], skills: sp.skills.length, questions: Math.max(0, ...Object.values(sp.questions ?? {}).map((l) => (l ?? []).length)), updatedAt: iso(t.updatedAt) ?? "" };
  });
}

export async function deleteTemplate(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  const t = await ownTemplate(repo, actor, id);
  await repo.updateMany("TestTemplate", { id: t.id }, { deletedAt: now }); // kept (soft delete)
}

// ------------------------------------------------------------------ teacher: the tests list

export interface TestRow { id: string; title: string; type: TestType; typeName: string; classId: string; className: string; createdAt: string; dueAt: string | null; assigned: number; completed: number }

/** The tests of the teacher's own classes (admin: the school's), newest first (at most 100). */
export async function teacherTests(repo: Repo, actor: Actor, classId?: string): Promise<TestRow[]> {
  staff(actor);
  const classes = await accessibleClasses(repo, actor);
  const ids = classes.map((c) => s(c.id)).filter((id) => !classId || id === classId);
  if (!ids.length) return [];
  const tests = await repo.findMany("TeacherTest", { classId: { in: ids }, deletedAt: null }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 });
  if (!tests.length) return [];
  const sets = await repo.findMany("Assignment", { testId: { in: tests.map((t) => s(t.id)) }, deletedAt: null }, { select: ["id", "testId"] });
  const rows = sets.length ? await inBatches(sets.map((x) => s(x.id)), 500, (c) => repo.findMany("AssignmentStudent", { assignmentId: { in: c } }, { select: ["assignmentId", "status"] })) : [];
  const testOf = new Map(sets.map((x) => [s(x.id), s(x.testId)]));
  const count = new Map<string, { assigned: number; completed: number }>();
  for (const r of rows) { const t = testOf.get(s(r.assignmentId))!; const c = count.get(t) ?? { assigned: 0, completed: 0 }; c.assigned++; if (r.status === "COMPLETED") c.completed++; count.set(t, c); }
  return tests.map((t) => {
    const type = asTestType(t.testType);
    return { id: s(t.id), title: s(t.title), type, typeName: TEST_TYPE_NAME[type], classId: s(t.classId), className: s(classes.find((c) => c.id === t.classId)?.name), createdAt: iso(t.createdAt) ?? "", dueAt: iso(t.dueAt), ...(count.get(s(t.id)) ?? { assigned: 0, completed: 0 }) };
  });
}

// ------------------------------------------------------------------ 5. results by skill + Reteach

export interface SkillResult { skillId: string; name: string; grade: number; questions: number; avgPct: number | null; below: { id: string; name: string; pct: number }[] }
export interface StudentResult { id: string; name: string; status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE"; finished: boolean; correct: number; total: number; pct: number | null; completedAt: string | null; assignmentId: string; bySkill: Record<string, { correct: number; total: number; pct: number }>;
  /** marks earned / the student's version's total marks (every question 1 point unless the test has marks) */
  points: number; maxPoints: number }
export interface TestResults {
  test: { id: string; title: string; type: TestType; typeName: string; classId: string; className: string; levelMode: LevelMode; openAt: string | null; dueAt: string | null; timeLimitMin: number | null; shuffle: boolean; reteachAt: string | null; nafsPlanAt: string | null; createdAt: string };
  finished: number; notFinished: number; avgPct: number | null;
  skills: SkillResult[]; students: StudentResult[];
  /** the test has its own marks per question (shown as "12 / 20 marks"); null = 1 point each */
  marks: Record<string, number> | null;
}

async function testFor(repo: Repo, actor: Actor, testId: string): Promise<{ t: Row; klass: Row }> {
  staff(actor);
  const t = await repo.findUnique("TeacherTest", { id: testId });
  if (!t || t.deletedAt || s(t.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Test not found.");
  const klass = await assertClassAccess(repo, actor, s(t.classId)); // a teacher sees only their own classes' tests
  return { t, klass };
}

export async function testResults(repo: Repo, actor: Actor, testId: string, now = new Date()): Promise<TestResults> {
  const { t, klass } = await testFor(repo, actor, testId);
  const sets = await repo.findMany("Assignment", { testId: t.id, deletedAt: null });
  await refreshQuestionSets(repo, sets, null, now);
  const aIds = sets.map((a) => s(a.id));
  const [rows, sessions, aqs] = await Promise.all([
    aIds.length ? repo.findMany("AssignmentStudent", { assignmentId: { in: aIds } }) : Promise.resolve([] as Row[]),
    aIds.length ? repo.findMany("PracticeSession", { assignmentId: { in: aIds }, mode: "TEACHER_QUIZ" }, { select: ["id", "assignmentId", "studentId"] }) : Promise.resolve([] as Row[]),
    sets.length ? repo.findMany("AssessmentQuestion", { assessmentId: { in: sets.map((a) => s(a.assessmentId)) } }, { select: ["assessmentId", "questionId"] }) : Promise.resolve([] as Row[]),
  ]);
  const attempts = sessions.length ? await inBatches(sessions.map((x) => s(x.id)), 300, (c) => repo.findMany("QuestionAttempt", { sessionId: { in: c } }, { select: ["sessionId", "questionId", "isCorrect"] })) : [];
  const qIds = [...new Set(aqs.map((x) => s(x.questionId)))];
  const qRows = qIds.length ? await inBatches(qIds, 500, (c) => repo.findMany("Question", { id: { in: c } }, { select: ["id", "skillId"] })) : [];
  // one question bank: each question counts for the test's own skill of its family
  const repOf = await familyRepresentatives(repo, s(actor.schoolId), qRows.map((q) => s(q.skillId)), { ids: json<string[]>(t.skillIds, []) });
  const skillOfQ = new Map(qRows.map((q) => [s(q.id), repOf.get(s(q.skillId)) ?? s(q.skillId)]));
  const studentIds = [...new Set(rows.map((r) => s(r.studentId)))];
  const [students, skills] = await Promise.all([
    studentIds.length ? repo.findMany("Student", { id: { in: studentIds } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
    skillMeta(repo, actor.schoolId!, json<string[]>(t.skillIds, [])),
  ]);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = (id: string) => s(users.find((u) => u.id === students.find((x) => x.id === id)?.userId)?.displayName ?? "Student");
  const setOf = new Map(sets.map((a) => [s(a.id), a]));
  const marks = json<Record<string, number> | null>(t.marks, null);
  const qsOfSet = new Map<string, string[]>();
  for (const x of aqs) { const l = qsOfSet.get(s(x.assessmentId)) ?? []; l.push(s(x.questionId)); qsOfSet.set(s(x.assessmentId), l); }
  const out: StudentResult[] = rows.map((r) => {
    const a = setOf.get(s(r.assignmentId))!;
    const qs = qsOfSet.get(s(a.assessmentId)) ?? [];
    const ses = sessions.find((x) => x.assignmentId === r.assignmentId && x.studentId === r.studentId);
    const mine = ses ? attempts.filter((x) => x.sessionId === ses.id) : [];
    const finished = r.status === "COMPLETED";
    const bySkill: StudentResult["bySkill"] = {};
    for (const q of qs) {
      const k = skillOfQ.get(q) ?? "";
      const b = bySkill[k] ?? { correct: 0, total: 0, pct: 0 };
      b.total++;
      if (mine.some((x) => s(x.questionId) === q && x.isCorrect)) b.correct++;
      bySkill[k] = b;
    }
    for (const b of Object.values(bySkill)) b.pct = Math.round((100 * b.correct) / Math.max(1, b.total));
    const correct = mine.filter((x) => x.isCorrect).length;
    const right = new Set(mine.filter((x) => x.isCorrect).map((x) => s(x.questionId)));
    const maxPoints = roundMark(qs.reduce((a, q) => a + markOf(marks, q), 0));
    const points = roundMark(qs.filter((q) => right.has(q)).reduce((a, q) => a + markOf(marks, q), 0));
    return {
      points: finished ? points : 0, maxPoints,
      id: s(r.studentId), name: nameOf(s(r.studentId)), status: r.status as StudentResult["status"], finished, correct, total: qs.length,
      pct: finished ? Math.round((100 * correct) / Math.max(1, qs.length)) : null, completedAt: iso(r.completedAt), assignmentId: s(r.assignmentId), bySkill: finished ? bySkill : {},
    };
  }).sort((x, y) => x.name.localeCompare(y.name));
  const done = out.filter((x) => x.finished);
  const skillIds = json<string[]>(t.skillIds, []);
  const skillRows: SkillResult[] = skillIds.map((id) => {
    const k = skills.find((x) => x.id === id);
    const marks = done.filter((x) => x.bySkill[id]);
    const below = marks.filter((x) => x.bySkill[id].pct < RETEACH_PCT).map((x) => ({ id: x.id, name: x.name, pct: x.bySkill[id].pct }));
    const total = Math.max(0, ...out.map((x) => (x.bySkill[id]?.total ?? 0)), ...[...qsOfSet.values()].map((l) => l.filter((q) => skillOfQ.get(q) === id).length));
    return { skillId: id, name: k?.name ?? "Skill", grade: k?.grade ?? 0, questions: total, avgPct: marks.length ? Math.round(marks.reduce((a, x) => a + x.bySkill[id].pct, 0) / marks.length) : null, below };
  });
  const type = asTestType(t.testType);
  return {
    test: {
      id: s(t.id), title: s(t.title), type, typeName: TEST_TYPE_NAME[type], classId: s(t.classId), className: s(klass.name), levelMode: t.levelMode === "LEVEL" ? "LEVEL" : "SAME",
      openAt: iso(t.openAt), dueAt: iso(t.dueAt), timeLimitMin: t.timeLimitMin ? Number(t.timeLimitMin) : null, shuffle: Boolean(t.shuffle), reteachAt: iso(t.reteachAt), nafsPlanAt: iso(t.nafsPlanAt), createdAt: iso(t.createdAt) ?? "",
    },
    finished: done.length, notFinished: out.length - done.length,
    avgPct: done.length ? Math.round(done.reduce((a, x) => a + (x.pct ?? 0), 0) / done.length) : null,
    skills: skillRows, students: out, marks,
  };
}

/**
 * The shared Reteach step (Assessments and the Live Challenge results): each skill goes to the listed students' My
 * Work with the existing assignSkill (own classes only — assignSkill checks), unless the student already has it open;
 * students who left the class are skipped.
 */
export async function assignReteach(repo: Repo, actor: Actor, input: { classId: string; note: string; track: "MAP" | "NAFS" | "CURRICULUM"; skills: { skillId: string; below: { id: string; name: string }[] }[] }, now = new Date()): Promise<{ assigned: number; who: Set<string>; skipped: Set<string> }> {
  assertCan(actor, "assignments:create");
  const members = new Set((await repo.findMany("ClassMembership", { classId: input.classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
  let assigned = 0;
  const who = new Set<string>();
  const skipped = new Set<string>();
  for (const k of input.skills) {
    if (!k.below.length) continue;
    const need: string[] = [];
    for (const st of k.below) {
      if (!members.has(st.id)) { skipped.add(st.name); continue; }
      if (!(await openAssignmentFor(repo, st.id, k.skillId, now))) need.push(st.id);
    }
    if (!need.length) continue;
    await assignSkill(repo, actor, { classId: input.classId, skillId: k.skillId, studentIds: need, note: input.note, track: input.track }, now);
    assigned++;
    for (const id of need) who.add(id);
  }
  return { assigned, who, skipped };
}

/**
 * 🔁 Reteach: every skill where a student scored under 70% goes to THAT student's My Work (the existing skill
 * assignment, note "Reteach: <test>"), whatever grade the skill belongs to (any grade's skill may be assigned to the
 * teacher's own students). A skill the student already has open is not assigned twice; a student who has left the
 * class since the test is left out (reported in `skipped`).
 */
export async function reteach(repo: Repo, actor: Actor, testId: string, now = new Date()): Promise<{ assigned: number; students: number; skipped: string[] }> {
  assertCan(actor, "assignments:create");
  const r = await testResults(repo, actor, testId, now);
  const type = r.test.type;
  const note = `Reteach: ${r.test.title}`;
  const track = type === "MAP" ? "MAP" : type === "NAFS" ? "NAFS" : "CURRICULUM";
  const { assigned, who, skipped } = await assignReteach(repo, actor, { classId: r.test.classId, note, track, skills: r.skills }, now);
  await repo.updateMany("TeacherTest", { id: testId }, { reteachAt: now });
  await audit(repo, { actorId: actor.userId, action: "test.reteach", entityType: "TeacherTest", entityId: testId, after: { assigned, students: who.size, skipped: skipped.size } });
  return { assigned, students: who.size, skipped: [...skipped] };
}

// ------------------------------------------------------------------ NAFS tests → personal NAFS plans (Plans)

/**
 * After a NAFS practice test: each student who finished gets the skills they scored under 70% on as a personal NAFS
 * plan (My Plans + My Work, tag NAFS) — PLANS' personalizeNafsPlanFromResults, fed with this test's results by skill
 * (unanswered questions count as wrong). Once per test (TeacherTest.nafsPlanAt). Own classes only.
 */
export async function personalizeNafsFromTest(repo: Repo, actor: Actor, testId: string, now = new Date()): Promise<{ plans: number; students: number; skills: number; already: boolean }> {
  assertCan(actor, "assignments:create");
  const r = await testResults(repo, actor, testId, now);
  if (r.test.type !== "NAFS") throw new ValidationError("Only a NAFS test personalizes the NAFS plan.");
  const row = await repo.findUnique("TeacherTest", { id: testId });
  if (row?.nafsPlanAt) return { plans: 0, students: 0, skills: 0, already: true };
  if (!r.finished) throw new ValidationError("No student has finished this test yet.");
  const results = r.students.filter((x) => x.finished).flatMap((x) => Object.entries(x.bySkill).map(([skillId, b]) => ({ studentId: x.id, skillId, correct: b.correct, total: b.total })));
  const { personalizeNafsPlanFromResults } = await import("../plans/wizard");
  const p = await personalizeNafsPlanFromResults(repo, actor, { testId, results, threshold: RETEACH_PCT }, now);
  await repo.updateMany("TeacherTest", { id: testId }, { nafsPlanAt: now });
  await audit(repo, { actorId: actor.userId, action: "test.nafs_plan", entityType: "TeacherTest", entityId: testId, after: { plans: p.plans.length, students: p.studentsWithGaps } });
  return { plans: p.plans.length, students: p.studentsWithGaps, skills: p.plans.reduce((a, x) => a + x.skills, 0), already: false };
}

/** Most NAFS tests the daily job personalizes per school per run (bounded work on a small server). */
export const AUTO_NAFS_PER_RUN = 25;
/** NAFS tests older than this are no longer checked by the daily job (the teacher can still press the button). */
export const AUTO_NAFS_DAYS = 120;

/**
 * Daily job: a NAFS test whose due date has passed, or that every student has submitted, gets its personal NAFS plans
 * automatically (as the teacher who built it). Bounded: at most AUTO_NAFS_PER_RUN tests, oldest first.
 */
export async function autoPersonalizeNafsTests(repo: Repo, schoolId: string, now = new Date()): Promise<{ checked: number; personalized: number }> {
  // tests of the last AUTO_NAFS_DAYS days only (an old test nobody finished never blocks newer ones), oldest first
  const since = new Date(now.getTime() - AUTO_NAFS_DAYS * 86_400_000);
  const tests = await repo.findMany("TeacherTest", { schoolId, testType: "NAFS", nafsPlanAt: null, deletedAt: null, createdAt: { gte: since } }, { select: ["id", "createdById", "dueAt"], orderBy: [{ field: "createdAt", dir: "asc" }], take: AUTO_NAFS_PER_RUN * 4 });
  const { resolveActor } = await import("../auth/actor");
  let personalized = 0, checked = 0;
  for (const t of tests) {
    if (personalized >= AUTO_NAFS_PER_RUN) break;
    checked++;
    const sets = await repo.findMany("Assignment", { testId: t.id, deletedAt: null }, { select: ["id"] });
    if (!sets.length) continue;
    const rows = await repo.findMany("AssignmentStudent", { assignmentId: { in: sets.map((a) => s(a.id)) } }, { select: ["status", "completedAt"] });
    const allIn = rows.length > 0 && rows.every((x) => s(x.status) === "COMPLETED" || Boolean(x.completedAt));
    const due = t.dueAt ? new Date(String(t.dueAt instanceof Date ? t.dueAt.toISOString() : t.dueAt)) : null;
    if (!allIn && !(due && due.getTime() < now.getTime())) continue;
    if (!rows.some((x) => s(x.status) === "COMPLETED" || Boolean(x.completedAt))) { await repo.updateMany("TeacherTest", { id: t.id }, { nafsPlanAt: now }); continue; } // nobody took it: nothing to personalize
    const user = await repo.findUnique("User", { id: t.createdById });
    if (!user || user.deletedAt || user.isActive === false || user.isActive === 0) continue;
    try {
      const actor = await resolveActor(repo, user);
      await personalizeNafsFromTest(repo, actor, s(t.id), now);
      personalized++;
    } catch (e) {
      if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; // e.g. the teacher no longer teaches the class
    }
  }
  return { checked, personalized };
}

// ------------------------------------------------------------------ student: My Tests

export interface MyTest { assignmentId: string; title: string; tag: string; type: TestType; openAt: string | null; dueAt: string | null; startsLater: boolean; overdue: boolean; timeLimitMin: number | null; questions: number; status: string; correct: number; pct: number | null; completedAt: string | null }
export interface MyTests { toDo: MyTest[]; completed: MyTest[] }

async function myTestRows(repo: Repo, studentId: string): Promise<{ rows: Row[]; sets: Row[] }> {
  const rows = await repo.findMany("AssignmentStudent", { studentId });
  if (!rows.length) return { rows, sets: [] };
  const sets = (await inBatches(rows.map((r) => s(r.assignmentId)), 500, (c) => repo.findMany("Assignment", { id: { in: c }, curriculumPlanId: TEST_MARK, deletedAt: null })))
    .filter((a) => a.testId);
  return { rows, sets };
}

/** The student's tests: To Do (not taken yet, with the due date) and Completed (score + date). */
export async function myTests(repo: Repo, actor: Actor, now = new Date()): Promise<MyTests> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students have My Tests.");
  const studentId = actor.studentId;
  const { sets } = await myTestRows(repo, studentId);
  if (!sets.length) return { toDo: [], completed: [] };
  await refreshQuestionSets(repo, sets, [studentId], now);
  const [fresh, tests, aqs, sessions] = await Promise.all([
    repo.findMany("AssignmentStudent", { studentId, assignmentId: { in: sets.map((a) => s(a.id)) } }),
    repo.findMany("TeacherTest", { id: { in: [...new Set(sets.map((a) => s(a.testId)))] } }),
    repo.findMany("AssessmentQuestion", { assessmentId: { in: sets.map((a) => s(a.assessmentId)) } }, { select: ["assessmentId"] }),
    repo.findMany("PracticeSession", { studentId, assignmentId: { in: sets.map((a) => s(a.id)) }, mode: "TEACHER_QUIZ" }, { select: ["assignmentId", "correctCount"] }),
  ]);
  const size = new Map<string, number>();
  for (const x of aqs) size.set(s(x.assessmentId), (size.get(s(x.assessmentId)) ?? 0) + 1);
  const list: MyTest[] = sets.map((a) => {
    const r = fresh.find((x) => x.assignmentId === a.id)!;
    const t = tests.find((x) => x.id === a.testId);
    const type = asTestType(t?.testType);
    const n = size.get(s(a.assessmentId)) ?? 0;
    const correct = Number(sessions.find((x) => x.assignmentId === a.id)?.correctCount ?? 0);
    const done = r?.status === "COMPLETED";
    const openAt = d(a.startAt), dueAt = d(a.dueAt);
    return {
      assignmentId: s(a.id), title: hideLevels(s(t?.title ?? a.title)), tag: type === "CUSTOM" ? hideLevels(s(t?.title ?? a.title)) : TEST_TYPE_NAME[type], type,
      openAt: iso(openAt), dueAt: iso(dueAt), startsLater: Boolean(openAt && openAt > now), overdue: Boolean(!done && dueAt && dueAt < now),
      timeLimitMin: t?.timeLimitMin ? Number(t.timeLimitMin) : null, questions: n, status: s(r?.status), correct,
      pct: done ? Math.round((100 * correct) / Math.max(1, n)) : null, completedAt: iso(r?.completedAt),
    };
  });
  return {
    toDo: list.filter((x) => x.status !== "COMPLETED").sort((x, y) => (x.dueAt ?? "9").localeCompare(y.dueAt ?? "9")),
    completed: list.filter((x) => x.status === "COMPLETED").sort((x, y) => (y.completedAt ?? "").localeCompare(x.completedAt ?? "")),
  };
}

/** The badge on My Tests (for the student home page): tests still to do that are open now. */
export async function testsToDoCount(repo: Repo, actor: Actor, now = new Date()): Promise<number> {
  if (actor.role !== "STUDENT" || !actor.studentId) return 0;
  const { rows, sets } = await myTestRows(repo, actor.studentId);
  const done = new Set(rows.filter((r) => r.status === "COMPLETED").map((r) => s(r.assignmentId)));
  return sets.filter((a) => !done.has(s(a.id)) && !(d(a.startAt) && d(a.startAt)! > now)).length;
}

export interface ReviewItem { n: number; questionId: string; skill: string; stem: string; passageTitle: string | null; yourAnswer: string; correctAnswer: string; correct: boolean; answered: boolean; why: string }
export interface TestReview { assignmentId: string; title: string; tag: string; student: string; correct: number; total: number; pct: number; completedAt: string | null; items: ReviewItem[] }

/**
 * Review of a completed test: each question with the student's answer and the correct one. A student sees only their
 * own (after finishing); a teacher only their own class's students; the admin the school's.
 */
export async function testReview(repo: Repo, actor: Actor, assignmentId: string, studentIdArg?: string): Promise<TestReview> {
  const a = await repo.findUnique("Assignment", { id: assignmentId });
  if (!a || a.deletedAt || !a.testId || !a.assessmentId) throw new ForbiddenError("Test not found.");
  let studentId: string;
  if (actor.role === "STUDENT") {
    if (!actor.studentId || (studentIdArg && studentIdArg !== actor.studentId)) throw new ForbiddenError("You can only see your own tests.");
    studentId = actor.studentId;
  } else {
    staff(actor);
    await assertClassAccess(repo, actor, s(a.classId));
    studentId = s(studentIdArg);
  }
  const row = (await repo.findMany("AssignmentStudent", { assignmentId, studentId }))[0];
  if (!row) throw new ForbiddenError("This test was not assigned to that student.");
  if (row.status !== "COMPLETED") throw new ValidationError("The review opens when the test is finished.");
  const [t, aqs, ses, st] = await Promise.all([
    repo.findUnique("TeacherTest", { id: a.testId }),
    repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId }, { select: ["questionId", "order"] }),
    repo.findMany("PracticeSession", { assignmentId, studentId, mode: "TEACHER_QUIZ" }, { select: ["id"] }),
    repo.findUnique("Student", { id: studentId }),
  ]);
  const order = aqs.sort((x, y) => Number(x.order) - Number(y.order)).map((x) => s(x.questionId));
  const attempts = ses.length ? await repo.findMany("QuestionAttempt", { sessionId: ses[0].id }, { select: ["questionId", "response", "isCorrect"] }) : [];
  const [items, user, skills] = await Promise.all([loadQuestionItems(repo, order), st ? repo.findUnique("User", { id: st.userId }) : Promise.resolve(null), repo.findMany("Question", { id: { in: order } }, { select: ["id", "skillId"] })]);
  const skillRows = skills.length ? await repo.findMany("Skill", { id: { in: [...new Set(skills.map((x) => s(x.skillId)))] } }, { select: ["id", "name"] }) : [];
  const shown = testOrder(a, order, studentId);
  const reviewItems: ReviewItem[] = shown.map((qid, i) => {
    const it = items.find((x) => x.questionId === qid);
    const at = attempts.find((x) => s(x.questionId) === qid);
    const resp = json<{ value?: unknown }>(at?.response, {});
    return {
      n: i + 1, questionId: qid, skill: s(skillRows.find((k) => k.id === skills.find((x) => x.id === qid)?.skillId)?.name), stem: s(it?.stem), passageTitle: it?.passageTitle ?? null,
      yourAnswer: at && it ? studentAnswerText(it, resp.value) : "", correctAnswer: it ? correctAnswerText(it) : "", correct: Boolean(at?.isCorrect), answered: Boolean(at),
      why: s(it?.explanation?.whyCorrect),
    };
  });
  const correct = reviewItems.filter((x) => x.correct).length;
  const type = asTestType(t?.testType);
  return {
    assignmentId, title: hideLevels(s(t?.title ?? a.title)), tag: type === "CUSTOM" ? "Other" : TEST_TYPE_NAME[type], student: s(user?.displayName ?? "Student"),
    correct, total: reviewItems.length, pct: Math.round((100 * correct) / Math.max(1, reviewItems.length)), completedAt: iso(row.completedAt), items: reviewItems,
  };
}

// ------------------------------------------------------------------ 6. admin: tests per teacher

export interface TeacherTestCount { teacherId: string; name: string; tests: number; assigned: number; completed: number; byType: Record<string, number> }

/** Admin: how many tests each teacher created and how many students completed them (batched reads). */
export async function adminTestCounts(repo: Repo, actor: Actor): Promise<{ teachers: TeacherTestCount[]; totals: { tests: number; assigned: number; completed: number } }> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the admin can see this page.");
  const tests = await repo.findMany("TeacherTest", { schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "teacherId", "testType"] });
  const teachers = await repo.findMany("Teacher", { schoolId: actor.schoolId }, { select: ["id", "userId"] }).catch(() => [] as Row[]);
  const tIds = [...new Set([...teachers.map((t) => s(t.id)), ...tests.map((t) => s(t.teacherId))])];
  const tRows = tIds.length ? await inBatches(tIds, 500, (c) => repo.findMany("Teacher", { id: { in: c } }, { select: ["id", "userId"] })) : [];
  const users = tRows.length ? await inBatches(tRows.map((t) => s(t.userId)), 500, (c) => repo.findMany("User", { id: { in: c } }, { select: ["id", "displayName"] })) : [];
  const sets = tests.length ? await inBatches(tests.map((t) => s(t.id)), 500, (c) => repo.findMany("Assignment", { testId: { in: c }, deletedAt: null }, { select: ["id", "testId"] })) : [];
  const rows = sets.length ? await inBatches(sets.map((x) => s(x.id)), 500, (c) => repo.findMany("AssignmentStudent", { assignmentId: { in: c } }, { select: ["assignmentId", "status"] })) : [];
  const teacherOfTest = new Map(tests.map((t) => [s(t.id), s(t.teacherId)]));
  const teacherOfSet = new Map(sets.map((x) => [s(x.id), teacherOfTest.get(s(x.testId)) ?? ""]));
  const by = new Map<string, TeacherTestCount>();
  const get = (id: string) => {
    let c = by.get(id);
    if (!c) { const u = users.find((x) => x.id === tRows.find((t) => t.id === id)?.userId); c = { teacherId: id, name: s(u?.displayName ?? "Teacher"), tests: 0, assigned: 0, completed: 0, byType: {} }; by.set(id, c); }
    return c;
  };
  for (const t of tRows) get(s(t.id));
  for (const t of tests) { const c = get(s(t.teacherId)); c.tests++; const n = TEST_TYPE_NAME[asTestType(t.testType)]; c.byType[n] = (c.byType[n] ?? 0) + 1; }
  for (const r of rows) { const c = get(teacherOfSet.get(s(r.assignmentId)) ?? ""); c.assigned++; if (r.status === "COMPLETED") c.completed++; }
  const list = [...by.values()].filter((c) => c.teacherId).sort((x, y) => y.tests - x.tests || x.name.localeCompare(y.name));
  return { teachers: list, totals: { tests: tests.length, assigned: rows.length, completed: rows.filter((r) => r.status === "COMPLETED").length } };
}

// ------------------------------------------------------------------ builder: classes and students to assign to

export interface BuilderClass { id: string; name: string; grade: number; students: { id: string; name: string }[] }
/** The classes the actor may assign to (teacher: own classes; admin: the school's), with their students (batched). */
export async function builderClasses(repo: Repo, actor: Actor): Promise<BuilderClass[]> {
  staff(actor);
  const classes = (await accessibleClasses(repo, actor)).slice(0, 200);
  if (!classes.length) return [];
  const [grades, members] = await Promise.all([
    repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }),
    inBatches(classes.map((c) => s(c.id)), 200, (c) => repo.findMany("ClassMembership", { classId: { in: c }, leftAt: null }, { select: ["classId", "studentId"] })),
  ]);
  const students = members.length ? await inBatches([...new Set(members.map((m) => s(m.studentId)))], 500, (c) => repo.findMany("Student", { id: { in: c } }, { select: ["id", "userId"] })) : [];
  const users = students.length ? await inBatches(students.map((x) => s(x.userId)), 500, (c) => repo.findMany("User", { id: { in: c } }, { select: ["id", "displayName"] })) : [];
  const userName = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const nameOf = new Map(students.map((x) => [s(x.id), userName.get(s(x.userId)) || "Student"]));
  return classes.map((c) => ({
    id: s(c.id), name: s(c.name), grade: Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0),
    students: members.filter((m) => m.classId === c.id).map((m) => ({ id: s(m.studentId), name: nameOf.get(s(m.studentId)) ?? "Student" })).sort((x, y) => x.name.localeCompare(y.name)),
  })).sort((x, y) => x.grade - y.grade || x.name.localeCompare(y.name));
}
