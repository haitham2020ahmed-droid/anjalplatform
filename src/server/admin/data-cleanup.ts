/**
 * 🧹 Data cleanup (admin): the simple things to fix, each as a count with one button to the page that fixes it.
 * Read-only: nothing is changed, published or deleted here. Reads in chunks (memory-light).
 */
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { isHiddenSkill } from "../skills/master";
import { countUnclassified } from "../questions/link-bank-run";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const CHUNK = 400;
const LIVE = ["DRAFT", "UNDER_REVIEW", "PUBLISHED"];

export interface CleanupCounts {
  unclassified: number;
  underReview: number;
  drafts: number;
  studentsWithoutClass: number;
  classesWithoutTeacher: number;
  skillsWithoutQuestions: number;
  /** a few skill names (the full list is on the bank pages) */
  emptySkills: { id: string; name: string; grade: number }[];
  studentsWithoutMap: number;
}

async function chunked<T>(ids: string[], fn: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await fn(ids.slice(i, i + CHUNK))));
  return out;
}

export async function cleanupCounts(repo: Repo, actor: Actor): Promise<CleanupCounts> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can do this.");
  assertCan(actor, "students:manage");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const schoolId = actor.schoolId;

  // skills of the school (real, active) and their questions
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
  const levelOfCur = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "code", "name", "isActive", "curriculumId"] }) : [];
  const real = skills.filter((k) => !isHiddenSkill(k.code) && k.isActive !== false && k.isActive !== 0);
  const allIds = skills.map((k) => s(k.id));
  let underReview = 0, drafts = 0;
  for (let i = 0; i < allIds.length; i += CHUNK) {
    const part = allIds.slice(i, i + CHUNK);
    underReview += await repo.count("Question", { skillId: { in: part }, deletedAt: null, status: "UNDER_REVIEW" });
    drafts += await repo.count("Question", { skillId: { in: part }, deletedAt: null, status: "DRAFT" });
  }
  const withQuestions = new Set<string>();
  for (let i = 0; i < real.length; i += CHUNK) {
    const part = real.slice(i, i + CHUNK).map((k) => s(k.id));
    // one row per skill that has a question is enough: page through skillIds only
    for (const q of await repo.findMany("Question", { skillId: { in: part }, deletedAt: null, status: { in: LIVE } }, { select: ["skillId"] })) withQuestions.add(s(q.skillId));
  }
  const empty = real.filter((k) => !withQuestions.has(s(k.id)));

  // students and classes
  const [students, users, allClasses, years] = await Promise.all([
    repo.findMany("Student", { schoolId }, { select: ["id", "userId"] }),
    repo.findMany("User", { schoolId, role: "STUDENT", isActive: true, deletedAt: null }, { select: ["id"] }),
    repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "academicYearId"] }),
    repo.findMany("AcademicYear", { schoolId }, { select: ["id", "isCurrent"] }),
  ]);
  // the same classes as the School page: this academic year's
  const year = years.find((y) => y.isCurrent);
  const classes = allClasses.filter((c) => !year || s(c.academicYearId) === s(year.id));
  const activeUsers = new Set(users.map((u) => s(u.id)));
  const active = students.filter((x) => activeUsers.has(s(x.userId))).map((x) => s(x.id));
  const members = await chunked(active, (part) => repo.findMany("ClassMembership", { studentId: { in: part }, leftAt: null }, { select: ["studentId", "classId"] }));
  const current = new Set(classes.map((c) => s(c.id)));
  const inClass = new Set(members.filter((m) => current.has(s(m.classId))).map((m) => s(m.studentId)));
  const withMap = new Set((await chunked(active, (part) => repo.findMany("MapResult", { studentId: { in: part } }, { select: ["studentId"] }) as Promise<Row[]>)).map((m) => s(m.studentId)));
  const links = await chunked(classes.map((c) => s(c.id)), (part) => repo.findMany("ClassTeacher", { classId: { in: part } }, { select: ["classId"] }));
  const taught = new Set(links.map((l) => s(l.classId)));

  return {
    unclassified: await countUnclassified(repo, schoolId),
    underReview, drafts,
    studentsWithoutClass: active.filter((id) => !inClass.has(id)).length,
    classesWithoutTeacher: classes.filter((c) => !taught.has(s(c.id))).length,
    skillsWithoutQuestions: empty.length,
    emptySkills: empty.slice(0, 8).map((k) => ({ id: s(k.id), name: s(k.name), grade: levelOfCur.get(s(k.curriculumId)) ?? 0 })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)),
    studentsWithoutMap: active.filter((id) => !withMap.has(id)).length,
  };
}
