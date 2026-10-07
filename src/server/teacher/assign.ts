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
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "./assignments";

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

export interface AssignSkillInput {
  classId: string;
  skillId: string;
  /** undefined or empty = the whole class */
  studentIds?: string[];
  startAt?: Date | null;
  dueAt?: Date | null;
  note?: string | null;
  targetMastery?: number;
}

export async function assignSkill(repo: Repo, actor: Actor, input: AssignSkillInput, now = new Date()): Promise<{ assignmentId: string; students: number }> {
  assertCan(actor, "assignments:create");
  if (!input.classId) throw new ValidationError("Choose a class.");
  if (!input.skillId) throw new ValidationError("Choose a skill to assign.");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const teacher = await repo.findUnique("Teacher", { userId: actor.userId });
  if (!teacher) throw new ForbiddenError("Only teachers can assign skills.");
  const [skill, curs, members] = await Promise.all([
    repo.findUnique("Skill", { id: input.skillId }),
    repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }),
    repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] }),
  ]);
  if (!skill || skill.deletedAt || skill.isActive === false || !curs.some((c) => c.id === skill.curriculumId)) throw new ValidationError("Choose an active skill from this class's curriculum.");
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

  const students = await repo.findMany("Student", { id: { in: recipients } }, { select: ["id", "userId"] });
  const id = await repo.transaction(async (tx) => {
    const a = await tx.create("Assignment", {
      classId: klass.id, createdById: teacher.id, title: s(skill.name).slice(0, 191), target: "SKILL", skillId: skill.id, skillIds: [s(skill.id)],
      startAt, dueAt, note, targetMastery: target, createdAt: now,
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
      writes.push(repo.updateMany("AssignmentStudent", { assignmentId: a.id, studentId: r.studentId }, { status: st.status, progress: st.progress, completedAt }));
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
    await repo.updateMany("AssignmentStudent", { assignmentId, studentId }, { status: st.status, progress: st.progress, completedAt });
  }
}

// ------------------------------------------------------------------ teacher views

async function accessibleClasses(repo: Repo, actor: Actor): Promise<Row[]> {
  assertCan(actor, "assignments:read");
  // students (and parents) also hold assignments:read for their OWN work; class views are for staff only
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can see class assignments.");
  if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") return (await repo.findMany("Class", { schoolId: actor.schoolId, deletedAt: null }));
  const t = await repo.findUnique("Teacher", { userId: actor.userId });
  if (!t) return [];
  const links = await repo.findMany("ClassTeacher", { teacherId: t.id }, { select: ["classId"] });
  return links.length ? (await repo.findMany("Class", { id: { in: links.map((l) => l.classId) }, deletedAt: null })) : [];
}

export interface TeacherCurriculum {
  classes: { id: string; name: string; grade: number }[];
  classId: string;
  grade: { level: number; name: string };
  units: { id: string; number: number; title: string; skills: { id: string; name: string; code: string; standards: string[]; lessons: string[]; openAssignments: number }[] }[];
  students: { id: string; name: string }[];
}

/** Grade → Unit → Skill → Standard for one of the teacher's classes, with its students (for ⭐ Assign). */
export async function teacherCurriculum(repo: Repo, actor: Actor, classId?: string): Promise<TeacherCurriculum | null> {
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return null;
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => c.gradeId))] } });
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const sorted = classes.sort((a, b) => (levelOf.get(s(a.gradeId)) ?? 0) - (levelOf.get(s(b.gradeId)) ?? 0) || s(a.name).localeCompare(s(b.name)));
  const klass = classId ? sorted.find((c) => c.id === classId) : sorted[0];
  if (!klass) throw new ForbiddenError("You do not teach this class.");
  const grade = grades.find((g) => g.id === klass.gradeId)!;
  const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
  const [units, skills, members, assignments] = await Promise.all([
    cur ? repo.findMany("Unit", { curriculumId: cur.id, deletedAt: null }) : Promise.resolve([] as Row[]),
    cur ? repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null, isActive: true }, { select: ["id", "name", "code"] }) : Promise.resolve([] as Row[]),
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
  const openBySkill = new Map<string, number>();
  const openAssignmentIds = new Set(openRows.map((r) => s(r.assignmentId)));
  for (const a of assignments) if (a.skillId && openAssignmentIds.has(s(a.id))) openBySkill.set(s(a.skillId), (openBySkill.get(s(a.skillId)) ?? 0) + 1);
  const skillById = new Map(skills.map((k) => [s(k.id), k]));
  const names = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  return {
    classes: sorted.map((c) => ({ id: s(c.id), name: s(c.name), grade: levelOf.get(s(c.gradeId)) ?? 0 })),
    classId: s(klass.id), grade: { level: Number(grade.level), name: s(grade.name) },
    units: activeUnits.map((u) => {
      const myLessons = new Set(lessons.filter((l) => l.unitId === u.id).map((l) => s(l.id)));
      return {
        id: s(u.id), number: Number(u.number), title: s(u.title),
        skills: unitSkills.filter((x) => x.unitId === u.id).sort((a, b) => Number(a.order) - Number(b.order)).map((x) => skillById.get(s(x.skillId))).filter((k): k is Row => Boolean(k)).map((k) => ({
          id: s(k.id), name: s(k.name), code: s(k.code),
          standards: links.filter((l) => l.skillId === k.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((l) => stdCode.get(s(l.standardId)) ?? "").filter(Boolean),
          lessons: [...new Set(lessonSkills.filter((ls) => ls.skillId === k.id && myLessons.has(s(ls.lessonId))).map((ls) => lessonNo.get(s(ls.lessonId)) ?? 0))].sort((a, b) => a - b).map((n) => `L${n}`),
          openAssignments: openBySkill.get(s(k.id)) ?? 0,
        })),
      };
    }),
    students: students.map((x) => ({ id: s(x.id), name: names.get(s(x.userId)) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export interface WeeklyRow { id: string; skill: string; className: string; assigned: number; counts: Record<Status, number>; dueAt: string | null; startAt: string | null; createdAt: string; scope: "class" | "students" }

/** Skill assignments created or due in the week starting `weekStart`, for the classes the actor may see. */
export async function weeklyAssignments(repo: Repo, actor: Actor, weekStart: Date, now = new Date()): Promise<WeeklyRow[]> {
  const classes = await accessibleClasses(repo, actor);
  if (!classes.length) return [];
  const end = new Date(weekStart.getTime() + 7 * 86_400_000);
  const all = await repo.findMany("Assignment", { classId: { in: classes.map((c) => c.id) }, deletedAt: null });
  const inWeek = all.filter((a) => {
    const c = d(a.createdAt)!, due = d(a.dueAt);
    return (c >= weekStart && c < end) || (due && due >= weekStart && due < end);
  });
  if (!inWeek.length) return [];
  await refreshSkillAssignments(repo, inWeek, null, now);
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
      id: s(a.id), skill: s(a.title), className: className.get(s(a.classId)) ?? "", assigned: mine.length, counts,
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
export async function assignmentDetail(repo: Repo, actor: Actor, assignmentId: string, now = new Date()): Promise<AssignmentDetail> {
  assertCan(actor, "assignments:read");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can see assignment results.");
  const a = await repo.findUnique("Assignment", { id: assignmentId });
  if (!a || a.deletedAt) throw new ForbiddenError("Assignment not found.");
  const klass = await assertClassAccess(repo, actor, s(a.classId));
  if (a.skillId) await refreshSkillAssignment(repo, a, null, now);
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
