/**
 * Skill assignments (⭐ Assign): a teacher assigns ONE skill to a whole class, selected students or
 * one student, with optional start date, due date and note. Built on the existing Assignment /
 * AssignmentStudent / Notification tables and the existing adaptive practice:
 *
 *   assign → AssignmentStudent rows (NOT_STARTED) + one notification per student
 *   student starts practice on that skill → the PracticeSession is linked to the open assignment
 *   each answer → that student's status is refreshed:
 *       NOT_STARTED → IN_PROGRESS (first answer) → COMPLETED (enough answers AND target mastery)
 *       OVERDUE when the due date passes before completion
 *
 * Only practice done FOR the assignment counts (sessions with this assignmentId), so a skill
 * practised months ago is not "completed" the moment it is assigned.
 */
import { countGroups } from "../db/group-count";
import { modelVersion } from "../cache/bank-version";
import { TtlCache } from "../lib/ttl-cache";
import { hideLevels } from "../../lib/hide-levels";
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { requireSource } from "../assign/source";
import { assertClassAccess } from "./assignments";
import { schoolSkillIndex } from "../questions/skill-questions";
import { dedupeIds } from "../questions/fresh";

/** Answers needed (together with the target mastery) to complete an assigned skill. */
export const MIN_ANSWERS_TO_COMPLETE = 10;
export const DEFAULT_TARGET_MASTERY = 75;

type Status = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
const OPEN: Status[] = ["NOT_STARTED", "IN_PROGRESS", "OVERDUE"];
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const s = (v: unknown) => String(v ?? "");

/** Status and progress from the work done for the assignment (pure; tested directly). */
export function assignmentStatus(input: { answered: number; mastery: number; target: number; dueAt: Date | null; now: Date; completedAt?: Date | null }): { status: Status; progress: number } {
  const done = input.answered >= MIN_ANSWERS_TO_COMPLETE && input.mastery >= input.target;
  if (done || input.completedAt) return { status: "COMPLETED", progress: 1 };
  // half for practising enough, half for reaching the target; never 100% until completed
  const progress = Math.min(0.99, 0.5 * Math.min(1, input.answered / MIN_ANSWERS_TO_COMPLETE) + 0.5 * Math.min(1, input.mastery / Math.max(1, input.target)));
  if (input.dueAt && input.now > input.dueAt) return { status: "OVERDUE", progress: Math.round(progress * 1000) / 1000 };
  return { status: input.answered > 0 ? "IN_PROGRESS" : "NOT_STARTED", progress: Math.round(progress * 1000) / 1000 };
}

// ------------------------------------------------------------------ assign

/**
 * Where a piece of work comes from (the colored source tag in My Work). Additive: CURRICULUM | MAP | NAFS were the
 * first three; RTI, GRAMMAR and CUSTOM come from the Plans wizard. Stored as text (Assignment.track, VARCHAR 16).
 */
export type Track = "CURRICULUM" | "MAP" | "NAFS" | "RTI" | "GRAMMAR" | "CUSTOM";
export const TRACKS: readonly Track[] = ["CURRICULUM", "MAP", "NAFS", "RTI", "GRAMMAR", "CUSTOM"];
export const trackOf = (v: unknown): Track => (TRACKS as readonly unknown[]).includes(v) ? (v as Track) : "CURRICULUM";
/** The program chosen in the Assign dialog (stored as Assignment.program); null when none was sent. */
export const ASSIGN_PROGRAMS = ["MAP", "RTI", "CURRICULUM", "NAFS"] as const;
export const programOrNull = (v: unknown): string | null => { const k = String(v ?? "").trim().toUpperCase(); return (ASSIGN_PROGRAMS as readonly string[]).includes(k) ? k : null; };
/**
 * Access rules (UI reorg): Nafs work may go to a class of ANY grade (it used to be Grade 6 only). Kept as a hook so
 * the call sites stay unchanged; the class itself is still checked by assertClassAccess (own classes only).
 */
async function assertTrackFitsClass(_repo: Repo, _klass: Row, _track: Track): Promise<void> {}

/**
 * Any active skill of the actor's school, from ANY grade (a Grade 11 class with no curriculum can be given a Grade 6
 * skill). A skill of another school, a removed or inactive skill is refused.
 */
export async function assertSchoolSkill(repo: Repo, schoolId: unknown, skillId: string): Promise<Row> {
  const skill = await repo.findUnique("Skill", { id: skillId });
  if (!skill || skill.deletedAt || skill.isActive === false) throw new ValidationError("Choose an active skill.");
  const cur = await repo.findUnique("Curriculum", { id: skill.curriculumId });
  const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!grade || s(grade.schoolId) !== s(schoolId)) throw new ForbiddenError("Skill not found.");
  return { ...skill, gradeLevel: Number(grade.level) };
}

export interface AssignSkillInput {
  /** CURRICULUM (default), MAP, NAFS, RTI, GRAMMAR or CUSTOM (the source tag the student sees) */
  track?: Track;
  classId: string;
  skillId: string;
  /** undefined or empty = the whole class */
  studentIds?: string[];
  startAt?: Date | null;
  dueAt?: Date | null;
  note?: string | null;
  targetMastery?: number;
  /** MAP | RTI | CURRICULUM | NAFS (the Assign dialog's Program choice) */
  program?: string | null;
  /** the teacher's own questions ("I'll pick the questions"); empty / undefined = the platform chooses */
  questionIds?: string[] | null;
  /** r67: the number of questions each student answers (5–50); empty = the 30–50 rule (at least 30, Done when mastered, at most 50) */
  questionCount?: number | null;
  /** r74: REQUIRED — MAP | NAFS | CURRICULUM | GRAMMAR | RTI (the assign window's Source; system work: its context) */
  source: string | null | undefined;
}

/** Who the work is from: the teacher themself; for a school admin, the class's teacher (the admin sends on their behalf). */
async function assigningTeacher(repo: Repo, actor: Actor, classId: string): Promise<Row | null> {
  const own = await repo.findUnique("Teacher", { userId: actor.userId });
  if (own || actor.role === "TEACHER") return own ?? null;
  const ct = (await repo.findMany("ClassTeacher", { classId }, { select: ["teacherId"] }))[0];
  return ct ? await repo.findUnique("Teacher", { id: ct.teacherId }) : null;
}

export async function assignSkill(repo: Repo, actor: Actor, input: AssignSkillInput, now = new Date()): Promise<{ assignmentId: string; students: number }> {
  assertCan(actor, "assignments:create");
  if (!input.classId) throw new ValidationError("Choose a class.");
  if (!input.skillId) throw new ValidationError("Choose a skill to assign.");
  const source = requireSource(input.source);
  const klass = await assertClassAccess(repo, actor, input.classId);
  await assertTrackFitsClass(repo, klass, trackOf(input.track));
  const teacher = await assigningTeacher(repo, actor, String(klass.id));
  if (!teacher) throw new ForbiddenError(actor.role === "TEACHER" ? "Only teachers can assign skills." : "This class has no teacher yet: add its teacher in Users first.");
  // any grade's skill of this school (access rules: content is open to every teacher; the students must be theirs)
  const [skill, members] = await Promise.all([
    assertSchoolSkill(repo, klass.schoolId, input.skillId),
    repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] }),
  ]);
  const classStudents = new Set(members.map((m) => s(m.studentId)));
  const chosen = [...new Set((input.studentIds ?? []).filter(Boolean))];
  for (const id of chosen) if (!classStudents.has(id)) throw new ForbiddenError("You can only assign work to students in this class.");
  const recipients = chosen.length ? chosen : [...classStudents];
  if (!recipients.length) throw new ValidationError("This class has no students yet.");
  const startAt = d(input.startAt), dueAt = d(input.dueAt);
  if (dueAt && dueAt.getTime() < now.getTime() - 60_000) throw new ValidationError("The due date is in the past.");
  if (startAt && dueAt && dueAt <= startAt) throw new ValidationError("The due date must be after the start date.");
  const note = s(input.note).replace(/\s+/g, " ").trim().slice(0, 1000) || null;
  const target = input.targetMastery ?? DEFAULT_TARGET_MASTERY;
  if (target < 40 || target > 100) throw new ValidationError("Target mastery must be between 40 and 100.");
  const picked = await pickedQuestionIds(repo, klass.schoolId, input.questionIds);
  const count = input.questionCount === null || input.questionCount === undefined || String(input.questionCount) === "" ? null : Math.round(Number(input.questionCount));
  if (count !== null && !(count >= 5 && count <= 50)) throw new ValidationError("The number of questions must be between 5 and 50 (or leave it empty).");
  // never a skill with no questions (the student would open an empty practice)
  if (!picked && (await skillQuestionCount(repo, s(klass.schoolId), s(skill.id))) === 0) throw new ValidationError(NO_QUESTIONS_YET);

  const students = await repo.findMany("Student", { id: { in: recipients } }, { select: ["id", "userId"] });
  const id = await repo.transaction(async (tx) => {
    const a = await tx.create("Assignment", {
      track: trackOf(input.track),
      classId: klass.id, createdById: teacher.id, title: s(skill.name).slice(0, 191), target: "SKILL", skillId: skill.id, skillIds: [s(skill.id)],
      startAt, dueAt, note, targetMastery: target, createdAt: now,
      ...(programOrNull(input.program) ? { program: programOrNull(input.program) } : {}), ...(picked ? { questionIds: picked } : {}),
      ...(count !== null && !picked ? { questionCount: count } : {}), source,
    });
    await tx.createMany("AssignmentStudent", recipients.map((studentId) => ({ assignmentId: a.id, studentId, status: "NOT_STARTED", progress: 0 })));
    const due = dueAt ? ` Due ${dueAt.toISOString().slice(0, 10)}.` : "";
    await tx.createMany("Notification", students.map((st) => ({
      userId: st.userId, type: "NEW_ASSIGNMENT", title: "Your teacher assigned you a new skill",
      body: `${s(skill.name)}.${due}${note ? ` Note: ${note}` : ""}`, link: `/student/assignments/${s(a.id)}`, createdAt: now,
    })));
    await audit(tx, { actorId: actor.userId, action: "assignment.assign_skill", entityType: "Assignment", entityId: s(a.id), after: { skillId: skill.id, classId: klass.id, students: recipients.length, scope: chosen.length ? "students" : "class", dueAt } });
    return s(a.id);
  });
  return { assignmentId: id, students: recipients.length };
}

