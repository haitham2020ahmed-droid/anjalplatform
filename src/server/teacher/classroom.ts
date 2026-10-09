/**
 * 🧑‍🏫 Class routines:
 *   🎫 exit tickets (3 quick questions at the end of a lesson, live results), 🎯 weekly goals (the student's own and
 *   the class goal), 📅 the weekly rhythm (practice days per week + a reminder), 💬 teacher comments on a student's
 *   work (seen by the student and the parent), 🚩 “unclear question” flags, 🔁 “Review my mistakes” (spaced).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "./assignments";
import { assertClassRead } from "./coordinators";
import { audit } from "../audit";
import { loadQuestionItems, loadSkillItems, toClientQuestion, type ClientQuestion } from "../practice/items";
import { classMembers, studentNames } from "../insights/student-data";
import { gradeItems, type Graded } from "./worksheet";
import { hideLevels } from "../../lib/hide-levels";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;
const parseIds = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : typeof v === "string" ? (JSON.parse(v) as string[]) : []);

/** Monday 00:00 UTC of the week of this date. */
export function weekStart(d: Date): Date { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t; }

async function myClassIds(repo: Repo, studentId: string): Promise<string[]> {
  return (await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId));
}
function student(actor: Actor): string { if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only."); return actor.studentId; }

// ------------------------------------------------------------------ 🎫 exit tickets

export async function createExitTicket(repo: Repo, actor: Actor, classId: string, input: { skillId?: string | null; questionIds?: string[]; title?: string }, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  let ids = (input.questionIds ?? []).filter(Boolean).slice(0, 5);
  let title = s(input.title).trim();
  if (!ids.length) {
    if (!input.skillId) throw new ValidationError("Choose a skill.");
    const items = (await loadSkillItems(repo, input.skillId)).filter((i) => i.type !== "SHORT_ANSWER");
    if (items.length < 3) throw new ValidationError("This skill needs at least 3 questions.");
    // three questions of increasing difficulty around the middle of the skill
    const sorted = [...items].sort((a, b) => a.level - b.level);
    const at = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
    ids = [...new Set([at(0.3), at(0.5), at(0.75)].map((i) => i.questionId))];
    for (const i of sorted) { if (ids.length >= 3) break; if (!ids.includes(i.questionId)) ids.push(i.questionId); }
    if (!title) title = s((await repo.findUnique("Skill", { id: input.skillId }))?.name);
  }
  const close = await repo.findMany("ExitTicket", { classId, status: "OPEN" }, { select: ["id"] });
  if (close.length) await repo.updateMany("ExitTicket", { id: { in: close.map((c) => c.id) } }, { status: "CLOSED", closedAt: now });
  const t = await repo.create("ExitTicket", { schoolId: actor.schoolId!, classId, createdById: actor.userId, title: `🎫 ${hideLevels(title) || "Exit ticket"}`.slice(0, 191), questionIds: ids, status: "OPEN", createdAt: now, closedAt: null });
  await audit(repo, { actorId: actor.userId, action: "exit.create", entityType: "ExitTicket", entityId: s(t.id), after: { classId, questions: ids.length }, at: now });
  return s(t.id);
}

export async function closeExitTicket(repo: Repo, actor: Actor, ticketId: string, now = new Date()): Promise<void> {
  const t = await repo.findUnique("ExitTicket", { id: ticketId });
  if (!t) throw new ForbiddenError("Not found.");
  await assertClassAccess(repo, actor, s(t.classId));
  await repo.updateMany("ExitTicket", { id: ticketId }, { status: "CLOSED", closedAt: now });
}

/** The open exit ticket of the student's class that the student has not answered yet. */
export async function myExitTicket(repo: Repo, actor: Actor): Promise<{ id: string; title: string; questions: ClientQuestion[] } | null> {
  const sid = student(actor);
  const classes = await myClassIds(repo, sid);
  if (!classes.length) return null;
  const open = (await repo.findMany("ExitTicket", { classId: { in: classes }, status: "OPEN" })).sort((a, b) => time(b.createdAt) - time(a.createdAt));
  for (const t of open) {
    if ((await repo.count("ExitTicketAnswer", { ticketId: t.id, studentId: sid })) > 0) continue;
    const items = await loadQuestionItems(repo, parseIds(t.questionIds));
    return { id: s(t.id), title: s(t.title), questions: items.map((i) => toClientQuestion(i, `${t.id}:${i.questionId}`)) };
  }
  return null;
}

export async function submitExitTicket(repo: Repo, actor: Actor, ticketId: string, responses: Record<string, unknown>, now = new Date()): Promise<{ correct: number; total: number; review: Graded[] }> {
  const sid = student(actor);
  const t = await repo.findUnique("ExitTicket", { id: ticketId });
  if (!t || !(await myClassIds(repo, sid)).includes(s(t.classId))) throw new ForbiddenError("Not your exit ticket.");
  if (t.status !== "OPEN") throw new ValidationError("This exit ticket is closed.");
  if ((await repo.count("ExitTicketAnswer", { ticketId, studentId: sid })) > 0) throw new ValidationError("You already answered this exit ticket.");
  const review = gradeItems(await loadQuestionItems(repo, parseIds(t.questionIds)), responses);
  await repo.createMany("ExitTicketAnswer", review.map((r) => ({ ticketId, studentId: sid, questionId: r.questionId, isCorrect: r.correct, response: (responses[r.questionId] ?? {}) as never, createdAt: now })));
  return { correct: review.filter((r) => r.correct).length, total: review.length, review };
}

export interface TicketResults { id: string; title: string; status: string; classId: string; createdAt: string; questions: { id: string; stem: string; pct: number | null; answered: number }[]; students: { id: string; name: string; score: number | null; total: number }[]; answered: number; members: number }

export async function exitTicketResults(repo: Repo, actor: Actor, ticketId: string): Promise<TicketResults> {
  assertCan(actor, "reports:read");
  const t = await repo.findUnique("ExitTicket", { id: ticketId });
  if (!t) throw new ForbiddenError("Not found.");
  await assertClassRead(repo, actor, s(t.classId));
  const ids = parseIds(t.questionIds);
  const [items, answers, members] = await Promise.all([loadQuestionItems(repo, ids), repo.findMany("ExitTicketAnswer", { ticketId }), classMembers(repo, s(t.classId))]);
  const names = await studentNames(repo, members);
  const students = members.map((id) => { const mine = answers.filter((a) => a.studentId === id); return { id, name: names.get(id)?.name ?? "Student", score: mine.length ? mine.filter((a) => a.isCorrect).length : null, total: ids.length }; }).sort((a, b) => (a.score ?? 99) - (b.score ?? 99) || a.name.localeCompare(b.name));
  return {
    id: s(t.id), title: s(t.title), status: s(t.status), classId: s(t.classId), createdAt: new Date(time(t.createdAt)).toISOString(),
    questions: ids.map((qid) => { const a = answers.filter((x) => x.questionId === qid); return { id: qid, stem: s(items.find((i) => i.questionId === qid)?.stem).slice(0, 160), answered: a.length, pct: a.length ? Math.round((100 * a.filter((x) => x.isCorrect).length) / a.length) : null }; }),
    students, answered: new Set(answers.map((a) => s(a.studentId))).size, members: members.length,
  };
}

export async function classTickets(repo: Repo, actor: Actor, classId: string): Promise<{ id: string; title: string; status: string; createdAt: string }[]> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  return (await repo.findMany("ExitTicket", { classId })).map((t) => ({ id: s(t.id), title: s(t.title), status: s(t.status), createdAt: new Date(time(t.createdAt)).toISOString() })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
}

// ------------------------------------------------------------------ 🎯 weekly goals and 📅 rhythm

export type GoalKind = "ANSWERS" | "MINUTES" | "TASKS";
export interface GoalView { kind: GoalKind; target: number; progress: number; title: string | null; done: boolean }

async function weekAnswers(repo: Repo, studentIds: string[], from: Date): Promise<{ n: number; ms: number; days: Map<string, Set<string>> }> {
  if (!studentIds.length) return { n: 0, ms: 0, days: new Map() };
  const at = await repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, createdAt: { gte: from } }, { select: ["studentId", "responseMs", "createdAt"] });
  const days = new Map<string, Set<string>>();
  for (const a of at) { const k = s(a.studentId); const d = new Date(time(a.createdAt)).toISOString().slice(0, 10); days.set(k, (days.get(k) ?? new Set()).add(d)); }
  return { n: at.length, ms: at.reduce((t, a) => t + Math.min(Number(a.responseMs ?? 0), 180_000), 0), days };
}

