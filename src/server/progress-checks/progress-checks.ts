/**
 * 📋 Text-set progress checks: a short check (~10 auto-marked items) at the end of a text set (a curriculum lesson,
 * e.g. G4-U1-TS1) on the skills just taught, with Comprehension and Vocabulary subscores and an 80% pass line.
 * The model (short check per text set · two subscores · 80% to pass · reteach what was missed) follows the usual
 * progress-monitoring practice of core reading programmes; every item is an original item from the school's bank.
 *
 *   createProgressCheck   the class teacher picks a text set → items chosen with findQuestionsForSkill (lesson-linked
 *                         first, then the same skill; ≈6 comprehension + 4 vocabulary; one TWO_PART / HOT_TEXT / GRID
 *                         item when the bank has one; difficulty spread around the class's level), assigned with
 *                         assignQuestions, stored as a ProgressCheck. One per class and text set (a "retake" makes a
 *                         new form that avoids the earlier items when it can).
 *   progressCheckResults  per student and check: total %, Comprehension %, Vocabulary %, pass, missed skills, status;
 *                         the class grid across the year; reteach suggestions per missed skill.
 *   classTextSets         the text sets of the class's curriculum (for the picker) with their check status.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead } from "../teacher/coordinators";
import { assignQuestions } from "../teacher/assign";
import { findQuestionsForSkill, typicalLevel } from "../curriculum/question-finder";
import { studentNames } from "../insights/student-data";
import { DEFAULT_MIX, PASS_PCT, selectItems, skillCategory, type Candidate, type Category } from "./select";
import { json, scoreChecks, type CheckScore } from "./score";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const DAY = 86_400_000;
export const TITLE_PREFIX = "Progress Check: ";
export const MAX_FORMS = 3;
const FORM = ["A", "B", "C"];

/** The lesson with its unit and grade, checked against the class (same grade's curriculum, same school). */
async function lessonForClass(repo: Repo, klass: Row, lessonId: string): Promise<{ lesson: Row; unit: Row }> {
  if (!lessonId) throw new ValidationError("Choose a text set.");
  const lesson = await repo.findUnique("Lesson", { id: lessonId });
  if (!lesson || lesson.deletedAt) throw new ValidationError("Text set not found.");
  const unit = await repo.findUnique("Unit", { id: lesson.unitId });
  const cur = unit ? await repo.findUnique("Curriculum", { id: unit.curriculumId }) : null;
  const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!unit || !cur || !grade) throw new ValidationError("Text set not found.");
  if (s(grade.schoolId) !== s(klass.schoolId)) throw new ForbiddenError("This text set belongs to another school.");
  if (s(cur.gradeId) !== s(klass.gradeId)) throw new ValidationError("This text set is not in this class's grade.");
  return { lesson, unit };
}

/** The live checks of a class (their assignment not deleted), oldest first. */
async function liveChecks(repo: Repo, where: Record<string, unknown>): Promise<Row[]> {
  const rows = await repo.findMany("ProgressCheck", where, { orderBy: [{ field: "createdAt" }, { field: "id" }] });
  if (!rows.length) return [];
  const live = new Set((await repo.findMany("Assignment", { id: { in: rows.map((r) => s(r.assignmentId)) }, deletedAt: null }, { select: ["id"] })).map((a) => s(a.id)));
  return rows.filter((r) => live.has(s(r.assignmentId)));
}

export interface CreateResult { created: boolean; checkId: string; assignmentId: string; items: number; byCategory: Record<"COMPREHENSION" | "VOCABULARY", number>; notes: string[]; form: string }