/** What the teacher reads when a skill cannot be assigned or planned yet. */
export const NO_QUESTIONS_YET = "This skill has no questions yet.";

/**
 * Whether this class already has (any status, not deleted) a prior assignment of this skill — so the ⭐ Assign
 * page can warn the teacher and let them choose to assign it again anyway or cancel, instead of silently
 * duplicating the same work.
 */
export async function hasPriorSkillAssignment(repo: Repo, classId: string, skillId: string): Promise<boolean> {
  const rows = await repo.findMany("Assignment", { classId, skillId, deletedAt: null }, { select: ["id"] });
  return rows.length > 0;
}

/**
 * Skill ids that already have an open (not deleted) Assignment in any of these classes — so the Curriculum Map's
 * skill-plan ⭐ keeps showing "assigned" after a page refresh, instead of resetting to ☆ every time (it used to be
 * client-only state that forgot itself the moment the page reloaded).
 */
export async function assignedSkillIds(repo: Repo, classIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(classIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const rows = await repo.findMany("Assignment", { classId: { in: ids }, skillId: { not: null }, deletedAt: null }, { select: ["skillId"] });
  return new Set(rows.map((r) => s(r.skillId)).filter(Boolean));
}

/** Published questions a practice of this skill can use (the skill and its other grades' copies: the shared count). */
export async function skillQuestionCount(repo: Repo, schoolId: string, skillId: string): Promise<number> {
  const { countQuestionsOfSkills } = await import("../questions/skill-questions");
  return (await countQuestionsOfSkills(repo, schoolId, [skillId])).get(skillId) ?? 0;
}

/**
 * The teacher's picked questions, checked: published, not deleted, of this school (any grade). null = none picked
 * (the platform chooses). Order kept, duplicates dropped, at most MAX_SET_QUESTIONS.
 */
export async function pickedQuestionIds(repo: Repo, schoolId: unknown, ids: readonly string[] | null | undefined): Promise<string[] | null> {
  const want = [...new Set((ids ?? []).map(s).filter(Boolean))];
  if (!want.length) return null;
  if (want.length > MAX_SET_QUESTIONS) throw new ValidationError(`Choose at most ${MAX_SET_QUESTIONS} questions at a time.`);
  const qs = await repo.findMany("Question", { id: { in: want } }, { select: ["id", "skillId", "status", "deletedAt"] });
  if (qs.length !== want.length || qs.some((q) => q.status !== "PUBLISHED" || q.deletedAt)) throw new ValidationError("Only published questions can be assigned.");
  const idx = await schoolSkillIndex(repo, s(schoolId));
  if (qs.some((q) => !idx.ids.has(s(q.skillId)))) throw new ForbiddenError("These questions belong to another school.");
  return want;
}

// ------------------------------------------------------------------ practice link + progress

/** The student's open assignment for a skill (earliest due first), used to link a new practice session. */
export async function openAssignmentFor(repo: Repo, studentId: string, skillId: string, now = new Date()): Promise<string | null> {
  const rows = await repo.findMany("AssignmentStudent", { studentId, status: { in: OPEN } }, { select: ["assignmentId"] });
  if (!rows.length) return null;
  const list = (await repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, skillId, deletedAt: null }, { select: ["id", "dueAt", "startAt", "createdAt"] }))
    .filter((a) => !d(a.startAt) || d(a.startAt)! <= now)
    .sort((x, y) => (d(x.dueAt)?.getTime() ?? Infinity) - (d(y.dueAt)?.getTime() ?? Infinity) || (d(x.createdAt)!.getTime() - d(y.createdAt)!.getTime()));
  return list.length ? s(list[0].id) : null;
}

/**
 * Recomputes status/progress for MANY skill assignments at once (optionally only some students):
 * two or three queries in total, whatever the number of assignments; writes only rows that changed.
 */
export async function refreshSkillAssignments(repo: Repo, assignments: Row[], studentIds: string[] | null, now = new Date()): Promise<void> {
  const list = assignments.filter((a) => a.skillId && !a.deletedAt);
  if (!list.length) return;
  const ids = list.map((a) => a.id);
  const skills = [...new Set(list.map((a) => s(a.skillId)))];
  const byStudent = studentIds ? { studentId: { in: studentIds } } : {};
  const [rows, sessions, early] = await Promise.all([
    repo.findMany("AssignmentStudent", { assignmentId: { in: ids }, ...byStudent }),
    repo.findMany("PracticeSession", { assignmentId: { in: ids }, ...byStudent }, { select: ["assignmentId", "studentId", "questionCount"] }),
    studentIds ? repo.findMany("StudentSkillMastery", { studentId: { in: studentIds }, skillId: { in: skills } }, { select: ["studentId", "skillId", "score"] }) : Promise.resolve(null),
  ]);
  if (!rows.length) return;
  const mastery = early ?? await repo.findMany("StudentSkillMastery", { studentId: { in: [...new Set(rows.map((r) => s(r.studentId)))] }, skillId: { in: skills } }, { select: ["studentId", "skillId", "score"] });
  const answered = new Map<string, number>();
  for (const x of sessions) answered.set(`${s(x.assignmentId)}|${s(x.studentId)}`, (answered.get(`${s(x.assignmentId)}|${s(x.studentId)}`) ?? 0) + Number(x.questionCount ?? 0));
  const score = new Map(mastery.map((m) => [`${s(m.studentId)}|${s(m.skillId)}`, Number(m.score ?? 0)]));
  const byId = new Map(list.map((a) => [s(a.id), a]));
  const writes: Promise<unknown>[] = [];
  for (const r of rows) {
    const a = byId.get(s(r.assignmentId))!;
    const st = assignmentStatus({ answered: answered.get(`${s(a.id)}|${s(r.studentId)}`) ?? 0, mastery: score.get(`${s(r.studentId)}|${s(a.skillId)}`) ?? 0, target: Number(a.targetMastery ?? DEFAULT_TARGET_MASTERY), dueAt: d(a.dueAt), now, completedAt: d(r.completedAt) });
    const completedAt = st.status === "COMPLETED" ? (d(r.completedAt) ?? now) : null;
    if (st.status !== r.status || Math.abs(st.progress - Number(r.progress)) > 0.0005 || (completedAt === null) !== (d(r.completedAt) === null)) {
      // never moves a row back from Done: a refresh that read the row before a finishing answer was saved must not
      // overwrite it (completedAt IS NULL guard)
      writes.push(repo.updateMany("AssignmentStudent", { assignmentId: a.id, studentId: r.studentId, ...(completedAt ? {} : { completedAt: null }) }, { status: st.status, progress: st.progress, completedAt }));
    }
  }
  await Promise.all(writes);
}

/** One skill assignment (kept for callers that refresh a single assignment). */
export async function refreshSkillAssignment(repo: Repo, assignment: Row, studentIds: string[] | null, now = new Date()): Promise<void> {
  return refreshSkillAssignments(repo, [assignment], studentIds, now);
}

/**
 * After an answer in a linked session: refresh that one student's row. Everything is read in ONE
 * round trip (the session already knows the skill), and it runs while the next question is prepared.
 */
export async function refreshAfterAnswer(repo: Repo, assignmentId: string, studentId: string, now = new Date(), skillId?: string): Promise<void> {
  if (!skillId) {
    const a = await repo.findUnique("Assignment", { id: assignmentId });
    if (a && a.skillId && !a.deletedAt) await refreshSkillAssignments(repo, [a], [studentId], now);
    return;
  }
  const [a, rows, sessions, mastery] = await Promise.all([
    repo.findUnique("Assignment", { id: assignmentId }),
    repo.findMany("AssignmentStudent", { assignmentId, studentId }),
    repo.findMany("PracticeSession", { assignmentId, studentId }, { select: ["questionCount"] }),
    repo.findMany("StudentSkillMastery", { studentId, skillId }, { select: ["score"] }),
  ]);
  const r = rows[0];
  if (!a || !r || a.deletedAt || s(a.skillId) !== skillId) return;
  const st = assignmentStatus({ answered: sessions.reduce((n, x) => n + Number(x.questionCount ?? 0), 0), mastery: Number(mastery[0]?.score ?? 0), target: Number(a.targetMastery ?? DEFAULT_TARGET_MASTERY), dueAt: d(a.dueAt), now, completedAt: d(r.completedAt) });
  const completedAt = st.status === "COMPLETED" ? (d(r.completedAt) ?? now) : null;
  if (st.status !== r.status || Math.abs(st.progress - Number(r.progress)) > 0.0005 || (completedAt === null) !== (d(r.completedAt) === null)) {
    await repo.updateMany("AssignmentStudent", { assignmentId, studentId, ...(completedAt ? {} : { completedAt: null }) }, { status: st.status, progress: st.progress, completedAt });
  }
}

// ------------------------------------------------------------------ teacher views