export async function setStudentGoal(repo: Repo, actor: Actor, kind: GoalKind, target: number, now = new Date()): Promise<void> {
  const sid = student(actor);
  if (kind !== "ANSWERS" && kind !== "MINUTES") throw new ValidationError("Choose answers or minutes.");
  const max = kind === "ANSWERS" ? 500 : 600;
  if (!Number.isInteger(target) || target < 5 || target > max) throw new ValidationError(`Choose a goal from 5 to ${max}.`);
  const ws = weekStart(now);
  const data = { kind, target, createdById: actor.userId, createdAt: now };
  await repo.upsert("WeeklyGoal", { scope: "STUDENT", ownerId: sid, weekStart: ws }, { schoolId: actor.schoolId!, scope: "STUDENT", ownerId: sid, weekStart: ws, title: null, ...data }, data);
}

export async function setClassGoal(repo: Repo, actor: Actor, classId: string, input: { kind: GoalKind; target: number; title?: string }, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  if (!["ANSWERS", "TASKS", "MINUTES"].includes(input.kind)) throw new ValidationError("Choose the kind of goal.");
  if (!Number.isInteger(input.target) || input.target < 5 || input.target > 20000) throw new ValidationError("Choose a goal from 5 to 20000.");
  const ws = weekStart(now);
  const data = { kind: input.kind, target: input.target, title: s(input.title).trim().slice(0, 160) || null, createdById: actor.userId, createdAt: now };
  await repo.upsert("WeeklyGoal", { scope: "CLASS", ownerId: classId, weekStart: ws }, { schoolId: actor.schoolId!, scope: "CLASS", ownerId: classId, weekStart: ws, ...data }, data);
}

