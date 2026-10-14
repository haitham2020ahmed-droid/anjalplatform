/**
 * 🚀 ReadRise — the teacher's actions on the dashboard.
 *
 *   teacherReadRiseClasses   classes the teacher may open (own + coordinated grades; admins every class)
 *   assignArticle            put a published, visible article on a class's list (RRClassArticle, optional due date)
 *   unassignArticle / classArticles
 *   scoreWriting             score a written answer 0–4 with a comment (the student's teacher or a school admin)
 *   setStudentLevel          manual level set with a reason → RRStudent.source TEACHER + an RRLevelChange
 *   allowPlacementRetake     lets a student take the placement test again (once per term)
 *
 * Writes need a class the teacher TEACHES (coordinators may read other classes but not change them).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { accessibleClasses } from "../teacher/assign";
import { readableClasses } from "../teacher/coordinators";
import { ENGINE, assertStaffForStudent, setLevelByTeacher } from "./engine";
import { teacherResetPlacement } from "./placement";
import { canView, hiddenArticleIds } from "./library";

const s = (v: unknown) => String(v ?? "");
const isStaff = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

export interface RRClassOption { id: string; name: string; grade: number; own: boolean }

/** Classes for the class selector, sorted by grade then name. */
export async function teacherReadRiseClasses(repo: Repo, actor: Actor): Promise<RRClassOption[]> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can open ReadRise reports.");
  const [read, own] = await Promise.all([readableClasses(repo, actor), accessibleClasses(repo, actor)]);
  const ownIds = new Set(own.map((c) => s(c.id)));
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(read.map((c) => s(c.gradeId)))] } });
  const gl = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  return read.map((c) => ({ id: s(c.id), name: s(c.name), grade: gl.get(s(c.gradeId)) ?? 0, own: ownIds.has(s(c.id)) }))
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** A class the actor teaches (or any class of an admin's school). */
async function assertClassWrite(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can assign ReadRise articles.");
  assertCan(actor, "assignments:create");
  const c = (await accessibleClasses(repo, actor)).find((k) => s(k.id) === classId);
  if (!c) throw new ForbiddenError("You can only assign articles to classes you teach.");
  return c;
}

/** Puts an article on a class's list (students still read the version of their own level). Re-assigning updates the due date. */
export async function assignArticle(repo: Repo, actor: Actor, classId: string, articleId: string, dueAt: Date | null, now = new Date()): Promise<{ created: boolean }> {
  await assertClassWrite(repo, actor, classId);
  const a = await repo.findUnique("RRArticle", { id: articleId });
  const hidden = await hiddenArticleIds(repo, actor.schoolId);
  if (!a || !canView(actor, a, hidden) || a.status !== "PUBLISHED" || hidden.has(articleId)) throw new ValidationError("Choose a published article from the library.");
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new ValidationError("The due date is not valid.");
  const have = await repo.findUnique("RRClassArticle", { classId, articleId });
  await repo.upsert("RRClassArticle", { classId, articleId }, { classId, articleId, assignedById: actor.userId, dueAt, createdAt: now }, { dueAt });
  await audit(repo, { actorId: actor.userId, action: "readrise.assign", entityType: "RRClassArticle", entityId: `${classId}:${articleId}`, after: { dueAt: dueAt?.toISOString() ?? null }, at: now });
  return { created: !have };
}

export async function unassignArticle(repo: Repo, actor: Actor, classId: string, articleId: string, now = new Date()): Promise<void> {
  await assertClassWrite(repo, actor, classId);
  await repo.deleteMany("RRClassArticle", { classId, articleId });
  await audit(repo, { actorId: actor.userId, action: "readrise.unassign", entityType: "RRClassArticle", entityId: `${classId}:${articleId}`, at: now });
}

export interface ClassArticleRow { articleId: string; code: string; title: string; topic: string; dueAt: string | null; assignedAt: string; done: number; students: number }

/** The class's assigned articles with how many students finished each (first try). */
export async function classArticles(repo: Repo, actor: Actor, classId: string): Promise<ClassArticleRow[]> {
  const read = await readableClasses(repo, actor);
  if (!read.some((c) => s(c.id) === classId)) throw new ForbiddenError("You cannot open this class.");
  const links = await repo.findMany("RRClassArticle", { classId });
  if (!links.length) return [];
  const ids = links.map((l) => s(l.articleId));
  const [arts, members] = await Promise.all([
    repo.findMany("RRArticle", { id: { in: ids } }),
    repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] }),
  ]);
  const sids = members.map((m) => s(m.studentId));
  const runs = sids.length ? await repo.findMany("RRRun", { studentId: { in: sids }, articleId: { in: ids } }, { select: ["studentId", "articleId", "completedAt"] }) : [];
  return links.map((l) => {
    const a = arts.find((x) => s(x.id) === s(l.articleId));
    const done = new Set(runs.filter((r) => s(r.articleId) === s(l.articleId) && r.completedAt).map((r) => s(r.studentId))).size;
    return {
      articleId: s(l.articleId), code: s(a?.code), title: a ? s(a.title) : "(deleted article)", topic: s(a?.topic),
      dueAt: l.dueAt ? new Date(l.dueAt as string | Date).toISOString() : null, assignedAt: new Date(l.createdAt as string | Date).toISOString(), done, students: sids.length,
    };
  }).filter((r) => r.code).sort((a, b) => s(a.dueAt ?? "9").localeCompare(s(b.dueAt ?? "9")) || a.title.localeCompare(b.title));
}