export async function accessibleClasses(repo: Repo, actor: Actor): Promise<Row[]> {
  assertCan(actor, "assignments:read");
  // students (and parents) also hold assignments:read for their OWN work; class views are for staff only
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can see class assignments.");
  // ⚡ a page asks several times (menu, page, each panel): read once for a few seconds — any write to the classes, the
  // class teachers or the teachers in this process reads them again at once (write counters). Callers get copies.
  const key = `${actor.role}|${actor.schoolId}|${actor.userId}|${modelVersion("Class", "ClassTeacher", "Teacher")}`;
  let c = classCache.get(repo);
  if (!c) classCache.set(repo, (c = new TtlCache<Row[]>(CLASS_CACHE_MS, 2000)));
  return (await c.getOrLoad(key, () => readAccessibleClasses(repo, actor))).map((r) => ({ ...r }));
}
const CLASS_CACHE_MS = 10_000;
const classCache = new WeakMap<object, TtlCache<Row[]>>();
async function readAccessibleClasses(repo: Repo, actor: Actor): Promise<Row[]> {
  if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") return (await repo.findMany("Class", { schoolId: actor.schoolId, deletedAt: null }));
  const t = await repo.findUnique("Teacher", { userId: actor.userId });
  if (!t) return [];
  const links = await repo.findMany("ClassTeacher", { teacherId: t.id }, { select: ["classId"] });
  return links.length ? (await repo.findMany("Class", { id: { in: links.map((l) => l.classId) }, deletedAt: null })) : [];
}

export interface CurriculumSkill { id: string; name: string; code: string; standards: string[]; lessons: string[]; openAssignments: number; questions: number; /** the skill's grade (shown as a small tag) */ grade?: number }

export interface TeacherCurriculum {
  classes: { id: string; name: string; grade: number }[];
  classId: string;
  grade: { level: number; name: string };
  units: { id: string; number: number; title: string; skills: CurriculumSkill[] }[];
  /** the same skills grouped by MAP Growth goal area (via each skill's family) */
  mapAreas: { code: string; name: string; skills: CurriculumSkill[] }[];
  /** UI reorg Phase 1: the same skills grouped by NAFS area (via each skill's family; /admin/nafs-links) */
  nafsAreas?: { code: string; name: string; skills: CurriculumSkill[] }[];
  students: { id: string; name: string }[];
  /** every grade of the school (content is open to all teachers): the teacher may view and assign from any of them */
  grades?: { level: number; name: string; skills: number }[];
  /** the grade whose curriculum is shown (the class's grade unless another one was chosen) */
  viewGrade?: { level: number; name: string };
  /** the class's own grade has no curriculum (no skills) yet, e.g. a new Grade 11 */
  noCurriculum?: boolean;
}

/** The friendly message for a class whose grade has no curriculum yet. */
export const NO_CURRICULUM_MESSAGE = "This grade has no curriculum yet — you can still assign skills from any grade";