async function goalProgress(repo: Repo, kind: GoalKind, studentIds: string[], from: Date): Promise<number> {
  if (kind === "TASKS") {
    if (!studentIds.length) return 0;
    return (await repo.findMany("AssignmentStudent", { studentId: { in: studentIds }, status: "COMPLETED" }, { select: ["completedAt"] })).filter((r) => r.completedAt && time(r.completedAt) >= from.getTime()).length;
  }
  const w = await weekAnswers(repo, studentIds, from);
  return kind === "ANSWERS" ? w.n : Math.round(w.ms / 60_000);
}

export interface Rhythm { days: number; minutes: number }
const RKEY = (classId: string) => `rhythm.${classId}`;
export async function classRhythm(repo: Repo, schoolId: string, classId: string): Promise<Rhythm | null> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: RKEY(classId) }))[0];
  let v: unknown = row?.value ?? null; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = v as Partial<Rhythm> | null;
  return o && Number(o.days) > 0 ? { days: Number(o.days), minutes: Number(o.minutes) || 15 } : null;
}
export async function setClassRhythm(repo: Repo, actor: Actor, classId: string, r: Rhythm | null, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  if (r && (!Number.isInteger(r.days) || r.days < 1 || r.days > 7 || !Number.isInteger(r.minutes) || r.minutes < 5 || r.minutes > 90)) throw new ValidationError("Practice days: 1 to 7; minutes: 5 to 90.");
  const value = r ?? { days: 0, minutes: 0 };
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: RKEY(classId) }, { value, updatedById: actor.userId, updatedAt: now }, { value, updatedById: actor.userId, updatedAt: now });
}

export interface StudentWeek { mine: GoalView | null; klass: (GoalView & { className: string }) | null; rhythm: (Rhythm & { daysDone: number; className: string }) | null; answers: number; minutes: number }

