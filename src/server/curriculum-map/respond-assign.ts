/**
 * ✍️ Respond to Reading as class work:
 *   respondAssignPlan   → teacher: each student's suggested level for this Text Set (automatic), and which
 *                         levels have an activity; the teacher can move anyone before sending (manual)
 *   assignRespond       → send: one row per student with THEIR level; students are notified (no level name)
 *   respondTracking     → teacher: level received, finished / not finished, score, comment
 *   saveRespondMarks    → teacher: scores (0–4) and comments
 *   setFinished         → student: “I finished my answer in my book” (and undo)
 *   studentRespondWork  → student: their Respond to Reading tasks (due date, finished or not)
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead } from "../teacher/coordinators";
import { audit } from "../audit";
import { RESPOND_LEVELS, respondPage, rtrSetCode, type RespondLevel } from "./respond";
import { suggestLevels, EVIDENCE_NAME, type Evidence } from "./auto-levels";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown) => (v ? new Date(v instanceof Date ? v.toISOString() : s(v)).toISOString() : null);

export interface RespondPlanRow { studentId: string; name: string; suggested: RespondLevel; from: Evidence; reason: string }
export interface RespondPlan { classId: string; className: string; grade: number; setCode: string; heading: string; unit: string; sharedRead: string | null; has: Record<RespondLevel, boolean>; rows: RespondPlanRow[]; noData: number; already: { id: string; createdAt: string } | null }

export async function respondAssignPlan(repo: Repo, actor: Actor, classId: string, code: string): Promise<RespondPlan> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, classId);
  const page = await respondPage(repo, actor, code);
  const sug = await suggestLevels(repo, actor, classId, { category: "RTR" });
  if (sug.grade !== page.grade) throw new ValidationError(`This class is Grade ${sug.grade}; this Text Set is Grade ${page.grade}.`);
  const prev = (await repo.findMany("RespondAssignment", { classId, setCode: page.setCode, deletedAt: null })).sort((a, b) => s(iso(b.createdAt)).localeCompare(s(iso(a.createdAt))))[0];
  return {
    classId, className: s(klass.name), grade: page.grade, setCode: page.setCode, heading: page.heading, unit: page.unit, sharedRead: page.sharedRead,
    has: Object.fromEntries(page.levels.map((l) => [l.level, Boolean(l.activity)])) as Record<RespondLevel, boolean>,
    rows: sug.rows.map((r) => ({ studentId: r.studentId, name: r.name, suggested: r.suggested, from: r.from, reason: `${EVIDENCE_NAME[r.from]}: ${r.reason}` })),
    noData: sug.noData, already: prev ? { id: s(prev.id), createdAt: s(iso(prev.createdAt)) } : null,
  };
}

/** Sends the Text Set's Respond to Reading: each student gets the level chosen for them. */
export async function assignRespond(repo: Repo, actor: Actor, input: { classId: string; code: string; levels: Record<string, string>; dueAt?: Date | null; note?: string | null }, now = new Date()): Promise<{ assignmentId: string; students: number; byLevel: Record<RespondLevel, number>; fallback: number }> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const setCode = rtrSetCode(input.code);
  const page = await respondPage(repo, actor, setCode);
  const members = new Set((await repo.findMany("ClassMembership", { classId: input.classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
  const chosen = Object.entries(input.levels).filter(([, l]) => l);
  if (!chosen.length) throw new ValidationError("Choose at least one student.");
  const has = new Set(page.levels.filter((l) => l.activity).map((l) => l.level));
  if (!has.size) throw new ValidationError("This Text Set has no Respond to Reading activity yet. Add one first (Curriculum Map → Respond to Reading).");
  const byLevel: Record<RespondLevel, number> = { BELOW: 0, ON: 0, ABOVE: 0 };
  let fallback = 0;
  const rows = chosen.map(([studentId, raw]) => {
    if (!members.has(studentId)) throw new ForbiddenError("You can only assign work to students in this class.");
    let level = raw.toUpperCase() as RespondLevel;
    if (!RESPOND_LEVELS.includes(level)) throw new ValidationError("Level must be Below, On or Above.");
    if (!has.has(level)) { level = has.has("ON") ? "ON" : [...has][0]; fallback++; }   // the level has no activity yet
    byLevel[level]++;
    return { studentId, level };
  });
  const teacher = (await repo.findMany("Teacher", { userId: actor.userId }))[0];
  const title = `Respond to Reading · ${page.unit} · ${page.heading}`.slice(0, 255);
  const id = await repo.transaction(async (tx) => {
    const a = await tx.create("RespondAssignment", { schoolId: actor.schoolId!, classId: input.classId, setCode, title, dueAt: input.dueAt ?? null, note: s(input.note).slice(0, 1000) || null, createdById: s(teacher?.id ?? actor.userId), createdAt: now });
    await tx.createMany("RespondAssignmentStudent", rows.map((r) => ({ assignmentId: a.id, studentId: r.studentId, level: r.level, finishedAt: null, score: null, feedback: null, updatedAt: now })));
    const studs = await tx.findMany("Student", { id: { in: rows.map((r) => r.studentId) } }, { select: ["id", "userId"] });
    const due = input.dueAt ? ` Due ${input.dueAt.toISOString().slice(0, 10)}.` : "";
    await tx.createMany("Notification", studs.map((st) => ({ userId: st.userId, type: "NEW_ASSIGNMENT", title: "✍️ New Respond to Reading", body: `${page.heading}.${due}${input.note ? ` Note: ${input.note}` : ""}`, link: `/student/respond/${setCode}`, createdAt: now })));
    await audit(tx, { actorId: actor.userId, action: "respond.assign", entityType: "RespondAssignment", entityId: s(a.id), after: { classId: s(klass.id), setCode, students: rows.length, byLevel } });
    return s(a.id);
  });
  return { assignmentId: id, students: rows.length, byLevel, fallback };
}

export interface RespondTrackRow { studentId: string; name: string; level: RespondLevel; finishedAt: string | null; score: number | null; feedback: string | null }
export interface RespondTracking { id: string; title: string; setCode: string; classId: string; className: string; dueAt: string | null; createdAt: string; rows: RespondTrackRow[]; finished: number; canEdit: boolean }

async function loadAssignment(repo: Repo, actor: Actor, id: string): Promise<{ a: Row; klass: Row; canEdit: boolean }> {
  const a = await repo.findUnique("RespondAssignment", { id });
  if (!a || a.deletedAt || s(a.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found.");
  const klass = await assertClassRead(repo, actor, s(a.classId));
  let canEdit = true;
  try { await assertClassAccess(repo, actor, s(a.classId)); } catch { canEdit = false; }
  return { a, klass, canEdit };
}

export async function respondTracking(repo: Repo, actor: Actor, id: string): Promise<RespondTracking> {
  assertCan(actor, "assignments:read");
  const { a, klass, canEdit } = await loadAssignment(repo, actor, id);
  const rows = await repo.findMany("RespondAssignmentStudent", { assignmentId: id });
  const st = rows.length ? await repo.findMany("Student", { id: { in: rows.map((r) => r.studentId) } }, { select: ["id", "userId"] }) : [];
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = (sid: string) => s(users.find((u) => u.id === st.find((x) => x.id === sid)?.userId)?.displayName ?? "Student");
  const list = rows.map((r) => ({ studentId: s(r.studentId), name: nameOf(s(r.studentId)), level: s(r.level) as RespondLevel, finishedAt: iso(r.finishedAt), score: r.score === null || r.score === undefined ? null : Number(r.score), feedback: r.feedback ? s(r.feedback) : null })).sort((x, y) => x.name.localeCompare(y.name));
  return { id, title: s(a.title), setCode: s(a.setCode), classId: s(a.classId), className: s(klass.name), dueAt: iso(a.dueAt), createdAt: s(iso(a.createdAt)), rows: list, finished: list.filter((r) => r.finishedAt).length, canEdit };
}

export async function saveRespondMarks(repo: Repo, actor: Actor, id: string, marks: { studentId: string; score: number | null; feedback: string | null; finished?: boolean | null }[], now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  const { canEdit } = await loadAssignment(repo, actor, id);
  if (!canEdit) throw new ForbiddenError("Only the class teacher can mark this work.");
  let n = 0;
  for (const m of marks) {
    if (m.score !== null && !(Number.isInteger(m.score) && m.score >= 0 && m.score <= 4)) throw new ValidationError("Scores go from 0 to 4.");
    const row = (await repo.findMany("RespondAssignmentStudent", { assignmentId: id, studentId: m.studentId }))[0];
    if (!row) continue;
    const data: Record<string, unknown> = { score: m.score, feedback: s(m.feedback).slice(0, 1000) || null, updatedAt: now };
    if (m.finished === true && !row.finishedAt) data.finishedAt = now;
    if (m.finished === false && row.finishedAt) data.finishedAt = null;
    n += await repo.updateMany("RespondAssignmentStudent", { assignmentId: id, studentId: m.studentId }, data);
  }
  return n;
}

/** Teacher: the class's Respond to Reading work (newest first). */
export async function classRespondWork(repo: Repo, actor: Actor, classId: string): Promise<{ id: string; title: string; setCode: string; dueAt: string | null; createdAt: string; students: number; finished: number }[]> {
  assertCan(actor, "assignments:read");
  await assertClassRead(repo, actor, classId);
  const as = (await repo.findMany("RespondAssignment", { classId, deletedAt: null })).sort((a, b) => s(iso(b.createdAt)).localeCompare(s(iso(a.createdAt))));
  const rows = as.length ? await repo.findMany("RespondAssignmentStudent", { assignmentId: { in: as.map((a) => a.id) } }, { select: ["assignmentId", "finishedAt"] }) : [];
  return as.map((a) => { const r = rows.filter((x) => x.assignmentId === a.id); return { id: s(a.id), title: s(a.title), setCode: s(a.setCode), dueAt: iso(a.dueAt), createdAt: s(iso(a.createdAt)), students: r.length, finished: r.filter((x) => x.finishedAt).length }; });
}

export async function cancelRespond(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const { canEdit } = await loadAssignment(repo, actor, id);
  if (!canEdit) throw new ForbiddenError("Only the class teacher can cancel this work.");
  await repo.updateMany("RespondAssignment", { id }, { deletedAt: now });
  await audit(repo, { actorId: actor.userId, action: "respond.cancel", entityType: "RespondAssignment", entityId: id, at: now });
}

// ------------------------------------------------------------------ students

export interface StudentRespondTask { assignmentId: string; setCode: string; heading: string; dueAt: string | null; finishedAt: string | null; level: RespondLevel; score: number | null; feedback: string | null }

export async function studentRespondWork(repo: Repo, actor: Actor): Promise<StudentRespondTask[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students have this list.");
  const mine = await repo.findMany("RespondAssignmentStudent", { studentId: actor.studentId });
  if (!mine.length) return [];
  const as = (await repo.findMany("RespondAssignment", { id: { in: mine.map((m) => m.assignmentId) } })).filter((a) => !a.deletedAt);
  return as.map((a) => {
    const m = mine.find((x) => x.assignmentId === a.id)!;
    return { assignmentId: s(a.id), setCode: s(a.setCode), heading: s(a.title).split(" · ").slice(2).join(" · ") || s(a.title), dueAt: iso(a.dueAt), finishedAt: iso(m.finishedAt), level: s(m.level) as RespondLevel, score: m.score === null || m.score === undefined ? null : Number(m.score), feedback: m.feedback ? s(m.feedback) : null };
  }).sort((x, y) => Number(Boolean(x.finishedAt)) - Number(Boolean(y.finishedAt)) || (x.dueAt ?? "9").localeCompare(y.dueAt ?? "9"));
}

/** The student's newest task for this Text Set (its level wins over the computed one). */
export async function studentTaskFor(repo: Repo, actor: Actor, setCode: string): Promise<StudentRespondTask | null> {
  return (await studentRespondWork(repo, actor)).filter((t) => t.setCode === setCode).sort((a, b) => Number(Boolean(a.finishedAt)) - Number(Boolean(b.finishedAt)))[0] ?? null;
}

/** “I finished my answer in my book” (finished = false undoes it). */
export async function setFinished(repo: Repo, actor: Actor, assignmentId: string, finished: boolean, now = new Date()): Promise<void> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students can do this.");
  const row = (await repo.findMany("RespondAssignmentStudent", { assignmentId, studentId: actor.studentId }))[0];
  if (!row) throw new ForbiddenError("This task is not yours.");
  await repo.updateMany("RespondAssignmentStudent", { assignmentId, studentId: actor.studentId }, { finishedAt: finished ? now : null, updatedAt: now });
  // ⭐ points once per task (undo + redo never adds more)
  const reason = `respond.finished:${assignmentId}`;
  if (finished && !(await repo.findMany("XpEvent", { studentId: actor.studentId, reason })).length) await repo.create("XpEvent", { studentId: actor.studentId, points: 10, reason, createdAt: now });
}