/** Grade → Unit → Skill → Standard for one of the teacher's classes, with its students (for ⭐ Assign). */
export async function teacherCurriculum(repo: Repo, actor: Actor, classId?: string, opts: { grade?: number | null } = {}): Promise<TeacherCurriculum | null> {
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return null;
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => c.gradeId))] } });
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const sorted = classes.sort((a, b) => (levelOf.get(s(a.gradeId)) ?? 0) - (levelOf.get(s(b.gradeId)) ?? 0) || s(a.name).localeCompare(s(b.name)));
  const klass = classId ? sorted.find((c) => c.id === classId) : sorted[0];
  if (!klass) throw new ForbiddenError("You do not teach this class.");
  const grade = grades.find((g) => g.id === klass.gradeId)!;
  // access rules (UI reorg): every grade's curriculum is open to every teacher; the class (and its students) stay theirs
  const allGrades = (await repo.findMany("Grade", { schoolId: klass.schoolId })).sort((a, b) => Number(a.level) - Number(b.level));
  const allCurs = allGrades.length ? await repo.findMany("Curriculum", { gradeId: { in: allGrades.map((g) => g.id) }, isActive: true }, { select: ["id", "gradeId"] }) : [];
  // ⚡ counted by the database (one row per curriculum)
  const skillCount = allCurs.length ? await countGroups(repo, "Skill", "curriculumId", { curriculumId: { in: allCurs.map((c) => c.id) }, deletedAt: null, isActive: true }) : new Map<string, number>();
  const skillsOfGrade = (gid: unknown) => allCurs.filter((c) => s(c.gradeId) === s(gid)).reduce((n, c) => n + (skillCount.get(s(c.id)) ?? 0), 0);
  const chosen = opts.grade !== undefined && opts.grade !== null ? allGrades.find((g) => Number(g.level) === Number(opts.grade)) : undefined;
  const shown = chosen ?? grade;
  const cur = (await repo.findMany("Curriculum", { gradeId: shown.id, isActive: true }))[0];
  const [units, skills, members, assignments] = await Promise.all([
    cur ? repo.findMany("Unit", { curriculumId: cur.id, deletedAt: null }) : Promise.resolve([] as Row[]),
    cur ? repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null, isActive: true }, { select: ["id", "name", "code", "familyId"] }) : Promise.resolve([] as Row[]),
    repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] }),
    repo.findMany("Assignment", { classId: klass.id, deletedAt: null }, { select: ["id", "skillId"] }),
  ]);
  const activeUnits = units.filter((u) => u.isActive !== false).sort((a, b) => Number(a.number) - Number(b.number));
  const unitIds = activeUnits.map((u) => u.id), skillIds = skills.map((k) => k.id);
  const [unitSkills, lessons, links, students] = await Promise.all([
    unitIds.length ? repo.findMany("UnitSkill", { unitId: { in: unitIds } }) : Promise.resolve([] as Row[]),
    unitIds.length ? repo.findMany("Lesson", { unitId: { in: unitIds }, deletedAt: null }, { select: ["id", "unitId", "number"] }) : Promise.resolve([] as Row[]),
    skillIds.length ? repo.findMany("SkillStandard", { skillId: { in: skillIds } }) : Promise.resolve([] as Row[]),
    members.length ? repo.findMany("Student", { id: { in: members.map((m) => m.studentId) } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
  ]);
  const [lessonSkills, stds, users, openRows] = await Promise.all([
    lessons.length ? repo.findMany("LessonSkill", { lessonId: { in: lessons.map((l) => l.id) } }, { select: ["lessonId", "skillId"] }) : Promise.resolve([] as Row[]),
    links.length ? repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => l.standardId))] } }, { select: ["id", "code"] }) : Promise.resolve([] as Row[]),
    students.length ? repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : Promise.resolve([] as Row[]),
    assignments.length ? repo.findMany("AssignmentStudent", { assignmentId: { in: assignments.map((a) => a.id) }, status: { in: OPEN } }, { select: ["assignmentId"] }) : Promise.resolve([] as Row[]),
  ]);
  const stdCode = new Map(stds.map((x) => [s(x.id), s(x.code).replace(/^CCSS\.ELA-LITERACY\./, "")]));
  const lessonNo = new Map(lessons.map((l) => [s(l.id), Number(l.number)]));
  // published questions per skill (one query): the teacher can open them, star and assign
  // UI reorg Phase 1: the ONE shared count (the search and the NAFS section show the same number)
  const { countQuestionsOfSkills } = await import("../questions/skill-questions");
  const questionCount = await countQuestionsOfSkills(repo, s(klass.schoolId ?? actor.schoolId), skills.map((k) => s(k.id)));
  const openBySkill = new Map<string, number>();
  const openAssignmentIds = new Set(openRows.map((r) => s(r.assignmentId)));
  for (const a of assignments) if (a.skillId && openAssignmentIds.has(s(a.id))) openBySkill.set(s(a.skillId), (openBySkill.get(s(a.skillId)) ?? 0) + 1);
  const skillById = new Map(skills.map((k) => [s(k.id), k]));
  const names = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const view: TeacherCurriculum = {
    classes: sorted.map((c) => ({ id: s(c.id), name: s(c.name), grade: levelOf.get(s(c.gradeId)) ?? 0 })),
    classId: s(klass.id), grade: { level: Number(grade.level), name: s(grade.name) },
    grades: allGrades.map((g) => ({ level: Number(g.level), name: s(g.name), skills: skillsOfGrade(g.id) })),
    viewGrade: { level: Number(shown.level), name: s(shown.name) },
    noCurriculum: skillsOfGrade(grade.id) === 0,
    units: activeUnits.map((u) => {
      const myLessons = new Set(lessons.filter((l) => l.unitId === u.id).map((l) => s(l.id)));
      return {
        id: s(u.id), number: Number(u.number), title: s(u.title),
        skills: unitSkills.filter((x) => x.unitId === u.id).sort((a, b) => Number(a.order) - Number(b.order)).map((x) => skillById.get(s(x.skillId))).filter((k): k is Row => Boolean(k)).map((k) => ({
          id: s(k.id), name: s(k.name), code: s(k.code),
          standards: links.filter((l) => l.skillId === k.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((l) => stdCode.get(s(l.standardId)) ?? "").filter(Boolean),
          lessons: [...new Set(lessonSkills.filter((ls) => ls.skillId === k.id && myLessons.has(s(ls.lessonId))).map((ls) => lessonNo.get(s(ls.lessonId)) ?? 0))].sort((a, b) => a - b).map((n) => `L${n}`),
          openAssignments: openBySkill.get(s(k.id)) ?? 0,
          questions: questionCount.get(s(k.id)) ?? 0,
          grade: Number(shown.level),
        })),
      };
    }),
    students: students.map((x) => ({ id: s(x.id), name: names.get(s(x.userId)) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
    mapAreas: [],
  };
  // 🧩 master list: skills of the grade that are in no unit (Grammar, imported skill banks…) are listed too
  const inUnits = new Set(view.units.flatMap((u) => u.skills.map((k) => k.id)));
  const more = skills.filter((k) => !inUnits.has(s(k.id)) && !s(k.code).endsWith(".curriculum-map-unclassified")).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  if (more.length) view.units.push({ id: "more", number: 0, title: "More skills (Grammar and other skills not in a unit)", skills: more.map((k) => ({
    id: s(k.id), name: s(k.name), code: s(k.code), lessons: [],
    standards: links.filter((l) => l.skillId === k.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((l) => stdCode.get(s(l.standardId)) ?? "").filter(Boolean),
    openAssignments: openBySkill.get(s(k.id)) ?? 0, questions: questionCount.get(s(k.id)) ?? 0, grade: Number(shown.level),
  })) });
  view.mapAreas = await mapAreasFor(repo, skills, view.units.flatMap((u) => u.skills));
  view.nafsAreas = await nafsAreasFor(repo, skills, view.units.flatMap((u) => u.skills));
  return view;
}

/** Groups the grade's skills by MAP goal area (skill → family → goal area), in the goal areas' order. */
async function mapAreasFor(repo: Repo, skills: Row[], built: CurriculumSkill[]): Promise<TeacherCurriculum["mapAreas"]> {
  const familyIds = [...new Set(skills.map((k) => k.familyId).filter(Boolean).map(s))];
  if (!familyIds.length) return [];
  const families = await repo.findMany("SkillFamily", { id: { in: familyIds } }, { select: ["id", "mapGoalAreaId"] });
  const areaIds = [...new Set(families.map((f) => f.mapGoalAreaId).filter(Boolean).map(s))];
  if (!areaIds.length) return [];
  const areas = await repo.findMany("MapGoalArea", { id: { in: areaIds } }, { select: ["id", "code", "name"] });
  const areaOfFamily = new Map(families.map((f) => [s(f.id), s(f.mapGoalAreaId)]));
  const byId = new Map(built.map((k) => [k.id, k]));
  const ORDER = ["LIT_THEME", "LIT_STRUCTURE", "INFO_CENTRAL_IDEA", "INFO_STRUCTURE", "VOCAB", "LANG_GRAMMAR", "LANG_MECHANICS", "WRITING_STYLE", "WRITING_ORG", "WRITING_SUPPORT"];
  return areas.map((a) => ({
    code: s(a.code), name: s(a.name),
    skills: skills.filter((k) => areaOfFamily.get(s(k.familyId)) === a.id).map((k) => byId.get(s(k.id))).filter((k): k is CurriculumSkill => Boolean(k)).sort((x, y) => x.name.localeCompare(y.name)),
  })).filter((a) => a.skills.length).sort((x, y) => (ORDER.indexOf(x.code) + 99) % 99 - (ORDER.indexOf(y.code) + 99) % 99 || x.name.localeCompare(y.name));
}

/** Groups the grade's skills by NAFS area (skill → family → NafsSkillLink), in the areas' order. */
async function nafsAreasFor(repo: Repo, skills: Row[], built: CurriculumSkill[]): Promise<NonNullable<TeacherCurriculum["nafsAreas"]>> {
  const familyIds = [...new Set(skills.map((k) => k.familyId).filter(Boolean).map(s))];
  if (!familyIds.length) return [];
  const [links, areas] = await Promise.all([
    repo.findMany("NafsSkillLink", { familyId: { in: familyIds } }, { select: ["familyId", "areaId"] }),
    repo.findMany("NafsArea", {}, { select: ["id", "code", "name", "sortOrder", "isActive"] }),
  ]);
  const areaOfFamily = new Map(links.map((l) => [s(l.familyId), s(l.areaId)]));
  const byId = new Map(built.map((k) => [k.id, k]));
  return areas.filter((a) => a.isActive !== false && a.isActive !== 0).sort((x, y) => Number(x.sortOrder) - Number(y.sortOrder)).map((a) => ({
    code: s(a.code), name: s(a.name),
    skills: [...new Map(skills.filter((k) => areaOfFamily.get(s(k.familyId)) === a.id).map((k) => byId.get(s(k.id))).filter((k): k is CurriculumSkill => Boolean(k)).map((k) => [k.id, k])).values()].sort((x, y) => x.name.localeCompare(y.name)),
  })).filter((a) => a.skills.length);
}

export interface WeeklyRow { id: string; track: Track; skill: string; className: string; assigned: number; counts: Record<Status, number>; dueAt: string | null; startAt: string | null; createdAt: string; scope: "class" | "students" }

/** Skill assignments created or due in the week starting `weekStart`, for the classes the actor may see. */
export async function weeklyAssignments(repo: Repo, actor: Actor, weekStart: Date, now = new Date()): Promise<WeeklyRow[]> {
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return [];
  const end = new Date(weekStart.getTime() + 7 * 86_400_000);
  const all = (await repo.findMany("Assignment", { classId: { in: classes.map((c) => c.id) }, deletedAt: null })).filter((a) => !a.curriculumPlanId);
  const inWeek = all.filter((a) => {
    const c = d(a.createdAt)!, due = d(a.dueAt);
    return (c >= weekStart && c < end) || (due && due >= weekStart && due < end);
  });
  if (!inWeek.length) return [];
  await Promise.all([refreshSkillAssignments(repo, inWeek, null, now), refreshQuestionSets(repo, inWeek, null, now)]);
  const [rows, members] = await Promise.all([
    repo.findMany("AssignmentStudent", { assignmentId: { in: inWeek.map((a) => a.id) } }, { select: ["assignmentId", "status"] }),
    repo.findMany("ClassMembership", { classId: { in: [...new Set(inWeek.map((a) => a.classId))] }, leftAt: null }, { select: ["classId"] }),
  ]);
  const classSize = new Map<string, number>();
  for (const m of members) classSize.set(s(m.classId), (classSize.get(s(m.classId)) ?? 0) + 1);
  const className = new Map(classes.map((c) => [s(c.id), s(c.name)]));
  return inWeek.map((a) => {
    const mine = rows.filter((r) => r.assignmentId === a.id);
    const counts: Record<Status, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, OVERDUE: 0 };
    for (const r of mine) counts[r.status as Status]++;
    return {
      id: s(a.id), track: trackOf(a.track), skill: s(a.title), className: className.get(s(a.classId)) ?? "", assigned: mine.length, counts,
      dueAt: d(a.dueAt)?.toISOString() ?? null, startAt: d(a.startAt)?.toISOString() ?? null, createdAt: d(a.createdAt)!.toISOString(),
      scope: (mine.length < (classSize.get(s(a.classId)) ?? 0) ? "students" : "class") as WeeklyRow["scope"],
    };
  }).sort((x, y) => (x.dueAt ?? "9").localeCompare(y.dueAt ?? "9") || y.createdAt.localeCompare(x.createdAt));
}

export interface AssignmentDetail {
  id: string; skill: string; skillId: string | null; className: string; classId: string; dueAt: string | null; startAt: string | null; note: string | null; targetMastery: number;
  students: { studentId: string; name: string; status: Status; progress: number; answered: number; correct: number; accuracy: number | null; lastActivity: string | null; completedAt: string | null }[];
}

/** One assignment with every student's result (teacher of the class or school admin). */
/**
 * ✖ Cancel an assignment (readiness S-11): a soft delete (deletedAt). It disappears from every student's list and
 * further answers are refused; answers already given stay in the history and still count for mastery. Only the
 * class's teacher or a school admin; the reason is kept in the audit log.
 */
export async function cancelAssignment(repo: Repo, actor: Actor, assignmentId: string, now = new Date()): Promise<{ title: string; students: number; completed: number }> {
  assertCan(actor, "assignments:create");
  const a = await repo.findUnique("Assignment", { id: assignmentId });
  if (!a || a.deletedAt) throw new ForbiddenError("Assignment not found.");
  await assertClassAccess(repo, actor, s(a.classId));
  const rows = await repo.findMany("AssignmentStudent", { assignmentId }, { select: ["status"] });
  const completed = rows.filter((r) => r.status === "COMPLETED").length;
  await repo.updateMany("Assignment", { id: assignmentId, deletedAt: null }, { deletedAt: now });
  await audit(repo, { actorId: actor.userId, action: "assignment.cancel", entityType: "Assignment", entityId: assignmentId, before: { title: s(a.title), students: rows.length, completed }, after: { deletedAt: now.toISOString() }, at: now });
  return { title: s(a.title), students: rows.length, completed };
}

/**
 * ⭐ Skill plan's ⭐ un-star (owner: "لو شلت النجمه يتلغي"): cancel every open assignment of this skill for this
 * class — usually one, cancelled all if more than one somehow exists. Each goes through cancelAssignment (same
 * guarantee: students stop seeing it, answers already given are kept, the class's teacher or a school admin only).
 */
export async function cancelSkillAssignmentsForClass(repo: Repo, actor: Actor, classId: string, skillId: string, now = new Date()): Promise<{ cancelled: number }> {
  const rows = await repo.findMany("Assignment", { classId, skillId, deletedAt: null }, { select: ["id"] });
  let cancelled = 0;
  for (const r of rows) { await cancelAssignment(repo, actor, s(r.id), now); cancelled++; }
  return { cancelled };
}

/**
 * ⭐ Skill plan's per-student un-star ("يشيل طالب واحد بس"): remove ONLY the named students from this skill's open
 * assignment(s) in a class, leaving everyone else assigned. Answers already given are kept, same guarantee as the
 * whole-class cancel above. If removing them empties an assignment (no students left on it), that assignment is
 * cancelled too — so the Assignment row never sits around with zero students on it.
 */
export async function cancelSkillAssignmentsForStudents(repo: Repo, actor: Actor, classId: string, skillId: string, studentIds: string[], now = new Date()): Promise<{ removed: number }> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  if (!studentIds.length) return { removed: 0 };
  const assignments = await repo.findMany("Assignment", { classId, skillId, deletedAt: null }, { select: ["id", "title"] });
  let removed = 0;
  for (const a of assignments) {
    const assignmentId = s(a.id);
    const hit = await repo.findMany("AssignmentStudent", { assignmentId, studentId: { in: studentIds } }, { select: ["studentId"] });
    if (!hit.length) continue;
    await repo.deleteMany("AssignmentStudent", { assignmentId, studentId: { in: studentIds } });
    removed += hit.length;
    await audit(repo, { actorId: actor.userId, action: "assignment.removeStudents", entityType: "Assignment", entityId: assignmentId, before: { title: s(a.title), studentIds: hit.map((r) => s(r.studentId)) }, after: { removed: hit.length }, at: now });
    const left = await repo.count("AssignmentStudent", { assignmentId });
    if (!left) await repo.updateMany("Assignment", { id: assignmentId, deletedAt: null }, { deletedAt: now });
  }
  return { removed };
}

export async function assignmentDetail(repo: Repo, actor: Actor, assignmentId: string, now = new Date()): Promise<AssignmentDetail> {
  assertCan(actor, "assignments:read");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can see assignment results.");
  const a = await repo.findUnique("Assignment", { id: assignmentId });
  if (!a || a.deletedAt) throw new ForbiddenError("Assignment not found.");
  const klass = await assertClassAccess(repo, actor, s(a.classId));
  if (a.skillId) await refreshSkillAssignment(repo, a, null, now);
  if (a.assessmentId) await refreshQuestionSets(repo, [a], null, now);
  const rows = await repo.findMany("AssignmentStudent", { assignmentId });
  const ids = rows.map((r) => s(r.studentId));
  const [students, sessions] = await Promise.all([
    ids.length ? repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("PracticeSession", { assignmentId, studentId: { in: ids } }, { select: ["studentId", "questionCount", "correctCount", "startedAt", "endedAt"] }) : Promise.resolve([] as Row[]),
  ]);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(students.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName ?? "Student")]));
  return {
    id: s(a.id), skill: s(a.title), skillId: a.skillId ? s(a.skillId) : null, className: s(klass.name), classId: s(klass.id),
    dueAt: d(a.dueAt)?.toISOString() ?? null, startAt: d(a.startAt)?.toISOString() ?? null, note: a.note ? s(a.note) : null, targetMastery: Number(a.targetMastery ?? DEFAULT_TARGET_MASTERY),
    students: rows.map((r) => {
      const mine = sessions.filter((x) => x.studentId === r.studentId);
      const answered = mine.reduce((n, x) => n + Number(x.questionCount ?? 0), 0), correct = mine.reduce((n, x) => n + Number(x.correctCount ?? 0), 0);
      const last = mine.map((x) => d(x.endedAt) ?? d(x.startedAt)!).sort((p, q) => q.getTime() - p.getTime())[0];
      return {
        studentId: s(r.studentId), name: nameOf.get(s(r.studentId)) ?? "Student", status: r.status as Status, progress: Number(r.progress),
        answered, correct, accuracy: answered ? Math.round((100 * correct) / answered) : null, lastActivity: last?.toISOString() ?? null, completedAt: d(r.completedAt)?.toISOString() ?? null,
      };
    }).sort((x, y) => x.name.localeCompare(y.name)),
  };
}