/** The student's week: own goal, class goal, practice days (and a reminder from Wednesday when behind). */
export async function studentWeek(repo: Repo, actor: Actor, now = new Date()): Promise<StudentWeek> {
  const sid = student(actor);
  const ws = weekStart(now);
  const w = await weekAnswers(repo, [sid], ws);
  const mineRow = (await repo.findMany("WeeklyGoal", { scope: "STUDENT", ownerId: sid, weekStart: ws }))[0];
  const answers = w.n, minutes = Math.round(w.ms / 60_000);
  const mine: GoalView | null = mineRow ? { kind: s(mineRow.kind) as GoalKind, target: Number(mineRow.target), progress: s(mineRow.kind) === "MINUTES" ? minutes : answers, title: null, done: false } : null;
  if (mine) mine.done = mine.progress >= mine.target;
  const classes = await myClassIds(repo, sid);
  let klass: StudentWeek["klass"] = null, rhythm: StudentWeek["rhythm"] = null;
  for (const c of classes) {
    const g = (await repo.findMany("WeeklyGoal", { scope: "CLASS", ownerId: c, weekStart: ws }))[0];
    const cls = await repo.findUnique("Class", { id: c });
    if (g && !klass) { const p = await goalProgress(repo, s(g.kind) as GoalKind, await classMembers(repo, c), ws); klass = { kind: s(g.kind) as GoalKind, target: Number(g.target), progress: p, title: g.title ? s(g.title) : null, done: p >= Number(g.target), className: s(cls?.name) }; }
    const r = await classRhythm(repo, actor.schoolId!, c);
    if (r && !rhythm) rhythm = { ...r, daysDone: w.days.get(sid)?.size ?? 0, className: s(cls?.name) };
  }
  // reminder: from Wednesday, once a week, when the practice days are behind
  const dow = (now.getUTCDay() + 6) % 7;   // Monday 0
  if (rhythm && dow >= 2 && rhythm.daysDone < Math.min(rhythm.days, Math.ceil((rhythm.days * (dow + 1)) / 5))) {
    const title = "📅 Practice reminder";
    const have = await repo.findMany("Notification", { userId: actor.userId, title }, { select: ["createdAt"] });
    if (!have.some((n) => time(n.createdAt) >= ws.getTime())) await repo.create("Notification", { userId: actor.userId, type: "ASSIGNMENT_DUE", title, body: `Your class practises ${rhythm.days} day(s) a week, about ${rhythm.minutes} minutes. You have ${rhythm.daysDone} so far this week.`, link: "/student", createdAt: now });
  }
  return { mine, klass, rhythm, answers, minutes };
}

export interface ClassWeek { goal: GoalView | null; rhythm: Rhythm | null; onRhythm: number; members: number }
export async function classWeek(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ClassWeek> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  const ws = weekStart(now), ids = await classMembers(repo, classId);
  const g = (await repo.findMany("WeeklyGoal", { scope: "CLASS", ownerId: classId, weekStart: ws }))[0];
  const rhythm = await classRhythm(repo, actor.schoolId!, classId);
  const w = await weekAnswers(repo, ids, ws);
  const p = g ? await goalProgress(repo, s(g.kind) as GoalKind, ids, ws) : 0;
  return { goal: g ? { kind: s(g.kind) as GoalKind, target: Number(g.target), progress: p, title: g.title ? s(g.title) : null, done: p >= Number(g.target) } : null, rhythm, onRhythm: rhythm ? ids.filter((id) => (w.days.get(id)?.size ?? 0) >= rhythm.days).length : 0, members: ids.length };
}

// ------------------------------------------------------------------ 💬 comments

export interface CommentView { id: string; body: string; author: string; assignment: string | null; createdAt: string; mine: boolean }

async function assertStudentStaff(repo: Repo, actor: Actor, studentId: string, write: boolean): Promise<void> {
  const classes = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  for (const c of classes) { try { if (write) await assertClassAccess(repo, actor, s(c.classId)); else await assertClassRead(repo, actor, s(c.classId)); return; } catch { /* next */ } }
  throw new ForbiddenError("Not your student.");
}

export async function addComment(repo: Repo, actor: Actor, studentId: string, body: string, assignmentId: string | null = null, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  await assertStudentStaff(repo, actor, studentId, true);
  const text = s(body).trim();
  if (text.length < 2) throw new ValidationError("Write the comment.");
  let title: string | null = null;
  if (assignmentId) { const a = await repo.findUnique("Assignment", { id: assignmentId }); if (!a) throw new ValidationError("Task not found."); title = hideLevels(s(a.title)); }
  await repo.create("WorkComment", { schoolId: actor.schoolId!, studentId, assignmentId, authorId: actor.userId, body: text.slice(0, 2000), createdAt: now });
  const st = await repo.findUnique("Student", { id: studentId });
  if (st) await repo.create("Notification", { userId: st.userId, type: "TEACHER_FEEDBACK", title: "💬 A comment from your teacher", body: title ? `About “${title}”: ${text.slice(0, 140)}` : text.slice(0, 160), link: "/student/comments", createdAt: now });
}