export async function createProgressCheck(repo: Repo, actor: Actor, input: { classId: string; lessonId: string; retake?: boolean; dueAt?: Date | null }, now = new Date()): Promise<CreateResult> {
  if (actor.role !== "TEACHER") throw new ForbiddenError("Only the class teacher can give a progress check.");
  if (!input.classId) throw new ValidationError("Choose a class.");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const { lesson, unit } = await lessonForClass(repo, klass, input.lessonId);
  const earlier = await liveChecks(repo, { classId: s(klass.id), lessonId: s(lesson.id) });
  const count = (cats: unknown) => { const c = Object.values(json<Record<string, string>>(cats, {})); return { COMPREHENSION: c.filter((x) => x === "COMPREHENSION").length, VOCABULARY: c.filter((x) => x === "VOCABULARY").length }; };
  if (earlier.length && !input.retake) {
    const last = earlier[earlier.length - 1];
    return { created: false, checkId: s(last.id), assignmentId: s(last.assignmentId), items: Object.keys(json<Record<string, string>>(last.categories, {})).length, byCategory: count(last.categories), notes: ["This text set already has a progress check for this class."], form: FORM[earlier.length - 1] ?? String(earlier.length) };
  }
  if (earlier.length >= MAX_FORMS) throw new ValidationError(`This text set already has ${MAX_FORMS} forms for this class.`);

  // the lesson's skills and their category (Comprehension / Vocabulary; grammar and spelling are not checked here)
  const links = await repo.findMany("LessonSkill", { lessonId: s(lesson.id) }, { select: ["skillId", "role"] });
  const skillIds = [...new Set(links.map((l) => s(l.skillId)))];
  const skills = skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds }, deletedAt: null }, { select: ["id", "name", "domain", "category", "isActive"] }) : [];
  const catOf = new Map<string, Category>();
  for (const k of skills) {
    if (k.isActive === false) continue;
    const roles = links.filter((l) => s(l.skillId) === s(k.id)).map((l) => s(l.role));
    const c = roles.map((r) => skillCategory({ domain: k.domain, category: k.category }, r));
    catOf.set(s(k.id), c.includes("VOCABULARY") ? "VOCABULARY" : c.includes("COMPREHENSION") ? "COMPREHENSION" : "OTHER");
  }
  const checked = [...catOf].filter(([, c]) => c !== "OTHER").map(([id]) => id);
  if (!checked.length) throw new ValidationError("This text set has no comprehension or vocabulary skills to check.");

  // the class's level on these skills (difficulty centre)
  const members = await repo.findMany("ClassMembership", { classId: s(klass.id), leftAt: null }, { select: ["studentId"], take: 500 });
  const mastery = members.length ? await repo.findMany("StudentSkillMastery", { skillId: { in: checked }, studentId: { in: members.map((m) => s(m.studentId)) } }, { select: ["score", "attempts"] }) : [];
  const center = typicalLevel(mastery.filter((m) => Number(m.attempts ?? 0) > 0).map((m) => Number(m.score ?? 0)));

  // the pools, from the Curriculum → Question Bank bridge (published, this school, auto-marked)
  const pools: Record<"COMPREHENSION" | "VOCABULARY", Candidate[]> = { COMPREHENSION: [], VOCABULARY: [] };
  const seen = new Set<string>();
  for (const skillId of checked) {
    const found = await findQuestionsForSkill(repo, actor, { skillId, lessonId: s(lesson.id), classId: s(klass.id) });
    const cat = catOf.get(skillId) as "COMPREHENSION" | "VOCABULARY";
    for (const q of [...found.groups.lesson, ...found.groups.skill]) {
      if (!q.autoScored || seen.has(q.id)) continue;
      seen.add(q.id);
      pools[cat].push({ id: q.id, skillId: q.skillId, difficultyLevel: q.difficultyLevel, type: q.type, lessonLinked: q.lessonLinked });
    }
  }
  const avoid = new Set(earlier.flatMap((c) => Object.keys(json<Record<string, string>>(c.categories, {}))));
  const { items, notes } = selectItems(pools, center, DEFAULT_MIX, avoid);
  if (items.length < 3) throw new ValidationError("Not enough published, auto-marked questions on this text set's skills (at least 3 are needed). Add questions in the Question Bank first.");
  if (avoid.size && items.some((q) => avoid.has(q.id))) notes.push("Some items repeat from the earlier form: the bank has too few new ones.");

  const form = FORM[earlier.length] ?? String(earlier.length + 1);
  const title = `${TITLE_PREFIX}${s(lesson.code)} ${s(lesson.title)}${earlier.length ? ` (Form ${form})` : ""}`.slice(0, 180);
  const dueAt = input.dueAt === undefined ? new Date(now.getTime() + 7 * DAY) : input.dueAt;
  const set = await assignQuestions(repo, actor, { classId: s(klass.id), questionIds: items.map((q) => q.id), title, exactTitle: true, dueAt, note: `Unit ${Number(unit.number)} text set check: ${items.length} questions. Pass mark ${PASS_PCT}%.` }, now);
  const categories = Object.fromEntries(items.map((q) => [q.id, q.category]));
  const row = await repo.create("ProgressCheck", { schoolId: s(klass.schoolId), classId: s(klass.id), lessonId: s(lesson.id), assignmentId: set.assignmentId, title, categories, createdById: actor.userId, createdAt: now });
  await audit(repo, { actorId: actor.userId, action: "progress_check.create", entityType: "ProgressCheck", entityId: s(row.id), after: { classId: s(klass.id), lessonId: s(lesson.id), items: items.length, form }, at: now });
  const by = { COMPREHENSION: items.filter((q) => q.category === "COMPREHENSION").length, VOCABULARY: items.filter((q) => q.category === "VOCABULARY").length };
  return { created: true, checkId: s(row.id), assignmentId: set.assignmentId, items: items.length, byCategory: by, notes, form };
}