// ------------------------------------------------------------------ ⭐ assign chosen questions (question sets)

export const MAX_SET_QUESTIONS = 50;
/** a teacher-built test (Assessments) may hold a few more questions than a practice set */
export const MAX_TEST_SET_QUESTIONS = 60;
/** sets with a goal of correct answers stop here anyway (the teacher is told the student is stuck) */
export const GOAL_SAFETY_CAP = 100;
/** the default goal of correct answers for Curriculum Map places and plans */
export const DEFAULT_TARGET_CORRECT = 20;

export interface AssignQuestionsInput {
  /** TEACHER_QUIZ (default) · PLACEMENT (sets each student's level when done) · BENCHMARK (MAP practice test) */
  kind?: "TEACHER_QUIZ" | "PLACEMENT" | "BENCHMARK";
  /** use the title exactly (no “(N questions)” suffix) */
  exactTitle?: boolean;
  /** adaptive set: the pool may be large; each student answers up to maxQuestions, moving Below ↔ On ↔ Above */
  adaptive?: { maxQuestions: number; targetCorrect?: number | null };
  /** no notification (a curriculum plan place opened by a student) */
  silent?: boolean;
  /** the full-curriculum plan this place belongs to (hidden from the work lists) */
  curriculumPlanId?: string | null;
  /** MAP | RTI | CURRICULUM | NAFS (the Program choice), stored as Assignment.program */
  program?: string | null;
  /** the skill this question set was built from (⭐ Assign, Ready set): kept on the Assignment so a later Assign
   * can warn "already assigned before" even though the work itself is an ASSESSMENT, not a SKILL assignment */
  skillId?: string | null;
  track?: Track; classId: string; questionIds: string[]; studentIds?: string[]; title?: string; startAt?: Date | null; dueAt?: Date | null; note?: string | null;
  /** a teacher-built test: at most MAX_TEST_SET_QUESTIONS questions (instead of MAX_SET_QUESTIONS) */
  test?: boolean;
  /** Fixed sets only: a different question order for each student (same question set; stable per student). */
  shuffle?: boolean;
  // 🔓 fix (Oct 2026, "خلي fixed مفتوح وغير محدد"): a caller using `test` can override the 60-question
  // MAX_TEST_SET_QUESTIONS cap with a higher one of its own (e.g. the teacher's Review, whose Fixed assignment
  // should hold as many questions as the Review itself allows). Other `test` callers that don't pass this keep
  // the original 60 cap untouched — this never changes behaviour for Assessments or any other test builder.
  testCap?: number;
  /** r74: REQUIRED — MAP | NAFS | CURRICULUM | GRAMMAR | RTI (the assign window's Source; system work: its context) */
  source: string | null | undefined }

/**
 * Assigns specific questions chosen by the teacher (from the question list) to a class, selected students or
 * one student. Stored as an Assessment of type TEACHER_QUIZ (+ its AssessmentQuestion rows) and an Assignment
 * with target ASSESSMENT, so it shares statuses, notifications and reports with skill assignments.
 */