/** Scores a written answer (0–4) with an optional comment. Only the student's teacher or a school admin. */
export async function scoreWriting(repo: Repo, actor: Actor, runId: string, score: number, comment: string, now = new Date()): Promise<void> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can score writing.");
  const run = await repo.findUnique("RRRun", { id: runId });
  if (!run) throw new ValidationError("This answer does not exist.");
  await assertStaffForStudent(repo, actor, s(run.studentId));
  if (!s(run.writing).trim()) throw new ValidationError("There is no written answer to score.");
  if (!Number.isInteger(score) || score < 0 || score > 4) throw new ValidationError("The score must be 0, 1, 2, 3 or 4.");
  const text = comment.trim();
  if (text.length > 1000) throw new ValidationError("The comment is too long (1,000 characters at most).");
  await repo.updateMany("RRRun", { id: runId }, { writingScore: score, writingComment: text || null, writingScoredById: actor.userId });
  await audit(repo, { actorId: actor.userId, action: "readrise.writing.score", entityType: "RRRun", entityId: runId, before: { writingScore: run.writingScore ?? null }, after: { writingScore: score }, at: now });
}

/** Manual level set by the teacher (a reason is required); recorded as a teacher change. */
export async function setStudentLevel(repo: Repo, actor: Actor, studentId: string, level: number, reason: string, now = new Date()): Promise<{ from: number; to: number }> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can set a ReadRise Level.");
  if (!Number.isFinite(level) || level < ENGINE.min || level > ENGINE.max) throw new ValidationError(`Enter a ReadRise Level from ${ENGINE.min} to ${ENGINE.max}.`);
  const why = reason.trim();
  if (why.length < 3) throw new ValidationError("Write a short reason for the change (for example: “MAP Lexile 820 in the winter test”).");
  const r = await setLevelByTeacher(repo, actor, studentId, level, why.slice(0, 250), now);
  await audit(repo, { actorId: actor.userId, action: "readrise.level.teacher", entityType: "RRStudent", entityId: studentId, before: { level: r.from }, after: { level: r.to, reason: why.slice(0, 250) }, at: now });
  return r;
}

/** Allows one placement retake (once per term; see placement.ts). */
export async function allowPlacementRetake(repo: Repo, actor: Actor, studentId: string, reason = "", now = new Date()): Promise<{ restarted: boolean }> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can allow a placement retake.");
  const r = await teacherResetPlacement(repo, actor, studentId, reason.trim().slice(0, 200), now);
  await audit(repo, { actorId: actor.userId, action: r.restarted ? "readrise.placement.restart" : "readrise.placement.retake", entityType: "RRStudent", entityId: studentId, at: now });
  return { restarted: Boolean(r.restarted) };
}