// ------------------------------------------------------------------ the text sets of a class

export interface TextSetRow { lessonId: string; code: string; title: string; unit: number; number: number; weeks: number[]; checks: number; lastCheckAt: string | null }

/** The text sets of the class's active curriculum (unit order), with how many checks each has. */
export async function classTextSets(repo: Repo, actor: Actor, classId: string): Promise<TextSetRow[]> {
  const klass = await assertClassRead(repo, actor, classId);
  return textSetsOfClasses(repo, [klass]).then((m) => m.get(s(klass.id)) ?? []);
}

/** Text sets for several classes (no access check: callers check). */
export async function textSetsOfClasses(repo: Repo, classes: Row[]): Promise<Map<string, TextSetRow[]>> {
  const out = new Map<string, TextSetRow[]>();
  if (!classes.length) return out;
  const gradeIds = [...new Set(classes.map((c) => s(c.gradeId)))];
  const curs = await repo.findMany("Curriculum", { gradeId: { in: gradeIds }, isActive: true }, { select: ["id", "gradeId"] });
  const units = curs.length ? await repo.findMany("Unit", { curriculumId: { in: curs.map((c) => s(c.id)) } }, { select: ["id", "number", "curriculumId", "deletedAt"] }) : [];
  const liveUnits = units.filter((u) => !u.deletedAt);
  const lessons = liveUnits.length ? await repo.findMany("Lesson", { unitId: { in: liveUnits.map((u) => s(u.id)) }, deletedAt: null }, { select: ["id", "unitId", "number", "code", "title", "weeks"] }) : [];
  const checks = await liveChecks(repo, { classId: { in: classes.map((c) => s(c.id)) } });
  const unitOf = new Map(liveUnits.map((u) => [s(u.id), u]));
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), s(c.gradeId)]));
  for (const k of classes) {
    const rows = lessons.filter((l) => gradeOfCur.get(s(unitOf.get(s(l.unitId))?.curriculumId)) === s(k.gradeId)).map((l) => {
      const mine = checks.filter((c) => s(c.classId) === s(k.id) && s(c.lessonId) === s(l.id));
      return {
        lessonId: s(l.id), code: s(l.code), title: s(l.title), unit: Number(unitOf.get(s(l.unitId))!.number), number: Number(l.number),
        weeks: json<unknown[]>(l.weeks, []).map(Number).filter((n) => Number.isFinite(n)), checks: mine.length,
        lastCheckAt: mine.length ? d(mine[mine.length - 1].createdAt)!.toISOString() : null,
      };
    }).sort((a, b) => a.unit - b.unit || a.number - b.number);
    out.set(s(k.id), rows);
  }
  return out;
}

// ------------------------------------------------------------------ results

export interface CheckColumn { id: string; title: string; lessonId: string; code: string; createdAt: string; dueAt: string | null; items: number; comprehensionItems: number; vocabularyItems: number; completed: number; assigned: number; avgPct: number | null; passRate: number | null }
export interface StudentRow { id: string; name: string; cells: (Omit<CheckScore, "completedAt" | "missedSkills"> & { completedAt: string | null; missedSkills: { skillId: string; name: string; missed: number }[] })[]; avgPct: number | null; checksPassed: number; checksDone: number }
export interface ReteachSkill { checkId: string; skillId: string; name: string; students: { id: string; name: string }[]; href: string }
export interface ClassResults { classId: string; className: string; passPct: number; checks: CheckColumn[]; students: StudentRow[]; reteach: ReteachSkill[] }