export async function assignQuestions(repo: Repo, actor: Actor, input: AssignQuestionsInput, now = new Date()): Promise<{ assignmentId: string; students: number; questions: number }> {
  assertCan(actor, "assignments:create");
  if (!input.classId) throw new ValidationError("Choose a class.");
  const source = requireSource(input.source);
  const picked = [...new Set((input.questionIds ?? []).filter(Boolean))];
  if (!picked.length) throw new ValidationError("Choose at least one question.");
  const cap = input.adaptive ? 1000 : input.test ? Math.max(1, Math.min(1000, Math.trunc(Number(input.testCap)) || MAX_TEST_SET_QUESTIONS)) : MAX_SET_QUESTIONS;
  if (picked.length > 2000) throw new ValidationError(`Choose at most ${cap} questions at a time.`);
  // 👯 never two copies of the same content in one set or test (same fingerprint, or same stem + correct answer —
  // copies stored under different skills, grades or map places): the first copy stays (questions/fresh.ts)
  const ids = await dedupeIds(repo, picked);
  if (ids.length > cap) throw new ValidationError(`Choose at most ${cap} questions at a time.`);
  const klass = await assertClassAccess(repo, actor, input.classId);
  await assertTrackFitsClass(repo, klass, trackOf(input.track));
  const teacher = await assigningTeacher(repo, actor, String(klass.id));
  if (!teacher) throw new ForbiddenError(actor.role === "TEACHER" ? "Only teachers can assign questions." : "This class has no teacher yet: add its teacher in Users first.");
  const qs = await repo.findMany("Question", { id: { in: ids } }, { select: ["id", "skillId", "status", "deletedAt", "typeId"] });
  if (qs.length !== ids.length || qs.some((q) => q.status !== "PUBLISHED" || q.deletedAt)) throw new ValidationError("Only published questions can be assigned.");
  // the platform marks answers itself; short answers need a teacher, so they cannot go into a set
  const types = await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => q.typeId))] } }, { select: ["id", "code", "isAutoScored"] });
  const manual = qs.filter((q) => { const t = types.find((x) => x.id === q.typeId); return !t || t.code === "SHORT_ANSWER" || t.isAutoScored === false; });
  if (manual.length) throw new ValidationError(`${manual.length} of these questions ${manual.length === 1 ? "is a short answer" : "are short answers"} that a teacher must mark, so ${manual.length === 1 ? "it" : "they"} cannot be assigned here. Remove ${manual.length === 1 ? "it" : "them"} from the selection.`);
  // the questions must belong to this school's curriculum
  const skills = await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => q.skillId))] } }, { select: ["id", "name", "curriculumId"] });
  const curs = await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => k.curriculumId))] } }, { select: ["id", "gradeId"] });
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => c.gradeId))] } }, { select: ["id", "schoolId"] });
  if (grades.some((g) => g.schoolId !== klass.schoolId)) throw new ForbiddenError("These questions belong to another school.");
  const members = await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] });
  const classStudents = new Set(members.map((m) => s(m.studentId)));
  const chosen = [...new Set((input.studentIds ?? []).filter(Boolean))];
  for (const id of chosen) if (!classStudents.has(id)) throw new ForbiddenError("You can only assign work to students in this class.");
  const recipients = chosen.length ? chosen : [...classStudents];
  if (!recipients.length) throw new ValidationError("This class has no students yet.");
  const startAt = d(input.startAt), dueAt = d(input.dueAt);
  if (dueAt && dueAt.getTime() < now.getTime() - 60_000) throw new ValidationError("The due date is in the past.");
  if (startAt && dueAt && dueAt <= startAt) throw new ValidationError("The due date must be after the start date.");
  const note = s(input.note).replace(/\s+/g, " ").trim().slice(0, 1000) || null;
  const skillNames = [...new Set(ids.map((id) => skills.find((k) => k.id === qs.find((q) => q.id === id)!.skillId)?.name).filter(Boolean).map(String))];
  const title = input.exactTitle && s(input.title).trim() ? s(input.title).replace(/\s+/g, " ").trim().slice(0, 180) : (s(input.title).replace(/\s+/g, " ").trim() || `${skillNames.slice(0, 2).join(" & ")}${skillNames.length > 2 ? " & more" : ""}`).slice(0, 150) + ` (${ids.length} question${ids.length === 1 ? "" : "s"})`;
  const students = await repo.findMany("Student", { id: { in: recipients } }, { select: ["id", "userId"] });
  const id = await repo.transaction(async (tx) => {
    // a goal of correct answers: the student answers until they reach it or the pool runs out (a missed question
    // never comes back in the set: it waits in Second Chance), so the set's length is only a safety cap
    const target = input.adaptive?.targetCorrect ? Math.max(5, Math.min(50, Math.round(input.adaptive.targetCorrect))) : null;
    const set = await tx.create("Assessment", { title: title.slice(0, 191), type: input.kind ?? "TEACHER_QUIZ", isAdaptive: Boolean(input.adaptive), maxQuestions: input.adaptive ? (target ? GOAL_SAFETY_CAP : Math.min(ids.length, input.adaptive.maxQuestions)) : ids.length, targetCorrect: target, status: "PUBLISHED", createdById: actor.userId, createdAt: now });
    await tx.createMany("AssessmentQuestion", ids.map((questionId, order) => ({ assessmentId: set.id, questionId, order, points: 1 })));
    const a = await tx.create("Assignment", { track: trackOf(input.track), classId: klass.id, createdById: teacher.id, title: title.slice(0, 191), target: "ASSESSMENT", assessmentId: set.id, startAt, dueAt, note, curriculumPlanId: input.curriculumPlanId ?? null, createdAt: now, source, shuffle: Boolean(input.shuffle), ...(input.skillId ? { skillId: input.skillId } : {}), ...(programOrNull(input.program) ? { program: programOrNull(input.program) } : {}) });
    await tx.createMany("AssignmentStudent", recipients.map((studentId) => ({ assignmentId: a.id, studentId, status: "NOT_STARTED", progress: 0 })));
    const due = dueAt ? ` Due ${dueAt.toISOString().slice(0, 10)}.` : "";
    if (!input.silent) await tx.createMany("Notification", students.map((st) => ({
      userId: st.userId, type: "NEW_ASSIGNMENT", title: "Your teacher assigned you questions",
      body: `${hideLevels(title)}.${due}${note ? ` Note: ${note}` : ""}`, link: `/student/assignments/${s(a.id)}`, createdAt: now,
    })));
    await audit(tx, { actorId: actor.userId, action: "assignment.assign_questions", entityType: "Assignment", entityId: s(a.id), after: { classId: klass.id, questions: ids.length, students: recipients.length, scope: chosen.length ? "students" : "class", dueAt } });
    return s(a.id);
  });
  return { assignmentId: id, students: recipients.length, questions: ids.length };
}

export interface UpdateSentReviewInput {
  assignmentId: string;
  /** the desired full question list, in the order the teacher wants them — e.g. the Review Builder's current
   * draft, already sliced to its chosen count (exactly what a fresh ⭐ Assign would send today). */
  questionIds: string[];
  /** the Review's title, used EXACTLY (never "(N questions)" appended), same convention as reviewAssign /
   * customReviewAssignAction's `exactTitle: true`. undefined = leave the title as it is. */
  title?: string;
  /** undefined = leave as it is; null clears it */
  note?: string | null;
  dueAt?: Date | null;
  startAt?: Date | null;
}

export interface UpdateSentReviewResult {
  /** brand-new questions no student has seen before, now added to the live set */
  added: number;
  /** unanswered questions dropped from the live set */
  removed: number;
  /** questions at least one student already answered — kept exactly as they were, not counted in added/removed */
  lockedKept: number;
  /** of the questions the teacher's desired list dropped, how many were locked and so were kept anyway */
  protectedFromRemoval: number;
  /** AssignmentStudent rows (NOT_STARTED or IN_PROGRESS) whose bookkeeping was refreshed for the new set */
  studentsAffected: number;
  /** the live set's size after the edit */
  questions: number;
}

/**
 * 🆕 feature (Oct 2026, "عايز اقدر اعدل Review بعد ما بعتها"): edits an ALREADY-SENT question-set Review (an
 * Assignment + Assessment built by assignQuestions, e.g. from the Review Builder's ⭐ Assign) IN PLACE — the same
 * Assignment and Assessment keep their id, so students and the teacher keep seeing the SAME assignment, just with
 * an up-to-date question set / title / dates, instead of the teacher having to send a whole new, separate
 * Assignment every time the Review changes (which used to leave students who'd already started seeing the old,
 * possibly-wrong set forever, since editing the Review Builder draft never reached an already-sent Assignment).
 *
 * SAFETY RULE (confirmed with the product owner, finer-grained than question-sets.ts's swapInSets, which blocks a
 * WHOLE assignment the moment ANYONE started it): a question that at least ONE assigned student has ALREADY
 * ANSWERED — any QuestionAttempt of any PracticeSession of this assignment, whatever that student's status is
 * NOW (even if they have since finished) — is LOCKED: its AssessmentQuestion row (content, order, everything) is
 * never written to by this function, so it can never be removed or changed. Only questions nobody has answered
 * yet ("free") may be added, removed or reordered; locked rows are left exactly where they were, and new/kept
 * free rows are simply given fresh `order` values, all higher than every locked row's, so the free portion can be
 * freely replaced without ever having to touch (or risk) a locked row. Per C-1 (see refreshQuestionSets below,
 * and assign.ts's own comment on it), a student whose AssignmentStudent.status is already COMPLETED is left
 * completely untouched — refreshQuestionSets skips them on its own; only NOT_STARTED / IN_PROGRESS students'
 * status/progress are refreshed here to match the new question count.
 */