/** Comments on a student's work: the student, the parent, the student's teachers and the admin. */
export async function commentsFor(repo: Repo, actor: Actor, studentId: string): Promise<CommentView[]> {
  if (actor.role === "STUDENT") { if (actor.studentId !== studentId) throw new ForbiddenError(); }
  else if (actor.role === "PARENT") { if (!actor.parentChildIds?.has(studentId)) throw new ForbiddenError(); }
  else await assertStudentStaff(repo, actor, studentId, false);
  const rows = await repo.findMany("WorkComment", { studentId });
  const [users, asg] = await Promise.all([
    rows.length ? repo.findMany("User", { id: { in: [...new Set(rows.map((r) => s(r.authorId)))] } }, { select: ["id", "displayName"] }) : Promise.resolve([] as Row[]),
    rows.some((r) => r.assignmentId) ? repo.findMany("Assignment", { id: { in: [...new Set(rows.filter((r) => r.assignmentId).map((r) => s(r.assignmentId)))] } }, { select: ["id", "title"] }) : Promise.resolve([] as Row[]),
  ]);
  return rows.map((r) => ({ id: s(r.id), body: s(r.body), author: s(users.find((u) => u.id === r.authorId)?.displayName) || "Teacher", assignment: r.assignmentId ? hideLevels(s(asg.find((a) => a.id === r.assignmentId)?.title)) || null : null, createdAt: new Date(time(r.createdAt)).toISOString(), mine: r.authorId === actor.userId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteComment(repo: Repo, actor: Actor, id: string): Promise<void> {
  const c = await repo.findUnique("WorkComment", { id });
  if (!c || (c.authorId !== actor.userId && actor.role !== "SCHOOL_ADMIN")) throw new ForbiddenError("Only the author can delete this comment.");
  await repo.deleteMany("WorkComment", { id });
}

// ------------------------------------------------------------------ 🚩 unclear questions

export const FLAG_REASONS = { UNCLEAR: "The question is not clear", WRONG_ANSWER: "I think the answer is wrong", TYPO: "Spelling / typing mistake", PICTURE: "The picture or passage is missing", OTHER: "Something else" } as const;
export type FlagReason = keyof typeof FLAG_REASONS;

export async function flagQuestion(repo: Repo, actor: Actor, questionId: string, reason: string, note = "", now = new Date()): Promise<void> {
  const sid = student(actor);
  if (!(reason in FLAG_REASONS)) throw new ValidationError("Choose a reason.");
  const q = await repo.findUnique("Question", { id: questionId });
  if (!q) throw new ValidationError("Question not found.");
  // only a question of the student's own school
  const k = await repo.findUnique("Skill", { id: q.skillId });
  const cur = k ? await repo.findUnique("Curriculum", { id: k.curriculumId }) : null;
  const g = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!g || s(g.schoolId) !== s(actor.schoolId)) throw new ValidationError("Question not found.");
  const have = await repo.findUnique("QuestionFlag", { questionId, studentId: sid });
  if (have) { await repo.updateMany("QuestionFlag", { questionId, studentId: sid }, { reason, note: s(note).slice(0, 500) || null, status: "OPEN", createdAt: now }); return; }
  await repo.create("QuestionFlag", { schoolId: actor.schoolId!, questionId, studentId: sid, reason, note: s(note).slice(0, 500) || null, status: "OPEN", createdAt: now });
}

export interface FlagRow { questionId: string; stem: string; skill: string; count: number; reasons: string[]; notes: string[]; lastAt: string; ids: string[] }
export async function flagList(repo: Repo, actor: Actor, status: "OPEN" | "FIXED" | "DISMISSED" = "OPEN"): Promise<FlagRow[]> {
  assertCan(actor, "questions:review");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Admins check flagged questions.");
  const rows = await repo.findMany("QuestionFlag", { schoolId: actor.schoolId, status });
  const qids = [...new Set(rows.map((r) => s(r.questionId)))];
  const qs = qids.length ? await repo.findMany("Question", { id: { in: qids } }, { select: ["id", "stem", "skillId"] }) : [];
  const skills = qs.length ? await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => s(q.skillId)))] } }, { select: ["id", "name"] }) : [];
  return qids.map((id) => { const fs = rows.filter((r) => r.questionId === id), q = qs.find((x) => x.id === id); return { questionId: id, stem: s(q?.stem).slice(0, 200), skill: s(skills.find((k) => k.id === q?.skillId)?.name), count: fs.length, reasons: [...new Set(fs.map((f) => FLAG_REASONS[s(f.reason) as FlagReason] ?? s(f.reason)))], notes: fs.map((f) => s(f.note)).filter(Boolean).slice(0, 5), lastAt: new Date(Math.max(...fs.map((f) => time(f.createdAt)))).toISOString(), ids: fs.map((f) => s(f.id)) }; }).sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