/** Results of every progress check of a class (the teacher, a grade coordinator or an admin). */
export async function progressCheckResults(repo: Repo, actor: Actor, classId: string): Promise<ClassResults> {
  const klass = await assertClassRead(repo, actor, classId);
  const checks = await liveChecks(repo, { classId: s(klass.id) });
  const memberIds = (await repo.findMany("ClassMembership", { classId: s(klass.id), leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  // students who left keep their results if they were given a check
  const given = checks.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: checks.map((c) => s(c.assignmentId)) } }, { select: ["studentId"] }) : [];
  const ids = [...new Set([...memberIds, ...given.map((g) => s(g.studentId))])];
  const [scores, names, assignments, lessons] = await Promise.all([
    scoreChecks(repo, checks, ids),
    studentNames(repo, ids),
    checks.length ? repo.findMany("Assignment", { id: { in: checks.map((c) => s(c.assignmentId)) } }, { select: ["id", "dueAt"] }) : Promise.resolve([] as Row[]),
    checks.length ? repo.findMany("Lesson", { id: { in: [...new Set(checks.map((c) => s(c.lessonId)))] } }, { select: ["id", "code"] }) : Promise.resolve([] as Row[]),
  ]);
  const skillIds = new Set<string>();
  for (const x of scores.values()) for (const m of x.missedSkills) skillIds.add(m.skillId);
  const skillName = skillIds.size ? new Map((await repo.findMany("Skill", { id: { in: [...skillIds] } }, { select: ["id", "name"] })).map((k) => [s(k.id), s(k.name)])) : new Map<string, string>();
  const dueOf = new Map(assignments.map((a) => [s(a.id), d(a.dueAt)]));
  const codeOf = new Map(lessons.map((l) => [s(l.id), s(l.code)]));
  const mean = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);

  const columns: CheckColumn[] = checks.map((c) => {
    const cats = Object.values(json<Record<string, string>>(c.categories, {}));
    const cells = ids.map((id) => scores.get(`${s(c.id)}|${id}`)!).filter((x) => x && x.status !== "NOT_ASSIGNED");
    const done = cells.filter((x) => x.pct !== null);
    return {
      id: s(c.id), title: s(c.title), lessonId: s(c.lessonId), code: codeOf.get(s(c.lessonId)) ?? "", createdAt: d(c.createdAt)!.toISOString(),
      dueAt: dueOf.get(s(c.assignmentId))?.toISOString() ?? null, items: cats.length,
      comprehensionItems: cats.filter((x) => x === "COMPREHENSION").length, vocabularyItems: cats.filter((x) => x === "VOCABULARY").length,
      completed: done.length, assigned: cells.length, avgPct: mean(done.map((x) => x.pct!)), passRate: done.length ? Math.round((100 * done.filter((x) => x.pass).length) / done.length) : null,
    };
  });
  const students: StudentRow[] = ids.map((id) => {
    const cells = checks.map((c) => {
      const x = scores.get(`${s(c.id)}|${id}`)!;
      return { ...x, completedAt: x.completedAt ? x.completedAt.toISOString() : null, missedSkills: x.missedSkills.map((m) => ({ ...m, name: skillName.get(m.skillId) ?? "Skill" })) };
    });
    const done = cells.filter((x) => x.pct !== null);
    return { id, name: names.get(id)?.name ?? "Student", cells, avgPct: mean(done.map((x) => x.pct!)), checksPassed: done.filter((x) => x.pass).length, checksDone: done.length };
  }).filter((r) => memberIds.includes(r.id) || r.cells.some((c) => c.status !== "NOT_ASSIGNED"))
    .sort((a, b) => a.name.localeCompare(b.name));

  // reteach: per check, the skills missed by students who did not pass
  const reteach: ReteachSkill[] = [];
  for (const [ci, c] of checks.entries()) {
    const by = new Map<string, { id: string; name: string }[]>();
    for (const st of students) {
      const cell = st.cells[ci];
      if (cell.pct === null || cell.pass) continue;
      for (const m of cell.missedSkills) { const l = by.get(m.skillId) ?? []; l.push({ id: st.id, name: st.name }); by.set(m.skillId, l); }
    }
    for (const [skillId, list] of [...by].sort((a, b) => b[1].length - a[1].length)) {
      reteach.push({ checkId: s(c.id), skillId, name: skillName.get(skillId) ?? "Skill", students: list, href: `/teacher/skill-assign?${new URLSearchParams({ skillId, classId: s(klass.id), lessonId: s(c.lessonId) })}` });
    }
  }
  return { classId: s(klass.id), className: s(klass.name), passPct: PASS_PCT, checks: columns, students, reteach };
}