export async function updateSentReview(repo: Repo, actor: Actor, input: UpdateSentReviewInput, now = new Date()): Promise<UpdateSentReviewResult> {
  assertCan(actor, "assignments:create");
  const a = await repo.findUnique("Assignment", { id: input.assignmentId });
  if (!a || a.deletedAt) throw new ForbiddenError("Assignment not found.");
  if (a.target !== "ASSESSMENT" || !a.assessmentId) throw new ValidationError("Only a sent Review (built from chosen questions) can be edited this way.");
  const klass = await assertClassAccess(repo, actor, s(a.classId));

  const desired = [...new Set((input.questionIds ?? []).map(s).filter(Boolean))];
  if (!desired.length) throw new ValidationError("Choose at least one question.");
  if (desired.length > 2000) throw new ValidationError("Choose at most 2000 questions at a time.");

  const assessmentId = s(a.assessmentId);
  const [existing, sessions] = await Promise.all([
    repo.findMany("AssessmentQuestion", { assessmentId }),
    repo.findMany("PracticeSession", { assignmentId: input.assignmentId }, { select: ["id"] }),
  ]);
  const existingIds = new Set(existing.map((r) => s(r.questionId)));
  const sessionIds = sessions.map((x) => s(x.id));
  // "answered by anyone assigned to THIS assignment" — the core safety check; independent of any one student's
  // own status, so a question a now-COMPLETED student answered stays locked for everybody else too
  const attempts = sessionIds.length ? await repo.findMany("QuestionAttempt", { sessionId: { in: sessionIds } }, { select: ["questionId"] }) : [];
  const lockedIds = new Set([...new Set(attempts.map((x) => s(x.questionId)))].filter((id) => existingIds.has(id)));

  const lockedRows = existing.filter((r) => lockedIds.has(s(r.questionId)));
  const oldFreeRows = existing.filter((r) => !lockedIds.has(s(r.questionId)));
  const oldFreeIds = new Set(oldFreeRows.map((r) => s(r.questionId)));

  // the desired free portion: the teacher's own order, with any locked id dropped (it already sits in the locked
  // block untouched below — never duplicated, never removed just because the teacher's list left it out)
  const desiredFreeIds = desired.filter((id) => !lockedIds.has(id));
  const protectedFromRemoval = [...lockedIds].filter((id) => !desired.includes(id)).length;
  const newFreeIds = desiredFreeIds.filter((id) => !oldFreeIds.has(id));
  const removedIds = [...oldFreeIds].filter((id) => !desiredFreeIds.includes(id));

  if (newFreeIds.length) {
    // the same eligibility checks assignQuestions itself makes (published, auto-scored, this school), for the
    // NEW content only — kept/locked content was already checked when it was first assigned; a question that
    // went unpublished since is already hidden live by quizContext's own "still published" filter in
    // practice/session.ts, so it can never be served to a student even if it were still a row here
    const qs = await repo.findMany("Question", { id: { in: newFreeIds } }, { select: ["id", "skillId", "status", "deletedAt", "typeId"] });
    if (qs.length !== newFreeIds.length || qs.some((q) => q.status !== "PUBLISHED" || q.deletedAt)) throw new ValidationError("Only published questions can be added.");
    const types = await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => q.typeId))] } }, { select: ["id", "code", "isAutoScored"] });
    const manual = qs.filter((q) => { const t = types.find((x) => x.id === q.typeId); return !t || t.code === "SHORT_ANSWER" || t.isAutoScored === false; });
    if (manual.length) throw new ValidationError(`${manual.length} of these questions ${manual.length === 1 ? "is a short answer" : "are short answers"} that a teacher must mark, so ${manual.length === 1 ? "it" : "they"} cannot be added here.`);
    const skills = await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => q.skillId))] } }, { select: ["id", "curriculumId"] });
    const curs = await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => k.curriculumId))] } }, { select: ["id", "gradeId"] });
    const grades = await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => c.gradeId))] } }, { select: ["id", "schoolId"] });
    if (grades.some((g) => g.schoolId !== klass.schoolId)) throw new ForbiddenError("These questions belong to another school.");
  }
  // every new/kept free row gets a fresh `order`, strictly after every LOCKED row's own (untouched) order — so the
  // free portion can be freely replaced/reordered with no risk of ever colliding with, or displacing, a locked row
  const baseOrder = lockedRows.length ? Math.max(...lockedRows.map((r) => Number(r.order))) + 1 : 0;

  const title = input.title && s(input.title).trim() ? s(input.title).replace(/\s+/g, " ").trim().slice(0, 180) : null;
  const note = input.note === undefined ? undefined : (s(input.note).replace(/\s+/g, " ").trim().slice(0, 1000) || null);
  const dueAt = input.dueAt === undefined ? undefined : d(input.dueAt);
  const startAt = input.startAt === undefined ? undefined : d(input.startAt);
  if (dueAt && dueAt.getTime() < now.getTime() - 60_000) throw new ValidationError("The due date is in the past.");
  if (dueAt && startAt && dueAt <= startAt) throw new ValidationError("The due date must be after the start date.");

  const before = await repo.findMany("AssignmentStudent", { assignmentId: input.assignmentId }, { select: ["studentId", "status"] });
  const studentsAffected = before.filter((r) => r.status === "NOT_STARTED" || r.status === "IN_PROGRESS").length;

  await repo.transaction(async (tx) => {
    // the WHOLE free portion is deleted and recreated (kept ones included) so it gets one clean, teacher-ordered
    // sequence after the locked block — locked rows are never part of this delete, so they are never at risk
    if (oldFreeRows.length) await tx.deleteMany("AssessmentQuestion", { assessmentId, questionId: { in: [...oldFreeIds] } });
    if (desiredFreeIds.length) await tx.createMany("AssessmentQuestion", desiredFreeIds.map((questionId, i) => ({ assessmentId, questionId, order: baseOrder + i, points: 1 })));
    if (title) {
      await tx.updateMany("Assignment", { id: input.assignmentId }, { title: title.slice(0, 191) });
      await tx.updateMany("Assessment", { id: assessmentId }, { title: title.slice(0, 191) });
    }
    const patch: Record<string, unknown> = {};
    if (note !== undefined) patch.note = note;
    if (dueAt !== undefined) patch.dueAt = dueAt;
    if (startAt !== undefined) patch.startAt = startAt;
    if (Object.keys(patch).length) await tx.updateMany("Assignment", { id: input.assignmentId }, patch);
    await audit(tx, {
      actorId: actor.userId, action: "assignment.update_sent_review", entityType: "Assignment", entityId: input.assignmentId,
      before: { questions: existing.length, title: s(a.title) },
      after: { questions: lockedRows.length + desiredFreeIds.length, added: newFreeIds.length, removed: removedIds.length, lockedKept: lockedRows.length, title: title ?? s(a.title) },
      at: now,
    });
  });

  // NOT_STARTED / IN_PROGRESS students' status/progress now reflect the new question count; COMPLETED students are
  // skipped by refreshQuestionSets's own C-1 guard ("finished work is never moved back") — untouched, as required
  const fresh = await repo.findUnique("Assignment", { id: input.assignmentId });
  if (fresh) await refreshQuestionSets(repo, [fresh], null, now);

  return { added: newFreeIds.length, removed: removedIds.length, lockedKept: lockedRows.length, protectedFromRemoval, studentsAffected, questions: lockedRows.length + desiredFreeIds.length };
}

export interface ConvertReviewToAdaptiveInput {
  assignmentId: string;
  /** optional overrides; sensible defaults are used otherwise (see convertReviewToAdaptive's own comment) */
  maxQuestions?: number;
  targetCorrect?: number;
}

export interface ConvertReviewToAdaptiveResult {
  converted: boolean;
  /** present only when converted is false: why, for the teacher to read as-is */
  reason?: string;
  /** the set's question count (unchanged by this call either way) */
  questions: number;
}

/**
 * 🆕 feature (Oct 2026, "خليها Adaptive بعد ما بعتها"): flips an already-sent FIXED Review (an Assignment +
 * Assessment built by assignQuestions, target ASSESSMENT) to Adaptive IN PLACE — same Assignment/Assessment id,
 * so students and the teacher keep seeing the same assignment, just now drawing adaptively from its pool.
 *
 * SAFETY RULE: allowed ONLY when ZERO students have answered anything on this assignment yet (every
 * AssignmentStudent row is still NOT_STARTED — checked directly via "any QuestionAttempt of any PracticeSession of
 * this assignmentId", same technique updateSentReview already uses for its locked-question detection, since that is
 * more robust than trusting AssignmentStudent.status alone). Once ANYONE has answered, converting is semantically
 * broken: the adaptive engine (leveled-run.ts's adaptiveNext) fixes the student's starting rung from the LEVEL OF
 * THE FIRST QUESTION THEY ANSWERED (`attempts[0]`) and then replays every answer through decideLevel assuming
 * adaptive-engine-chosen ordering — a fixed, teacher-chosen order was never built with that replay in mind, so the
 * starting level becomes an accident of whichever question the teacher happened to put first, while those answers
 * still count against the question budget (maxQuestions/targetCorrect). With ZERO prior answers there is no
 * history to misinterpret: adaptiveNext's first call sees `attempts.length === 0` and picks the start level the
 * normal way (startLevel()), exactly as if the set had been Adaptive from the very start — so the conversion is
 * fully safe precisely in, and only in, that case.
 */
export async function convertReviewToAdaptive(repo: Repo, actor: Actor, input: ConvertReviewToAdaptiveInput, now = new Date()): Promise<ConvertReviewToAdaptiveResult> {
  assertCan(actor, "assignments:create");
  const a = await repo.findUnique("Assignment", { id: input.assignmentId });
  if (!a || a.deletedAt) throw new ForbiddenError("Assignment not found.");
  if (a.target !== "ASSESSMENT" || !a.assessmentId) throw new ValidationError("Only a sent Review (built from chosen questions) can be converted this way.");
  await assertClassAccess(repo, actor, s(a.classId));

  const assessmentId = s(a.assessmentId);
  const [set, existing, sessions] = await Promise.all([
    repo.findUnique("Assessment", { id: assessmentId }),
    repo.findMany("AssessmentQuestion", { assessmentId }, { select: ["questionId"] }),
    repo.findMany("PracticeSession", { assignmentId: input.assignmentId }, { select: ["id"] }),
  ]);
  const questions = existing.length;
  if (!set) throw new ForbiddenError("Assignment not found.");
  if (set.isAdaptive) return { converted: false, reason: "This Review is already Adaptive.", questions };

  // the core safety check: has ANY student assigned to THIS assignment answered ANYTHING yet (whatever their
  // status is now) — independent of AssignmentStudent.status, same robustness as updateSentReview's lock check
  const sessionIds = sessions.map((x) => s(x.id));
  const attempts = sessionIds.length ? await repo.findMany("QuestionAttempt", { sessionId: { in: sessionIds } }, { select: ["id"] }) : [];
  if (attempts.length) {
    const started = await repo.count("AssignmentStudent", { assignmentId: input.assignmentId, status: { not: "NOT_STARTED" } });
    return { converted: false, reason: `${started} student${started === 1 ? " has" : "s have"} already started this Review, so it can't be converted to Adaptive. Send a new Adaptive Review instead.`, questions };
  }

  // sensible defaults, mirroring assignQuestions' own adaptive-creation path: a goal of correct answers caps the
  // pool read at GOAL_SAFETY_CAP (the student may keep going until they reach it); without a goal, the whole
  // existing question set stays the pool (nothing the teacher already collected is dropped by converting)
  const target = input.targetCorrect ? Math.max(5, Math.min(50, Math.round(input.targetCorrect))) : null;
  const maxQuestions = target ? GOAL_SAFETY_CAP : Math.max(1, Math.min(questions, Math.round(input.maxQuestions || questions)));

  await repo.transaction(async (tx) => {
    await tx.updateMany("Assessment", { id: assessmentId }, { isAdaptive: true, maxQuestions, targetCorrect: target });
    await audit(tx, {
      actorId: actor.userId, action: "assignment.convert_to_adaptive", entityType: "Assignment", entityId: input.assignmentId,
      before: { isAdaptive: false }, after: { isAdaptive: true, maxQuestions, targetCorrect: target }, at: now,
    });
  });
  return { converted: true, questions };
}

export interface SentReviewSummary { assignmentId: string; title: string; createdAt: string; dueAt: string | null; questions: number; students: number; isAdaptive: boolean }

/**
 * 🆕 feature (Oct 2026): question-set Reviews this teacher already sent to a class (Assignment.target ASSESSMENT,
 * not a My Tests test), newest first — lets the Review Builder's ⭐ Assign dialog offer "update this sent Review
 * instead of sending a new one" for the chosen class, since there is no stored link from an Assignment back to the
 * TeacherReviewSet it was built from (the Review Builder may have changed since) — the teacher picks the one they
 * mean from their own recent sends, same as choosing a class or students today.
 */