export async function resolveFlags(repo: Repo, actor: Actor, questionId: string, status: "FIXED" | "DISMISSED", now = new Date()): Promise<number> {
  assertCan(actor, "questions:review");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Admins check flagged questions.");
  const rows = (await repo.findMany("QuestionFlag", { schoolId: actor.schoolId, questionId, status: "OPEN" }));
  if (rows.length) await repo.updateMany("QuestionFlag", { id: { in: rows.map((r) => r.id) } }, { status, resolvedById: actor.userId, resolvedAt: now });
  return rows.length;
}

// ------------------------------------------------------------------ 🔁 review my mistakes (spaced)

/** Days to wait before the next review: after a mistake 1 day, then 3, then 7; three correct reviews = learned. */
export const REVIEW_DAYS = [1, 3, 7];

export async function dueMistakes(repo: Repo, studentId: string, now = new Date()): Promise<{ due: string[]; waiting: number; learned: number }> {
  const at = await repo.findMany("QuestionAttempt", { studentId, createdAt: { gte: new Date(now.getTime() - 90 * DAY) } }, { select: ["questionId", "isCorrect", "createdAt", "rapidGuess"] });
  const by = new Map<string, Row[]>();
  for (const a of at) by.set(s(a.questionId), [...(by.get(s(a.questionId)) ?? []), a]);
  const due: { id: string; at: number }[] = []; let waiting = 0, learned = 0;
  for (const [id, list] of by) {
    list.sort((a, b) => time(a.createdAt) - time(b.createdAt));
    const lastWrongIx = list.map((a) => !a.isCorrect && !a.rapidGuess).lastIndexOf(true);
    if (lastWrongIx < 0) continue;
    const after = list.slice(lastWrongIx + 1).filter((a) => a.isCorrect).length;
    if (after >= REVIEW_DAYS.length) { learned++; continue; }
    const last = time(list[list.length - 1].createdAt);
    if (now.getTime() - last >= REVIEW_DAYS[after] * DAY) due.push({ id, at: last }); else waiting++;
  }
  return { due: due.sort((a, b) => a.at - b.at).map((d) => d.id), waiting, learned };
}

export async function reviewSet(repo: Repo, actor: Actor, now = new Date()): Promise<{ questions: ClientQuestion[]; waiting: number; learned: number; due: number }> {
  const sid = student(actor);
  const d = await dueMistakes(repo, sid, now);
  const items = await loadQuestionItems(repo, d.due.slice(0, 8));
  return { questions: items.map((i) => toClientQuestion(i, `review:${sid}:${i.questionId}`)), waiting: d.waiting, learned: d.learned, due: d.due.length };
}

/** Grades a review; the answers count as practice (the next review date follows from them). */
export async function submitReview(repo: Repo, actor: Actor, responses: Record<string, unknown>, now = new Date()): Promise<{ correct: number; total: number; review: Graded[] }> {
  const sid = student(actor);
  const due = new Set((await dueMistakes(repo, sid, now)).due);
  const ids = Object.keys(responses).filter((id) => due.has(id)).slice(0, 8);
  if (!ids.length) throw new ValidationError("Nothing to review right now.");
  const items = await loadQuestionItems(repo, ids);
  const review = gradeItems(items, responses);
  const qs = await repo.findMany("Question", { id: { in: ids } }, { select: ["id", "skillId", "irtB"] });
  const session = await repo.create("PracticeSession", { studentId: sid, mode: "ADAPTIVE_PRACTICE", startedAt: now, endedAt: now, questionCount: review.length, correctCount: review.filter((r) => r.correct).length, endReason: "REVIEW" });
  for (const r of review) {
    const q = qs.find((x) => x.id === r.questionId);
    if (!q) continue;
    await repo.create("QuestionAttempt", { sessionId: session.id, studentId: sid, questionId: r.questionId, skillId: q.skillId, response: (responses[r.questionId] ?? {}) as never, isCorrect: r.correct, responseMs: 20_000, usedHint: false, rapidGuess: false, difficultyB: Number(q.irtB ?? 0), createdAt: now });
  }
  return { correct: review.filter((r) => r.correct).length, total: review.length, review };
}