export async function sentReviewAssignmentsForClass(repo: Repo, actor: Actor, classId: string): Promise<SentReviewSummary[]> {
  assertCan(actor, "assignments:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const teacher = await assigningTeacher(repo, actor, String(klass.id));
  if (!teacher) return [];
  // testId / curriculumPlanId excluded: My Tests and curriculum-plan places are built from the same assignQuestions
  // helper but are not "a Review" the teacher edits here — only plain question-set sends (Review Builder, the
  // shared ⭐ Assign window's "I'll pick the questions") show up to update
  const rows = await repo.findMany("Assignment", { classId: klass.id, target: "ASSESSMENT", testId: null, curriculumPlanId: null, deletedAt: null, createdById: teacher.id }, { select: ["id", "title", "createdAt", "dueAt", "assessmentId"] });
  if (!rows.length) return [];
  const assessmentIds = [...new Set(rows.map((r) => s(r.assessmentId)))];
  const [qRows, sRows, sets] = await Promise.all([
    repo.findMany("AssessmentQuestion", { assessmentId: { in: assessmentIds } }, { select: ["assessmentId"] }),
    repo.findMany("AssignmentStudent", { assignmentId: { in: rows.map((r) => s(r.id)) } }, { select: ["assignmentId"] }),
    // 🆕 feature (Oct 2026): so the UI can offer "Convert to Adaptive" only for a Review that is still Fixed
    repo.findMany("Assessment", { id: { in: assessmentIds } }, { select: ["id", "isAdaptive"] }),
  ]);
  const qCount = new Map<string, number>(); for (const x of qRows) qCount.set(s(x.assessmentId), (qCount.get(s(x.assessmentId)) ?? 0) + 1);
  const sCount = new Map<string, number>(); for (const x of sRows) sCount.set(s(x.assignmentId), (sCount.get(s(x.assignmentId)) ?? 0) + 1);
  const adaptiveOf = new Map(sets.map((x) => [s(x.id), Boolean(x.isAdaptive)]));
  return rows.map((r) => ({
    assignmentId: s(r.id), title: s(r.title), createdAt: d(r.createdAt)!.toISOString(), dueAt: d(r.dueAt)?.toISOString() ?? null,
    questions: qCount.get(s(r.assessmentId)) ?? 0, students: sCount.get(s(r.id)) ?? 0, isAdaptive: adaptiveOf.get(s(r.assessmentId)) ?? false,
  })).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

/** Statuses for question sets: Completed when every question is answered; Overdue after the due date. */
export async function refreshQuestionSets(repo: Repo, assignments: Row[], studentIds: string[] | null, now = new Date()): Promise<void> {
  const list = assignments.filter((a) => a.assessmentId && !a.deletedAt);
  if (!list.length) return;
  const byStudent = studentIds ? { studentId: { in: studentIds } } : {};
  const [rows, sessions, items] = await Promise.all([
    repo.findMany("AssignmentStudent", { assignmentId: { in: list.map((a) => a.id) }, ...byStudent }),
    repo.findMany("PracticeSession", { assignmentId: { in: list.map((a) => a.id) }, mode: "TEACHER_QUIZ", ...byStudent }, { select: ["assignmentId", "studentId", "questionCount", "correctCount", "endedAt", "goalReachedAt"] }),
    repo.findMany("AssessmentQuestion", { assessmentId: { in: list.map((a) => a.assessmentId) } }, { select: ["assessmentId"] }),
  ]);
  const total = new Map<string, number>();
  for (const x of items) total.set(s(x.assessmentId), (total.get(s(x.assessmentId)) ?? 0) + 1);
  const answered = new Map(sessions.map((x) => [`${s(x.assignmentId)}|${s(x.studentId)}`, Number(x.questionCount ?? 0)]));
  const ended = new Set(sessions.filter((x) => x.endedAt).map((x) => `${s(x.assignmentId)}|${s(x.studentId)}`));
  // adaptive sets: each student answers up to maxQuestions of a larger pool, and is done when the session ends
  const sets = await repo.findMany("Assessment", { id: { in: [...new Set(list.map((a) => s(a.assessmentId)))] } }, { select: ["id", "isAdaptive", "maxQuestions", "targetCorrect"] });
  const adaptive = new Map(sets.filter((x) => x.isAdaptive).map((x) => [s(x.id), Number(x.maxQuestions) || 0]));
  const goalOf = new Map(sets.filter((x) => x.isAdaptive && Number(x.targetCorrect) > 0).map((x) => [s(x.id), Number(x.targetCorrect)]));
  const sessionOf = new Map(sessions.map((x) => [`${s(x.assignmentId)}|${s(x.studentId)}`, x]));
  const byId = new Map(list.map((a) => [s(a.id), a]));
  const writes: Promise<unknown>[] = [];
  for (const r of rows) {
    const a = byId.get(s(r.assignmentId))!;
    if (r.status === "COMPLETED" || d(r.completedAt)) continue; // C-1: finished work is never moved back
    const pool = total.get(s(a.assessmentId)) ?? 0;
    const n = adaptive.has(s(a.assessmentId)) ? Math.min(pool, adaptive.get(s(a.assessmentId)) || pool) : pool;
    const k = answered.get(`${s(a.id)}|${s(r.studentId)}`) ?? 0;
    const goal = goalOf.get(s(a.assessmentId));
    const ses = sessionOf.get(`${s(a.id)}|${s(r.studentId)}`);
    // a goal set: done once the goal of correct answers was reached (the student may go on practising), or when the
    // set ended without it (its questions ran out: the student finished everything there was)
    const done = goal ? Boolean(ses?.goalReachedAt) || Boolean(ses?.endedAt)
      : n > 0 && (k >= n || (adaptive.has(s(a.assessmentId)) && ended.has(`${s(a.id)}|${s(r.studentId)}`)));
    const due = d(a.dueAt);
    const status = done ? "COMPLETED" : due && now > due ? "OVERDUE" : k > 0 ? "IN_PROGRESS" : "NOT_STARTED";
    const progress = goal ? (done ? 1 : Math.round((1000 * Math.min(Number(ses?.correctCount ?? 0), goal - 1)) / goal) / 1000) : n ? Math.round((1000 * Math.min(k, n)) / n) / 1000 : 0;
    const completedAt = done ? (d(r.completedAt) ?? now) : null;
    if (status !== r.status || Math.abs(progress - Number(r.progress)) > 0.0005 || (completedAt === null) !== (d(r.completedAt) === null)) {
      writes.push(repo.updateMany("AssignmentStudent", { assignmentId: a.id, studentId: r.studentId, ...(completedAt ? {} : { completedAt: null }) }, { status, progress, completedAt }));
    }
  }
  await Promise.all(writes);
}

/**
 * ⭐ Assign one skill to SEVERAL of the teacher's classes at once (the dialog lists every class the teacher teaches).
 * One assignment per class (each class keeps its own list and reports). Picked students are matched to their own
 * class; a class with none of the picked students is skipped in "selected students" mode. Each class is checked by
 * assignSkill itself (own classes only).
 */
export async function assignSkillToClasses(repo: Repo, actor: Actor, input: Omit<AssignSkillInput, "classId"> & { classIds: string[] }, now = new Date()): Promise<{ assignmentIds: string[]; students: number; classes: number }> {
  const classIds = [...new Set(input.classIds.map(s).filter(Boolean))];
  if (!classIds.length) throw new ValidationError("Choose at least one class.");
  requireSource(input.source);
  // every class is checked BEFORE anything is written (all or nothing)
  for (const id of classIds) await assertClassAccess(repo, actor, id);
  const picked = [...new Set((input.studentIds ?? []).map(s).filter(Boolean))];
  const members = picked.length ? await repo.findMany("ClassMembership", { classId: { in: classIds }, studentId: { in: picked }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  if (picked.length) {
    const known = new Set(members.map((m) => s(m.studentId)));
    if (picked.some((id) => !known.has(id))) throw new ForbiddenError("You can only assign work to students in the chosen classes.");
  }
  const ids: string[] = []; let students = 0;
  for (const classId of classIds) {
    const mine = picked.length ? members.filter((m) => s(m.classId) === classId).map((m) => s(m.studentId)) : [];
    if (picked.length && !mine.length) continue;
    const r = await assignSkill(repo, actor, { ...input, classId, studentIds: mine }, now);
    ids.push(r.assignmentId); students += r.students;
  }
  if (!ids.length) throw new ValidationError("Choose at least one student.");
  return { assignmentIds: ids, students, classes: ids.length };
}

/** The teacher's classes with their students (for the “assign questions” dialog). */
export async function teacherRoster(repo: Repo, actor: Actor): Promise<{ id: string; name: string; grade: number; students: { id: string; name: string }[] }[]> {
  if (actor.role !== "TEACHER") return [];
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return [];
  const [grades, members] = await Promise.all([
    repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => c.gradeId))] } }, { select: ["id", "level"] }),
    repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] }),
  ]);
  const students = members.length ? await repo.findMany("Student", { id: { in: [...new Set(members.map((m) => m.studentId))] } }, { select: ["id", "userId"] }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(students.map((x) => [s(x.id), s(users.find((u) => u.id === x.userId)?.displayName ?? "Student")]));
  const level = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  return classes.map((c) => ({
    id: s(c.id), name: s(c.name), grade: level.get(s(c.gradeId)) ?? 0,
    students: members.filter((m) => m.classId === c.id).map((m) => ({ id: s(m.studentId), name: nameOf.get(s(m.studentId)) ?? "Student" })).sort((x, y) => x.name.localeCompare(y.name)),
  })).sort((x, y) => x.grade - y.grade || x.name.localeCompare(y.name));
}
