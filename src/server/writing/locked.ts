/**
 * 🔒 Locked writing with a teacher rubric (extends ✍️ src/server/teacher/writing.ts; older tasks are untouched).
 *
 * Teacher
 *   - rubrics: criteria × performance levels (label, points, description); saved for reuse per school (own + shared)
 *   - a task: title, a light rich-text prompt (sanitized HTML), grade, optional minimum words and time limit, a rubric
 *     snapshot, assigned to the whole class, a support group or chosen students, with a due date
 *   - submissions: Not started / In progress / Submitted / Auto-submitted / Graded, with the integrity counts
 *   - grading: a level per criterion (total computed), an overall comment, comments on sentences (index + text);
 *     "Grade with AI" (an examiner-style, rubric-anchored procedure, read twice for consistency) suggests per criterion
 *     a level, a justification, exact evidence quotes, what is missing for the next level and a confidence, plus
 *     strengths, next steps, suggested feedback and a note for the teacher. Sent: the prompt, grade level, minimum /
 *     counted words, time limit, the rubric (+ the teacher's own rubric text and notes for AI grading) and the essay —
 *     never a name or an id. Nothing reaches the student until "Approve & Return"
 *   - the rubric can also be written or pasted as text (src/server/writing/rubric-text.ts)
 *   - reopen a submitted / auto-submitted essay (logged)
 *
 * Student (the locked page): Start (fullscreen on the click) → autosave every few seconds and on every leave →
 *   leaving (hidden tab, window blur, fullscreen exit, reload) is counted ON THE SERVER, one leave once (debounced):
 *   the 1st time a warning, the 2nd time the essay is submitted automatically. The time limit is enforced from the
 *   stored start time. Pastes, copies, drops, the context menu and writing extensions are logged for the teacher.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead, readableClasses } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { consumeRateLimit } from "../auth/rate-limit";
import { aiSettings, callJson, pickProvider, rateState, type EnvLike, type Validator } from "../ai/engine";
import type { anthropicProvider, geminiProvider } from "../ai/question-generator";
import { rubricFor } from "./genres";
import { countWords, htmlToText, sanitizeHtml, splitSentences } from "./rich-text";
import { parseRubricText, RUBRIC_TEXT_MAX } from "./rubric-text";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v === null || v === undefined || v === "" ? NaN : new Date(v instanceof Date ? v.toISOString() : s(v)).getTime());
const iso = (v: unknown) => { const t = time(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const bool = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";
const json = <T>(v: unknown): T | null => { if (v === null || v === undefined || v === "") return null; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return null; } } return v as T; };
const short = (v: unknown, max: number) => s(v).replace(/\s+/g, " ").trim().slice(0, max);

/** One leave counts once: blur + visibility + fullscreen firing together (or a reload right after) within this window. */
export const LEAVE_DEBOUNCE_MS = 3000;
/** Two page opens this close are the same open (a double request), not a reload. */
export const OPEN_DEBOUNCE_MS = 3000;
/** Saves arriving this long after the time limit are still accepted (network delay). */
export const TIME_GRACE_MS = 20_000;
/** At most this many integrity events per essay (a stuck key cannot flood the table). */
export const MAX_EVENTS = 400;
export const SUBMISSIONS_PAGE = 40;
export const LEAVE_KINDS = ["HIDDEN", "BLUR", "FULLSCREEN"] as const;
export const FLAG_KINDS = ["PASTE", "COPY", "DROP", "MENU", "EXTENSION"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number] | "RELOAD";
export type FlagKind = (typeof FLAG_KINDS)[number];

// ------------------------------------------------------------------ rubrics

export interface RubricLevel { label: string; points: number; description: string }
export interface RubricCriterion { key: string; title: string; description: string; levels: RubricLevel[] }
export interface WritingRubricDef { title: string; criteria: RubricCriterion[] }

/** Validates a rubric (from the builder or a saved one): 1–10 criteria, 2–6 levels each, whole points 0–100. */
export function cleanRubric(input: unknown): WritingRubricDef {
  const r = (json<Record<string, unknown>>(input) ?? {}) as { title?: unknown; criteria?: unknown };
  const title = short(r.title, 120) || "Writing rubric";
  const list = Array.isArray(r.criteria) ? (r.criteria as Record<string, unknown>[]) : [];
  if (!list.length) throw new ValidationError("Add at least one criterion to the rubric.");
  if (list.length > 10) throw new ValidationError("A rubric has at most 10 criteria.");
  const criteria = list.map((c, i): RubricCriterion => {
    const ct = short(c?.title, 120);
    if (ct.length < 2) throw new ValidationError(`Criterion ${i + 1} needs a name.`);
    const lv = Array.isArray(c?.levels) ? (c.levels as Record<string, unknown>[]) : [];
    if (lv.length < 2 || lv.length > 6) throw new ValidationError(`“${ct}” needs 2 to 6 performance levels.`);
    const levels = lv.map((l, j): RubricLevel => {
      const label = short(l?.label, 60);
      if (!label) throw new ValidationError(`“${ct}”: level ${j + 1} needs a name (e.g. Beginning, Developing, Proficient, Exemplary).`);
      const p = Number(l?.points);
      if (l?.points === "" || l?.points === null || l?.points === undefined || !Number.isInteger(p) || p < 0 || p > 100) throw new ValidationError(`“${ct}” · ${label}: points must be a whole number from 0 to 100.`);
      return { label, points: p, description: short(l?.description, 500) };
    });
    return { key: `c${i + 1}`, title: ct, description: short(c?.description, 500), levels };
  });
  if (rubricMax({ title, criteria }) <= 0) throw new ValidationError("The rubric needs at least one level worth more than 0 points.");
  return { title, criteria };
}

export const criterionMax = (c: RubricCriterion) => Math.max(0, ...c.levels.map((l) => l.points));
export const rubricMax = (r: WritingRubricDef) => r.criteria.reduce((a, c) => a + criterionMax(c), 0);
/** The rubric snapshot stored on a locked task. */
export const rubricOf = (t: Row): WritingRubricDef => { const r = json<WritingRubricDef>(t.rubric); return r && Array.isArray(r.criteria) ? r : { title: "Rubric", criteria: [] }; };
export const isLocked = (t: Row | null | undefined) => Boolean(t && bool(t.locked));

export interface SavedRubric extends WritingRubricDef { id: string; shared: boolean; mine: boolean; createdAt: string }

async function rubricRows(repo: Repo, ids: string[]): Promise<Map<string, RubricCriterion[]>> {
  const rows = ids.length ? await repo.findMany("WritingRubricCriterion", { rubricId: { in: ids } }, { select: ["rubricId", "position", "title", "description", "levels"], orderBy: [{ field: "position", dir: "asc" }] }) : [];
  const out = new Map<string, RubricCriterion[]>();
  for (const r of rows) {
    const list = out.get(s(r.rubricId)) ?? [];
    list.push({ key: `c${list.length + 1}`, title: s(r.title), description: s(r.description), levels: json<RubricLevel[]>(r.levels) ?? [] });
    out.set(s(r.rubricId), list);
  }
  return out;
}

const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
const canSee = (a: Actor, r: Row) => s(r.schoolId) === s(a.schoolId) && !r.deletedAt && (isAdmin(a) || s(r.createdById) === a.userId || bool(r.shared));

/** The rubrics this teacher can reuse: their own and the ones shared in the school (the admin: all of the school). */
export async function listRubrics(repo: Repo, actor: Actor, limit = 100): Promise<SavedRubric[]> {
  assertCan(actor, "reports:read");
  if (!actor.schoolId) return [];
  const rows = (await repo.findMany("WritingRubric", { schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "schoolId", "createdById", "title", "shared", "createdAt", "deletedAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 500 }))
    .filter((r) => canSee(actor, r)).slice(0, limit);
  const crit = await rubricRows(repo, rows.map((r) => s(r.id)));
  return rows.map((r) => ({ id: s(r.id), title: s(r.title), shared: bool(r.shared), mine: s(r.createdById) === actor.userId, createdAt: iso(r.createdAt) ?? "", criteria: crit.get(s(r.id)) ?? [] }));
}

export async function loadRubric(repo: Repo, actor: Actor, id: string): Promise<WritingRubricDef & { id: string }> {
  const r = await repo.findUnique("WritingRubric", { id });
  if (!r || !canSee(actor, r)) throw new ForbiddenError("Rubric not found.");
  return { id, title: s(r.title), criteria: (await rubricRows(repo, [id])).get(id) ?? [] };
}

export async function saveRubric(repo: Repo, actor: Actor, input: { title?: unknown; criteria?: unknown; shared?: boolean }, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  if (!actor.schoolId) throw new ForbiddenError();
  const r = cleanRubric(input);
  const row = await repo.create("WritingRubric", { schoolId: actor.schoolId, createdById: actor.userId, title: r.title, shared: Boolean(input.shared), createdAt: now, deletedAt: null });
  await repo.createMany("WritingRubricCriterion", r.criteria.map((c, i) => ({ id: `${s(row.id)}-${i + 1}`, rubricId: s(row.id), position: i + 1, title: c.title, description: c.description || null, levels: c.levels })));
  return s(row.id);
}

/** Removes a saved rubric (its owner or an admin). Tasks keep their own copy, so their grades never change. */
export async function deleteRubric(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const r = await repo.findUnique("WritingRubric", { id });
  if (!r || r.deletedAt || s(r.schoolId) !== s(actor.schoolId) || (!isAdmin(actor) && s(r.createdById) !== actor.userId)) throw new ForbiddenError("You can only remove your own rubrics.");
  await repo.updateMany("WritingRubric", { id }, { deletedAt: now });
}

// ------------------------------------------------------------------ who a task is for

/** The class members a task is assigned to (null studentIds = the whole class, as for every older task). */
export function assignedIds(t: Row, members: string[]): string[] {
  const list = json<unknown[]>(t.studentIds);
  if (!Array.isArray(list)) return members;
  const set = new Set(list.map(s));
  return members.filter((id) => set.has(id));
}
export function isAssignedTo(t: Row, studentId: string): boolean {
  const list = json<unknown[]>(t.studentIds);
  return !Array.isArray(list) || list.map(s).includes(studentId);
}

/** The support groups of a class (active Intervention groups) with their students in the class. */
export async function classGroups(repo: Repo, actor: Actor, classId: string): Promise<{ id: string; title: string; studentIds: string[] }[]> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  const members = new Set(await classMembers(repo, classId));
  return (await repo.findMany("Intervention", { classId, status: "ACTIVE" }, { select: ["id", "title", "studentIds"] }))
    .map((g) => ({ id: s(g.id), title: s(g.title), studentIds: (json<unknown[]>(g.studentIds) ?? []).map(s).filter((x) => members.has(x)) }))
    .filter((g) => g.studentIds.length);
}

// ------------------------------------------------------------------ the teacher: create

export type AssignTo = "CLASS" | "GROUP" | "STUDENTS";
export interface CreateLockedInput {
  classId: string; title: string; promptHtml: string; gradeLevel?: number | null; minWords?: number | null; timeLimitMin?: number | null; dueAt?: Date | null;
  rubricId?: string | null; rubric?: unknown; saveRubric?: boolean; shareRubric?: boolean;
  /** "Write or paste my rubric": the teacher's text (a pasted table or typed lines), parsed by parseRubricText */
  rubricText?: string | null; rubricTitle?: string | null;
  /** the teacher's notes for AI grading (optional) */
  aiNotes?: string | null;
  assignTo?: AssignTo; groupId?: string | null; studentIds?: string[];
}

export const AI_NOTES_MAX = 1000;
const cleanNotes = (v: unknown) => s(v).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, AI_NOTES_MAX) || null;

/** The teacher's rubric text → a validated rubric (the first problem is reported with its line). */
export function rubricFromText(text: unknown, title?: unknown): WritingRubricDef {
  const p = parseRubricText(text);
  if (p.errors.length) throw new ValidationError(p.errors.length > 1 ? `${p.errors[0].message} (+${p.errors.length - 1} more)` : p.errors[0].message);
  return cleanRubric({ title: short(title, 120) || p.title || "My rubric", criteria: p.criteria });
}

const optInt = (v: unknown, lo: number, hi: number, what: string): number | null => {
  if (v === null || v === undefined || v === "" || Number(v) === 0) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new ValidationError(`${what} must be a whole number from ${lo} to ${hi}.`);
  return n;
};

export async function createLockedTask(repo: Repo, actor: Actor, input: CreateLockedInput, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const title = short(input.title, 191);
  const promptHtml = sanitizeHtml(input.promptHtml, 20000);
  const prompt = htmlToText(promptHtml);
  if (title.length < 2) throw new ValidationError("Write a title.");
  if (prompt.length < 5) throw new ValidationError("Write the writing prompt for the students.");
  const classGrade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0) || null;
  const gradeLevel = optInt(input.gradeLevel, 1, 12, "The grade") ?? classGrade;
  const minWords = optInt(input.minWords, 1, 2000, "The minimum word count");
  const timeLimitMin = optInt(input.timeLimitMin, 5, 240, "The time limit (minutes)");
  const dueAt = input.dueAt && Number.isFinite(input.dueAt.getTime()) ? input.dueAt : null;
  if (!dueAt) throw new ValidationError("Choose a due date.");
  if (dueAt.getTime() < now.getTime() - 60_000) throw new ValidationError("The due date is in the past.");

  // the rubric: a saved one, or the one built now (saved for reuse when asked)
  let rubric: WritingRubricDef, rubricId: string | null = null, rubricText: string | null = null;
  if (input.rubricId) { const r = await loadRubric(repo, actor, input.rubricId); rubric = { title: r.title, criteria: r.criteria }; rubricId = r.id; }
  else {
    if (typeof input.rubricText === "string") {
      rubric = rubricFromText(input.rubricText, input.rubricTitle);
      rubricText = input.rubricText.replace(/\r\n?/g, "\n").trim().slice(0, RUBRIC_TEXT_MAX);
    } else rubric = cleanRubric(input.rubric);
    if (input.saveRubric) rubricId = await saveRubric(repo, actor, { ...rubric, shared: Boolean(input.shareRubric) }, now);
  }
  if (!rubric.criteria.length) throw new ValidationError("This rubric has no criteria.");

  // who: the class, a support group of the class, or chosen students of the class
  const members = await classMembers(repo, input.classId);
  if (!members.length) throw new ValidationError("This class has no students yet.");
  const to: AssignTo = input.assignTo === "GROUP" || input.assignTo === "STUDENTS" ? input.assignTo : "CLASS";
  let studentIds: string[] | null = null, groupId: string | null = null;
  if (to === "GROUP") {
    const g = input.groupId ? await repo.findUnique("Intervention", { id: input.groupId }) : null;
    if (!g || s(g.classId) !== input.classId) throw new ValidationError("Choose a group of this class.");
    studentIds = (json<unknown[]>(g.studentIds) ?? []).map(s).filter((x) => members.includes(x));
    groupId = s(g.id);
    if (!studentIds.length) throw new ValidationError("This group has no students in the class.");
  } else if (to === "STUDENTS") {
    const chosen = [...new Set((input.studentIds ?? []).map(s).filter(Boolean))];
    if (!chosen.length) throw new ValidationError("Choose at least one student.");
    if (chosen.some((x) => !members.includes(x))) throw new ForbiddenError("You can only assign work to students in this class.");
    studentIds = chosen;
  }

  const t = await repo.create("WritingTask", {
    schoolId: s(klass.schoolId), classId: input.classId, createdById: actor.userId, kind: "WRITE", title, prompt: prompt.slice(0, 5000), passage: null, minWords, dueAt,
    genre: "FREE", skillId: null, staged: false, sources: null, research: null, aiFeedback: false, createdAt: now, deletedAt: null,
    locked: true, promptHtml, gradeLevel, timeLimitMin, rubricId, rubric, assignTo: to, groupId, studentIds, rubricText, aiNotes: cleanNotes(input.aiNotes),
  });
  const who = studentIds ?? members;
  const users = await repo.findMany("Student", { id: { in: who } }, { select: ["userId"] });
  if (users.length) await repo.createMany("Notification", users.map((u) => ({ userId: u.userId, type: "NEW_ASSIGNMENT", title: "✍️ A writing task from your teacher", body: title.slice(0, 160), link: `/student/writing/${s(t.id)}`, createdAt: now })));
  return s(t.id);
}

// ------------------------------------------------------------------ status, deadline, events

export type LockedStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED" | "GRADED";
export const STATUS_LABEL: Record<LockedStatus, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", SUBMITTED: "Submitted", AUTO_SUBMITTED: "Auto-submitted", GRADED: "Graded" };

export function lockedStatus(sub: Row | null | undefined): LockedStatus {
  if (!sub) return "NOT_STARTED";
  const st = s(sub.status);
  if (st === "SCORED") return "GRADED";
  if (st === "SUBMITTED") return s(sub.submitMode) === "AUTO" || s(sub.submitMode) === "TIME" ? "AUTO_SUBMITTED" : "SUBMITTED";
  return sub.startedAt || s(sub.text).trim() ? "IN_PROGRESS" : "NOT_STARTED";
}

/** The moment the time limit ends (from the student's stored start), or null. */
export function deadlineOf(t: Row, sub: Row | null | undefined): number | null {
  const min = Number(t.timeLimitMin ?? 0), start = time(sub?.startedAt);
  return min > 0 && Number.isFinite(start) ? start + min * 60_000 : null;
}

async function event(repo: Repo, taskId: string, studentId: string, kind: string, detail: string | null, now: Date, byUserId: string | null = null): Promise<void> {
  await repo.create("WritingIntegrityEvent", { taskId, studentId, kind, detail: detail ? detail.slice(0, 300) : null, byUserId, at: now });
}

const getSub = (repo: Repo, taskId: string, studentId: string) => repo.findUnique("WritingSubmission", { taskId, studentId });

/** Submits an essay that is still being written (only if it is: a second request does nothing). */
async function autoSubmit(repo: Repo, taskId: string, studentId: string, mode: "AUTO" | "TIME", now: Date, detail: string, text?: string): Promise<boolean> {
  const data: Row = { status: "SUBMITTED", submitMode: mode, submittedAt: now };
  if (text !== undefined) data.text = text;
  const n = await repo.updateMany("WritingSubmission", { taskId, studentId, status: "DRAFT" }, data);
  if (n) await event(repo, taskId, studentId, mode === "TIME" ? "TIME_UP" : "AUTO_SUBMIT", detail, now);
  return n > 0;
}

/** The server's own clock: past the time limit (+ a short grace for the network) → submitted as it is. */
async function enforceDeadline(repo: Repo, t: Row, sub: Row | null, now: Date): Promise<Row | null> {
  if (!sub || s(sub.status) !== "DRAFT") return sub;
  const end = deadlineOf(t, sub);
  if (end === null || now.getTime() <= end + TIME_GRACE_MS) return sub;
  await autoSubmit(repo, s(t.id), s(sub.studentId), "TIME", now, "The time limit ended (server clock).");
  return getSub(repo, s(t.id), s(sub.studentId));
}

/** Submits (TIME) every essay of a task whose time limit ended (when the teacher or the student opens a page). */
async function sweepTask(repo: Repo, t: Row, subs: Row[], now: Date): Promise<boolean> {
  if (!Number(t.timeLimitMin ?? 0)) return false;
  let changed = false;
  for (const x of subs) if (s(x.status) === "DRAFT" && x.startedAt) { const end = deadlineOf(t, x); if (end !== null && now.getTime() > end + TIME_GRACE_MS) changed = (await autoSubmit(repo, s(t.id), s(x.studentId), "TIME", now, "The time limit ended (server clock).")) || changed; }
  return changed;
}

// ------------------------------------------------------------------ the student: the locked page

export interface LockState { status: LockedStatus; leaves: number; warning: boolean; deadline: string | null; serverNow: string; submitMode: string | null; text?: string }

function stateOf(t: Row, sub: Row | null, now: Date, withText = false): LockState {
  const status = lockedStatus(sub), leaves = Number(sub?.leaveCount ?? 0), end = deadlineOf(t, sub);
  return { status, leaves, warning: status === "IN_PROGRESS" && leaves === 1, deadline: end === null ? null : new Date(end).toISOString(), serverNow: now.toISOString(), submitMode: sub?.submitMode ? s(sub.submitMode) : null, ...(withText ? { text: s(sub?.text) } : {}) };
}

async function ownLockedTask(repo: Repo, actor: Actor, taskId: string): Promise<Row> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError();
  const t = await repo.findUnique("WritingTask", { id: taskId });
  if (!t || t.deletedAt || !isLocked(t)) throw new ForbiddenError("Task not found.");
  const ok = await repo.findMany("ClassMembership", { studentId: actor.studentId, classId: t.classId, leftAt: null }, { select: ["classId"] });
  if (!ok.length || !isAssignedTo(t, actor.studentId)) throw new ForbiddenError("Task not found.");
  return t;
}

function started(sub: Row | null): Row {
  if (!sub || (s(sub.status) === "DRAFT" && !sub.startedAt)) throw new ValidationError("Press “Start Writing” on the task page first.");
  return sub;
}

const cleanText = (v: unknown) => s(v).replace(/\r\n?/g, "\n").slice(0, 20000);

/** “Start Writing”: the time limit starts now (a started essay simply continues). */
export async function startLocked(repo: Repo, actor: Actor, taskId: string, now = new Date()): Promise<LockState> {
  const t = await ownLockedTask(repo, actor, taskId);
  const sid = actor.studentId!;
  let sub = await enforceDeadline(repo, t, await getSub(repo, taskId, sid), now);
  if (sub && s(sub.status) !== "DRAFT") return stateOf(t, sub, now);
  if (sub?.startedAt) return stateOf(t, sub, now);
  const fresh = { startedAt: now, leaveCount: 0, lock: { opens: 0 }, submitMode: null };
  if (sub) await repo.updateMany("WritingSubmission", { taskId, studentId: sid }, fresh);
  else await repo.create("WritingSubmission", { taskId, studentId: sid, status: "DRAFT", aiStatus: "NONE", text: "", ...fresh });
  await event(repo, taskId, sid, "START", null, now);
  sub = await getSub(repo, taskId, sid);
  return stateOf(t, sub, now);
}

/**
 * Counts one leave (server side). Within LEAVE_DEBOUNCE_MS of the last counted leave it is the same leave (logged,
 * not counted). The 1st leave → a warning; the 2nd → the essay is submitted automatically.
 */
async function countLeave(repo: Repo, t: Row, sub: Row, kind: LeaveKind, now: Date, lockPatch: Record<string, unknown> = {}): Promise<Row | null> {
  const taskId = s(t.id), sid = s(sub.studentId);
  const lock = { ...(json<Record<string, unknown>>(sub.lock) ?? {}), ...lockPatch };
  const last = time(lock.lastLeaveAt);
  if (Number.isFinite(last) && now.getTime() - last < LEAVE_DEBOUNCE_MS) {
    if (Object.keys(lockPatch).length) await repo.updateMany("WritingSubmission", { taskId, studentId: sid }, { lock });
    if ((await repo.count("WritingIntegrityEvent", { taskId, studentId: sid })) < MAX_EVENTS) await event(repo, taskId, sid, kind, "Same leave (not counted again).", now);
    return getSub(repo, taskId, sid);
  }
  const leaves = Number(sub.leaveCount ?? 0) + 1;
  const n = await repo.updateMany("WritingSubmission", { taskId, studentId: sid, status: "DRAFT" }, { leaveCount: leaves, lock: { ...lock, lastLeaveAt: now.toISOString() } });
  if (!n) return getSub(repo, taskId, sid);
  await event(repo, taskId, sid, kind, `Leave ${leaves} of 2.`, now);
  if (leaves >= 2) await autoSubmit(repo, taskId, sid, "AUTO", now, "Left the writing page a second time: submitted automatically.");
  return getSub(repo, taskId, sid);
}

/**
 * The locked page opened (called once by the page). The first open after Start is free; any later open is a reload
 * and counts as leaving (so refreshing never gets around the rules).
 */
export async function openLocked(repo: Repo, actor: Actor, taskId: string, now = new Date()): Promise<LockState> {
  const t = await ownLockedTask(repo, actor, taskId);
  const sid = actor.studentId!;
  let sub = started(await getSub(repo, taskId, sid));
  sub = (await enforceDeadline(repo, t, sub, now))!;
  if (s(sub.status) !== "DRAFT") return stateOf(t, sub, now, true);
  const lock = json<Record<string, unknown>>(sub.lock) ?? {};
  const opens = Number(lock.opens ?? 0), lastOpen = time(lock.lastOpenAt);
  const patch = { opens: opens + 1, lastOpenAt: now.toISOString() };
  if (opens === 0) await repo.updateMany("WritingSubmission", { taskId, studentId: sid }, { lock: { ...lock, ...patch } });
  else if (Number.isFinite(lastOpen) && now.getTime() - lastOpen < OPEN_DEBOUNCE_MS) { /* the same open, twice */ }
  else await countLeave(repo, t, sub, "RELOAD", now, patch);
  return stateOf(t, await getSub(repo, taskId, sid), now, true);
}

/** Autosave (every few seconds while writing). After the time limit nothing new is taken: the essay is submitted. */
export async function autosaveLocked(repo: Repo, actor: Actor, taskId: string, text: string, now = new Date()): Promise<LockState> {
  const t = await ownLockedTask(repo, actor, taskId);
  const sid = actor.studentId!;
  const sub = await enforceDeadline(repo, t, started(await getSub(repo, taskId, sid)), now);
  if (!sub || s(sub.status) !== "DRAFT") return stateOf(t, sub, now);
  await repo.updateMany("WritingSubmission", { taskId, studentId: sid, status: "DRAFT" }, { text: cleanText(text), autosavedAt: now });
  return stateOf(t, sub, now);
}

/** The student left the page (hidden tab, window blur, fullscreen exit): the text is saved first, then the leave counted. */
export async function leaveLocked(repo: Repo, actor: Actor, taskId: string, kind: string, text: string | undefined, now = new Date()): Promise<LockState> {
  const t = await ownLockedTask(repo, actor, taskId);
  const sid = actor.studentId!;
  const k = (LEAVE_KINDS as readonly string[]).includes(kind) ? (kind as LeaveKind) : "BLUR";
  let sub = await enforceDeadline(repo, t, started(await getSub(repo, taskId, sid)), now);
  if (!sub || s(sub.status) !== "DRAFT") return stateOf(t, sub, now);
  if (text !== undefined) await repo.updateMany("WritingSubmission", { taskId, studentId: sid, status: "DRAFT" }, { text: cleanText(text), autosavedAt: now });
  sub = await countLeave(repo, t, sub, k, now);
  return stateOf(t, sub, now);
}

/** Paste / copy / drop / right-click attempts and writing extensions, logged for the teacher. */
export async function flagLocked(repo: Repo, actor: Actor, taskId: string, kind: string, detail: string | null, now = new Date()): Promise<LockState> {
  const t = await ownLockedTask(repo, actor, taskId);
  const sid = actor.studentId!;
  if (!(FLAG_KINDS as readonly string[]).includes(kind)) throw new ValidationError("Unknown event.");
  const sub = await getSub(repo, taskId, sid);
  if (!sub || s(sub.status) !== "DRAFT") return stateOf(t, sub, now);
  if (kind === "EXTENSION") {
    const lock = json<Record<string, unknown>>(sub.lock) ?? {};
    if (lock.extension) return stateOf(t, sub, now);
    await repo.updateMany("WritingSubmission", { taskId, studentId: sid }, { lock: { ...lock, extension: short(detail, 80) || "writing extension" } });
  }
  if ((await repo.count("WritingIntegrityEvent", { taskId, studentId: sid })) < MAX_EVENTS) await event(repo, taskId, sid, kind, short(detail, 200) || null, now);
  return stateOf(t, sub, now);
}

/**
 * “Submit Essay” (or the page's timer reaching zero: timeUp). The server decides with its own clock: past the limit
 * (+ grace) the essay is submitted as last saved; a timer that ends early only saves.
 */
export async function submitLocked(repo: Repo, actor: Actor, taskId: string, text: string, now = new Date(), timeUp = false): Promise<LockState> {
  const t = await ownLockedTask(repo, actor, taskId);
  const sid = actor.studentId!;
  const sub = await enforceDeadline(repo, t, started(await getSub(repo, taskId, sid)), now);
  if (!sub || s(sub.status) !== "DRAFT") return stateOf(t, sub, now);
  const body = cleanText(text);
  if (timeUp) {
    const end = deadlineOf(t, sub);
    if (end !== null && now.getTime() >= end - 2000) await autoSubmit(repo, taskId, sid, "TIME", now, "The time limit ended.", body);
    else await repo.updateMany("WritingSubmission", { taskId, studentId: sid, status: "DRAFT" }, { text: body, autosavedAt: now });
    return stateOf(t, await getSub(repo, taskId, sid), now);
  }
  const n = await repo.updateMany("WritingSubmission", { taskId, studentId: sid, status: "DRAFT" }, { text: body, status: "SUBMITTED", submitMode: "MANUAL", submittedAt: now, autosavedAt: now });
  if (n) await event(repo, taskId, sid, "SUBMIT", `${countWords(body)} words.`, now);
  return stateOf(t, await getSub(repo, taskId, sid), now);
}

// ------------------------------------------------------------------ the student: preview and the returned grade

export interface ApprovedGrade {
  levels: Record<string, number>; points: Record<string, number>; comment: string; sentences: SentenceComment[]; total: number; max: number; pct: number; at: string;
}
export interface SentenceComment { index: number; text: string; comment: string }
interface Grading { levels: Record<string, number>; comment: string; sentences: SentenceComment[]; total: number; max: number; at?: string; approved?: ApprovedGrade | null }

export interface LockedStudentView {
  id: string; title: string; promptHtml: string; minWords: number | null; timeLimitMin: number | null; dueAt: string | null; gradeLevel: number | null;
  rubric: WritingRubricDef; max: number; status: LockedStatus; text: string | null; words: number; startedAt: string | null; submittedAt: string | null; state: LockState;
  /** only after the teacher's “Approve & Return” (never the AI's suggestion) */
  result: null | { total: number; max: number; pct: number; comment: string; criteria: { key: string; title: string; label: string; description: string; points: number; max: number }[]; sentences: SentenceComment[] };
}

export async function lockedTaskForStudent(repo: Repo, actor: Actor, taskId: string, now = new Date()): Promise<LockedStudentView> {
  const t = await ownLockedTask(repo, actor, taskId);
  const sub = await enforceDeadline(repo, t, await getSub(repo, taskId, actor.studentId!), now);
  const rubric = rubricOf(t), status = lockedStatus(sub);
  const g = json<Grading>(sub?.grading);
  const a = status === "GRADED" ? g?.approved ?? null : null;
  const text = sub?.text ? s(sub.text) : null;
  return {
    id: s(t.id), title: s(t.title), promptHtml: sanitizeHtml(t.promptHtml || s(t.prompt).replace(/</g, "&lt;")), minWords: t.minWords ? Number(t.minWords) : null, timeLimitMin: t.timeLimitMin ? Number(t.timeLimitMin) : null,
    dueAt: iso(t.dueAt), gradeLevel: t.gradeLevel ? Number(t.gradeLevel) : null, rubric, max: rubricMax(rubric), status, text: status === "NOT_STARTED" ? null : text, words: text ? countWords(text) : 0,
    startedAt: iso(sub?.startedAt), submittedAt: iso(sub?.submittedAt), state: stateOf(t, sub, now),
    result: a ? {
      total: a.total, max: a.max, pct: a.pct, comment: a.comment, sentences: a.sentences,
      criteria: rubric.criteria.map((c) => { const lv = c.levels[a.levels[c.key]]; return { key: c.key, title: c.title, label: lv?.label ?? "", description: lv?.description ?? "", points: a.points[c.key] ?? 0, max: criterionMax(c) }; }),
    } : null,
  };
}

// ------------------------------------------------------------------ the teacher: submissions

async function lockedTask(repo: Repo, taskId: string): Promise<Row> {
  const t = await repo.findUnique("WritingTask", { id: taskId });
  if (!t || t.deletedAt || !isLocked(t)) throw new ForbiddenError("Task not found.");
  return t;
}

export interface SubmissionRow { studentId: string; name: string; status: LockedStatus; words: number; startedAt: string | null; submittedAt: string | null; late: boolean; leaves: number; pastes: number; extension: string | null; total: number | null; pct: number | null; aiReady: boolean }
export interface LockedTaskTeacherView {
  id: string; classId: string; className: string; title: string; promptHtml: string; minWords: number | null; timeLimitMin: number | null; dueAt: string | null; gradeLevel: number | null;
  rubric: WritingRubricDef; max: number; assignTo: AssignTo; canGrade: boolean; counts: Record<LockedStatus, number>; average: number | null;
  rows: SubmissionRow[]; page: number; pages: number; total: number;
}

const SUB_COLS = ["studentId", "status", "text", "startedAt", "submittedAt", "submitMode", "leaveCount", "lock", "scorePct", "scores", "aiGrade", "grading"];
const ORDER: LockedStatus[] = ["SUBMITTED", "AUTO_SUBMITTED", "IN_PROGRESS", "NOT_STARTED", "GRADED"];

export async function lockedTaskForTeacher(repo: Repo, actor: Actor, taskId: string, page = 1, now = new Date()): Promise<LockedTaskTeacherView> {
  assertCan(actor, "reports:read");
  const t = await lockedTask(repo, taskId);
  const classId = s(t.classId);
  const klass = await assertClassRead(repo, actor, classId);
  let canGrade = true; try { await assertClassAccess(repo, actor, classId); } catch { canGrade = false; }
  const ids = assignedIds(t, await classMembers(repo, classId));
  let subs = await repo.findMany("WritingSubmission", { taskId }, { select: SUB_COLS });
  if (await sweepTask(repo, t, subs, now)) subs = await repo.findMany("WritingSubmission", { taskId }, { select: SUB_COLS });
  const [names, pastes] = await Promise.all([studentNames(repo, ids), repo.findMany("WritingIntegrityEvent", { taskId, kind: "PASTE" }, { select: ["studentId"] })]);
  const pasteBy = new Map<string, number>();
  for (const p of pastes) pasteBy.set(s(p.studentId), (pasteBy.get(s(p.studentId)) ?? 0) + 1);
  const rubric = rubricOf(t), due = time(t.dueAt);
  const all = ids.map((id): SubmissionRow => {
    const x = subs.find((r) => s(r.studentId) === id);
    const status = lockedStatus(x), text = s(x?.text);
    const g = json<Grading>(x?.grading);
    const sub = time(x?.submittedAt);
    return {
      studentId: id, name: names.get(id)?.name ?? "Student", status, words: text ? countWords(text) : 0, startedAt: iso(x?.startedAt), submittedAt: iso(x?.submittedAt),
      late: Number.isFinite(sub) && Number.isFinite(due) && sub > due, leaves: Number(x?.leaveCount ?? 0), pastes: pasteBy.get(id) ?? 0,
      extension: s(json<Record<string, unknown>>(x?.lock)?.extension) || null,
      total: status === "GRADED" ? g?.approved?.total ?? null : g ? g.total : null, pct: status === "GRADED" && x?.scorePct !== null && x?.scorePct !== undefined ? Number(x.scorePct) : null, aiReady: Boolean(x?.aiGrade),
    };
  }).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(ORDER.map((k) => [k, all.filter((r) => r.status === k).length])) as Record<LockedStatus, number>;
  const graded = all.filter((r) => r.pct !== null);
  const pages = Math.max(1, Math.ceil(all.length / SUBMISSIONS_PAGE)), p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return {
    id: s(t.id), classId, className: s(klass.name), title: s(t.title), promptHtml: sanitizeHtml(t.promptHtml || s(t.prompt).replace(/</g, "&lt;")), minWords: t.minWords ? Number(t.minWords) : null,
    timeLimitMin: t.timeLimitMin ? Number(t.timeLimitMin) : null, dueAt: iso(t.dueAt), gradeLevel: t.gradeLevel ? Number(t.gradeLevel) : null, rubric, max: rubricMax(rubric),
    assignTo: (s(t.assignTo) || "CLASS") as AssignTo, canGrade, counts, average: graded.length ? Math.round(graded.reduce((a, r) => a + (r.pct ?? 0), 0) / graded.length) : null,
    rows: all.slice((p - 1) * SUBMISSIONS_PAGE, p * SUBMISSIONS_PAGE), page: p, pages, total: all.length,
  };
}

// ------------------------------------------------------------------ the teacher: grading

export type AiConfidence = "high" | "medium" | "low";
export interface AiCriterionSuggestion {
  level: number; points: number; justification: string;
  /** the first evidence quote (older suggestions only have this) */
  quote: string;
  /** 1–2 exact quotes from the essay (quotes not found in the essay are dropped) */
  evidence?: string[];
  /** what exactly is missing to reach the next level ("" at the top level) */
  toNext?: string;
  confidence?: AiConfidence;
  /** the two readings disagreed: [the lower level (chosen), the higher level] */
  unsure?: [number, number] | null;
  /** capped because the essay is far too short */
  capped?: boolean;
}
export interface AiSuggestion {
  criteria: Record<string, AiCriterionSuggestion>; feedback: string;
  strengths?: string[]; nextSteps?: string[]; teacherNote?: string;
  /** how many readings were used (2 = consistency-checked) and the criteria they disagreed on */
  runs?: number; unsure?: string[]; at?: string;
}
export interface IntegrityLog {
  events: { kind: string; detail: string | null; at: string }[];
  leaves: number; leaveEvents: number; pastes: number; reloads: number; extension: string | null; extensions: string[];
  startedAt: string | null; submittedAt: string | null; timeSpentSec: number | null; submitMode: string | null;
}
export interface GradingView {
  task: { id: string; classId: string; title: string; promptHtml: string; minWords: number | null; timeLimitMin: number | null; dueAt: string | null; gradeLevel: number | null; aiNotes: string; ownRubric: boolean };
  studentId: string; name: string; status: LockedStatus; text: string; words: number; sentences: string[];
  rubric: WritingRubricDef; max: number; grading: Grading | null; ai: AiSuggestion | null; canGrade: boolean; integrity: IntegrityLog;
}

async function assignedOrDeny(repo: Repo, t: Row, studentId: string): Promise<void> {
  const ok = await repo.findMany("ClassMembership", { classId: t.classId, studentId }, { select: ["studentId"] });
  if (!ok.length || !isAssignedTo(t, studentId)) throw new ForbiddenError("This student does not have this task.");
}

/** Time spent: each Start → (Submit | Auto-submit | Time up) session, added up. */
function timeSpent(events: Row[], sub: Row | null): number | null {
  let total = 0, open: number | null = null, any = false;
  for (const e of events) {
    const k = s(e.kind), at = time(e.at);
    if (k === "START") open = at;
    else if ((k === "SUBMIT" || k === "AUTO_SUBMIT" || k === "TIME_UP") && open !== null) { total += at - open; open = null; any = true; }
  }
  if (open !== null && sub && s(sub.status) === "DRAFT") return null; // still writing
  return any ? Math.round(total / 1000) : null;
}

export async function gradingView(repo: Repo, actor: Actor, taskId: string, studentId: string, now = new Date()): Promise<GradingView> {
  assertCan(actor, "reports:read");
  const t = await lockedTask(repo, taskId);
  await assertClassRead(repo, actor, s(t.classId));
  await assignedOrDeny(repo, t, studentId);
  let canGrade = true; try { await assertClassAccess(repo, actor, s(t.classId)); } catch { canGrade = false; }
  const sub = await enforceDeadline(repo, t, await getSub(repo, taskId, studentId), now);
  const [names, events] = await Promise.all([
    studentNames(repo, [studentId]),
    repo.findMany("WritingIntegrityEvent", { taskId, studentId }, { select: ["kind", "detail", "at"], orderBy: [{ field: "at", dir: "asc" }], take: MAX_EVENTS + 50 }),
  ]);
  const text = s(sub?.text), rubric = rubricOf(t);
  const lock = json<Record<string, unknown>>(sub?.lock) ?? {};
  const isLeave = (k: string) => (LEAVE_KINDS as readonly string[]).includes(k) || k === "RELOAD";
  const firstStart = events.find((e) => s(e.kind) === "START");
  return {
    task: { id: s(t.id), classId: s(t.classId), title: s(t.title), promptHtml: sanitizeHtml(t.promptHtml || s(t.prompt).replace(/</g, "&lt;")), minWords: t.minWords ? Number(t.minWords) : null, timeLimitMin: t.timeLimitMin ? Number(t.timeLimitMin) : null, dueAt: iso(t.dueAt), gradeLevel: t.gradeLevel ? Number(t.gradeLevel) : null, aiNotes: s(t.aiNotes), ownRubric: Boolean(s(t.rubricText).trim()) },
    studentId, name: names.get(studentId)?.name ?? "Student", status: lockedStatus(sub), text, words: countWords(text), sentences: splitSentences(text),
    rubric, max: rubricMax(rubric), grading: json<Grading>(sub?.grading), ai: json<AiSuggestion>(sub?.aiGrade), canGrade,
    integrity: {
      events: events.map((e) => ({ kind: s(e.kind), detail: e.detail ? s(e.detail) : null, at: iso(e.at) ?? "" })),
      leaves: Number(sub?.leaveCount ?? 0), leaveEvents: events.filter((e) => isLeave(s(e.kind))).length, pastes: events.filter((e) => s(e.kind) === "PASTE").length,
      reloads: events.filter((e) => s(e.kind) === "RELOAD").length, extension: s(lock.extension) || null,
      extensions: [...new Set(events.filter((e) => s(e.kind) === "EXTENSION").map((e) => s(e.detail)).filter(Boolean))],
      startedAt: iso(firstStart?.at) ?? iso(sub?.startedAt), submittedAt: iso(sub?.submittedAt), timeSpentSec: timeSpent(events, sub), submitMode: sub?.submitMode ? s(sub.submitMode) : null,
    },
  };
}

async function gradable(repo: Repo, actor: Actor, taskId: string, studentId: string): Promise<{ t: Row; sub: Row }> {
  assertCan(actor, "assignments:create");
  const t = await lockedTask(repo, taskId);
  await assertClassAccess(repo, actor, s(t.classId));
  await assignedOrDeny(repo, t, studentId);
  const sub = await getSub(repo, taskId, studentId);
  if (!sub || (s(sub.status) !== "SUBMITTED" && s(sub.status) !== "SCORED")) throw new ValidationError("The student has not submitted yet.");
  return { t, sub };
}

export interface GradeInput { levels: Record<string, unknown>; comment?: string | null; sentences?: unknown }

function cleanSentences(input: unknown, sentences: string[]): SentenceComment[] {
  const list = json<unknown[]>(input) ?? [];
  const by = new Map<number, SentenceComment>();
  for (const raw of Array.isArray(list) ? list : []) {
    const x = raw as { index?: unknown; comment?: unknown };
    const i = Number(x?.index), comment = short(x?.comment, 500);
    if (!Number.isInteger(i) || i < 0 || i >= sentences.length) throw new ValidationError("A sentence comment points to a sentence that is not in the essay.");
    if (comment) by.set(i, { index: i, text: sentences[i], comment });
  }
  if (by.size > 60) throw new ValidationError("At most 60 sentence comments.");
  return [...by.values()].sort((a, b) => a.index - b.index);
}

/**
 * Saves the teacher's grade (a level per criterion → the total is computed). With approve ("Approve & Return") every
 * criterion needs a level, and the student sees it; before that, nothing.
 */
export async function saveLockedGrade(repo: Repo, actor: Actor, taskId: string, studentId: string, input: GradeInput, approve: boolean, now = new Date()): Promise<{ total: number; max: number; pct: number; approved: boolean }> {
  const { t, sub } = await gradable(repo, actor, taskId, studentId);
  const rubric = rubricOf(t), sentences = splitSentences(s(sub.text));
  const levels: Record<string, number> = {}, missing: string[] = [];
  for (const c of rubric.criteria) {
    const v = input.levels?.[c.key];
    if (v === undefined || v === null || v === "") { missing.push(c.title); continue; }
    const i = Number(v);
    if (!Number.isInteger(i) || i < 0 || i >= c.levels.length) throw new ValidationError(`${c.title}: choose one of its levels.`);
    levels[c.key] = i;
  }
  if (approve && missing.length) throw new ValidationError(`Choose a level for: ${missing.join(", ")}.`);
  const points = Object.fromEntries(rubric.criteria.filter((c) => c.key in levels).map((c) => [c.key, c.levels[levels[c.key]].points]));
  const total = Object.values(points).reduce((a, b) => a + b, 0), max = rubricMax(rubric), pct = max ? Math.round((100 * total) / max) : 0;
  const comment = s(input.comment).trim().slice(0, 3000);
  const sc = cleanSentences(input.sentences ?? [], sentences);
  const prev = json<Grading>(sub.grading);
  const grading: Grading = { levels, comment, sentences: sc, total, max, at: now.toISOString(), approved: prev?.approved ?? null };
  if (!approve) { await repo.updateMany("WritingSubmission", { taskId, studentId }, { grading }); return { total, max, pct, approved: false }; }
  grading.approved = { levels, points, comment, sentences: sc, total, max, pct, at: now.toISOString() };
  await repo.updateMany("WritingSubmission", { taskId, studentId }, { grading, scores: points, comment: comment.slice(0, 2000) || null, status: "SCORED", scoredById: actor.userId, scoredAt: now, returnedAt: now, scorePct: pct });
  await event(repo, taskId, studentId, "RETURNED", `${total}/${max} (${pct}%)`, now, actor.userId);
  const st = await repo.findUnique("Student", { id: studentId });
  if (st) await repo.create("Notification", { userId: st.userId, type: "TEACHER_FEEDBACK", title: "✍️ Your teacher returned your essay", body: s(t.title).slice(0, 160), link: `/student/writing/${taskId}`, createdAt: now });
  return { total, max, pct, approved: true };
}

/** Reopens a submitted or auto-submitted essay: the student presses Start again and continues (logged). */
export async function reopenLocked(repo: Repo, actor: Actor, taskId: string, studentId: string, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const t = await lockedTask(repo, taskId);
  await assertClassAccess(repo, actor, s(t.classId));
  await assignedOrDeny(repo, t, studentId);
  const sub = await getSub(repo, taskId, studentId);
  if (!sub || s(sub.status) !== "SUBMITTED") throw new ValidationError("Only a submitted essay that is not graded yet can be reopened.");
  const mode = s(sub.submitMode) || "MANUAL";
  const n = await repo.updateMany("WritingSubmission", { taskId, studentId, status: "SUBMITTED" }, { status: "DRAFT", submittedAt: null, submitMode: null, startedAt: null, leaveCount: 0, lock: { opens: 0 } });
  if (!n) return;
  await event(repo, taskId, studentId, "REOPEN", `Reopened by the teacher (was ${mode === "MANUAL" ? "submitted" : "auto-submitted"}).`, now, actor.userId);
  const st = await repo.findUnique("Student", { id: studentId });
  if (st) await repo.create("Notification", { userId: st.userId, type: "TEACHER_FEEDBACK", title: "✍️ Your teacher reopened your essay", body: s(t.title).slice(0, 160), link: `/student/writing/${taskId}`, createdAt: now });
}

// ------------------------------------------------------------------ the teacher: Grade with AI

const AI_TOOL = "writing-grade";
export const WRITING_AI_GRADE_PER_DAY = 40;
const schoolDay = (now: Date) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

/** What the AI is told about the task (never a name, an id, a class or a score history). */
export interface AiTaskContext {
  gradeLevel?: number | null; minWords?: number | null; timeLimitMin?: number | null;
  /** the teacher's notes for AI grading */
  notes?: string | null;
  /** the teacher's own rubric text (as written or pasted) */
  rubricText?: string | null;
  /** 1 or 2: the two independent readings of the consistency check */
  reading?: number;
}

/**
 * The request: the task, its grade level / minimum words / counted words / time limit, the rubric (levels listed from
 * the highest to the lowest, each with its index), the teacher's notes and own rubric wording, and the essay.
 */
export function lockedAiPayload(rubric: WritingRubricDef, prompt: string, essay: string, ctx: AiTaskContext = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    task: prompt.slice(0, 3000),
    gradeLevel: ctx.gradeLevel ?? null,
    minWords: ctx.minWords ?? null,
    wordCount: countWords(essay),
    timeLimitMinutes: ctx.timeLimitMin ?? null,
    rubric: rubric.criteria.map((c) => ({
      key: c.key, criterion: c.title, description: c.description,
      levelsHighestFirst: c.levels.map((l, i) => ({ level: i, label: l.label, points: l.points, description: l.description })).sort((a, b) => b.points - a.points || b.level - a.level),
    })),
  };
  const notes = s(ctx.notes).trim(), wording = s(ctx.rubricText).trim();
  if (notes) out.teacherNotes = notes.slice(0, AI_NOTES_MAX);
  if (wording) out.teacherRubricWording = wording.slice(0, 6000);
  out.essay = essay.slice(0, 8000);
  if (ctx.reading) out.reading = ctx.reading;
  return out;
}

export function lockedAiSystem(): string {
  return [
    "You are an expert ESL/ELA writing examiner. You help a teacher grade ONE essay written by a school student (Grade 1–12) who is learning English; their first language is usually Arabic. Your answer is for the TEACHER only: the teacher checks and edits it before anything reaches the student.",
    "",
    "GRADING PROCEDURE — follow it for every criterion, in order:",
    "1. Read the task (the writing prompt), gradeLevel, minWords, wordCount (counted for you) and timeLimitMinutes. If given, read teacherNotes (the teacher's focus for this task) and teacherRubricWording (the teacher's own rubric text: it explains what the levels mean). Then read the whole essay once before deciding anything.",
    "2. For each criterion, compare the essay with EVERY level description in levelsHighestFirst, starting from the HIGHEST level and moving down. Choose the HIGHEST level whose description is FULLY met by the essay. When the essay is between two levels (it meets only part of the higher description), choose the LOWER of the two.",
    "3. Judge against what is reasonable for a student of that gradeLevel writing under these conditions (the time limit and the minimum length) — not against an adult writer, and not against a younger grade.",
    "4. Grade each criterion only on what it describes. Ignore spelling, punctuation and grammar for any criterion that is not about language, conventions or mechanics. Never reward length alone: a long essay that repeats itself or wanders is not well developed.",
    "5. If the essay is off-topic (does not answer the task) or far too short (under about half of minWords, or only one or two sentences), criteria about ideas, content, development, support or evidence must stay at the lowest or second-lowest level; say why in the justification.",
    "6. justification: 1–2 short sentences that name what in the essay matches the chosen level's description (and, if relevant, what keeps it from the level above).",
    "7. evidence: 1–2 SHORT quotes (3–20 words) copied EXACTLY, character for character, from the essay — do not fix the student's spelling inside a quote. Use [] only if nothing in the essay applies.",
    "8. toNext: exactly what is missing to reach the NEXT level up, tied to that level's description and to this essay (concrete, e.g. \"Give a second reason and explain it with an example\"). Use \"\" for the highest level.",
    "9. confidence: \"high\" when the essay clearly fits one level description, \"medium\" when it partly fits two levels, \"low\" when the descriptions are vague or the essay is hard to judge.",
    "",
    "THEN OVERALL:",
    "- strengths: exactly 2 specific strengths, each pointing to something real in the essay.",
    "- nextSteps: 2–3 concrete, teachable next steps, the most important first.",
    "- feedback: suggested feedback for the student — kind, specific, simple English (short sentences, everyday words), addressed to the student as \"you\": one or two strengths, then one or two next steps; 3–6 sentences. Never mention levels, points, scores, grades or other students.",
    "- teacherNote: 1–2 short sentences for the teacher only: what to double-check (a borderline criterion, an off-topic part, text that may not be the student's own), or \"\" if nothing.",
    "",
    "Never mention or guess a name or any personal detail. Reply with JSON only, exactly in this shape (level = the \"level\" index given in the rubric):",
    "{\"criteria\": {\"<criterion key>\": {\"level\": number, \"justification\": string, \"evidence\": [string], \"toNext\": string, \"confidence\": \"high\"|\"medium\"|\"low\"}}, \"strengths\": [string, string], \"nextSteps\": [string], \"feedback\": string, \"teacherNote\": string}",
  ].join("\n");
}

const norm = (t: string) => t.toLowerCase().replace(/[“”"‘’'`]/g, "").replace(/\s+/g, " ").trim();
const CONFIDENCE: AiConfidence[] = ["low", "medium", "high"];
const strList = (v: unknown, max: number, len: number): string[] => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : []).map((x) => short(x, len)).filter((x) => x.length >= 3).slice(0, max);
/** The index of the highest-points level (the top of the rubric). */
const topLevel = (c: RubricCriterion) => c.levels.reduce((best, l, i) => (l.points > c.levels[best].points ? i : best), 0);

/**
 * Validates and clamps the AI reply to the rubric: a level index of each criterion (points = that level's), evidence
 * quotes must be in the essay (others are dropped), toNext ("" at the top level), confidence, strengths, next steps.
 */
export function lockedAiValidator(rubric: WritingRubricDef, essay: string): Validator<AiSuggestion> {
  const hay = norm(essay);
  return (data) => {
    const d = data as { criteria?: Record<string, Record<string, unknown>>; feedback?: unknown; strengths?: unknown; nextSteps?: unknown; teacherNote?: unknown };
    if (!d || typeof d !== "object" || !d.criteria || typeof d.criteria !== "object") return { ok: false, error: "criteria must be an object keyed by the rubric keys" };
    const out: AiSuggestion["criteria"] = {};
    for (const c of rubric.criteria) {
      const x = d.criteria[c.key];
      if (!x || typeof x !== "object") return { ok: false, error: `criterion “${c.key}” is missing` };
      let lv = typeof x.level === "string" ? Number.parseFloat(x.level) : Number(x.level);
      if (!Number.isFinite(lv)) {
        const byLabel = c.levels.findIndex((l) => norm(l.label) === norm(s(x.level ?? x.label)));
        const pts = Number(x.points);
        if (byLabel >= 0) lv = byLabel;
        else if (Number.isFinite(pts)) lv = c.levels.reduce((best, l, i) => (Math.abs(l.points - pts) < Math.abs(c.levels[best].points - pts) ? i : best), 0);
        else return { ok: false, error: `${c.key}.level must be the index of one of its levels (0 to ${c.levels.length - 1})` };
      }
      const level = Math.max(0, Math.min(c.levels.length - 1, Math.round(lv)));
      const justification = short(x.justification, 400);
      if (justification.length < 5) return { ok: false, error: `${c.key} needs a short justification` };
      const quotes = [...strList(x.evidence, 4, 240), ...strList(x.quote, 1, 240)].map((q) => q.replace(/^[“”"'‘’]+|[“”"'‘’]+$/g, "").trim());
      const evidence = [...new Set(quotes.filter((q) => q.length >= 3 && hay.includes(norm(q))))].slice(0, 2);
      const conf = s(x.confidence).toLowerCase();
      out[c.key] = {
        level, points: c.levels[level].points, justification, quote: evidence[0] ?? "", evidence,
        toNext: level === topLevel(c) ? "" : short(x.toNext, 300),
        confidence: (CONFIDENCE as string[]).includes(conf) ? (conf as AiConfidence) : "medium",
        unsure: null,
      };
    }
    const feedback = short(d.feedback, 1200);
    if (feedback.length < 5) return { ok: false, error: "feedback must be a few sentences" };
    return { ok: true, value: { criteria: out, feedback, strengths: strList(d.strengths, 2, 240), nextSteps: strList(d.nextSteps, 3, 240), teacherNote: short(d.teacherNote, 400) } };
  };
}

const rankOf = (c: RubricCriterion, level: number) => [...new Set(c.levels.map((l) => l.points))].sort((a, b) => a - b).indexOf(c.levels[level]?.points ?? 0);
const totalOf = (r: AiSuggestion) => Object.values(r.criteria).reduce((a, x) => a + x.points, 0);

/**
 * The consistency check: two independent readings. Where they agree the level stands (confidence = the lower of the
 * two); where they disagree the LOWER level is taken, marked unsure between the two, and the confidence lowered
 * (one step for neighbouring levels, "low" when they are further apart). The overall comments come from the reading
 * with the lower total (they match the more careful levels). One reading alone is used as it is.
 */
export function mergeAiRuns(rubric: WritingRubricDef, runs: AiSuggestion[]): AiSuggestion {
  if (!runs.length) throw new Error("No AI reading to merge.");
  if (runs.length === 1) return { ...runs[0], runs: 1, unsure: [] };
  const [a, b] = runs;
  const criteria: AiSuggestion["criteria"] = {}, unsure: string[] = [];
  for (const c of rubric.criteria) {
    const x = a.criteria[c.key], y = b.criteria[c.key];
    const cx = CONFIDENCE.indexOf(x.confidence ?? "medium"), cy = CONFIDENCE.indexOf(y.confidence ?? "medium");
    if (x.level === y.level) {
      const evidence = [...new Set([...(x.evidence ?? []), ...(y.evidence ?? [])])].slice(0, 2);
      criteria[c.key] = { ...x, evidence, quote: evidence[0] ?? "", confidence: CONFIDENCE[Math.min(cx, cy)], unsure: null };
      continue;
    }
    const [lo, hi] = x.points < y.points || (x.points === y.points && x.level < y.level) ? [x, y] : [y, x];
    const gap = Math.abs(rankOf(c, x.level) - rankOf(c, y.level));
    const confidence: AiConfidence = gap >= 2 ? "low" : CONFIDENCE[Math.max(0, Math.min(cx, cy) - 1)];
    criteria[c.key] = { ...lo, confidence, unsure: [lo.level, hi.level] };
    unsure.push(c.key);
  }
  const base = totalOf(a) <= totalOf(b) ? a : b;
  return { criteria, feedback: base.feedback, strengths: base.strengths ?? [], nextSteps: base.nextSteps ?? [], teacherNote: base.teacherNote ?? "", runs: 2, unsure };
}

/** Criteria about ideas / content / development (capped when the essay is far too short). */
export const IDEAS_CRITERION = /idea|content|develop|elaborat|support|argument|evidence|reason|detail|focus|thesis|claim|purpose|task|response/i;

/**
 * A safety net under the prompt's rule: an essay under half of the minimum word count cannot score above the
 * second-lowest level on ideas / development criteria (marked "capped", confidence lowered).
 */
export function capShortEssay(rubric: WritingRubricDef, sug: AiSuggestion, wordCount: number, minWords: number | null): AiSuggestion {
  if (!minWords || wordCount >= minWords / 2) return sug;
  const criteria = { ...sug.criteria };
  for (const c of rubric.criteria) {
    const x = criteria[c.key];
    if (!x || !IDEAS_CRITERION.test(`${c.title} ${c.description}`)) continue;
    const order = c.levels.map((l, i) => ({ i, p: l.points })).sort((p, q) => p.p - q.p || p.i - q.i);
    const cap = order[Math.min(1, order.length - 1)];
    if (x.points <= cap.p) continue;
    const unsure = x.unsure ? ([cap.i, x.unsure[1]] as [number, number]) : null;
    criteria[c.key] = { ...x, level: cap.i, points: cap.p, capped: true, unsure, confidence: "low", toNext: x.toNext || "Write more: the essay is far shorter than the task asks." };
  }
  return { ...sug, criteria };
}

/** Removes the student's name (if a teacher typed it) from what the teacher wrote for the AI. */
function redactNames(text: string, names: string[]): string {
  const parts = [...new Set(names.flatMap((x) => [x.trim(), ...x.split(/\s+/)]).filter((x) => x.length >= 3))].sort((p, q) => q.length - p.length);
  if (!text || !parts.length) return text;
  const alt = parts.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")).join("|");
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, "giu"), "the student");
}

/** The teacher's notes for AI grading of a task (from the grading page, before "Grade with AI"). */
export async function saveAiNotes(repo: Repo, actor: Actor, taskId: string, notes: unknown): Promise<void> {
  assertCan(actor, "assignments:create");
  const t = await lockedTask(repo, taskId);
  await assertClassAccess(repo, actor, s(t.classId));
  const v = cleanNotes(notes);
  if ((s(t.aiNotes).trim() || null) !== v) await repo.updateMany("WritingTask", { id: taskId }, { aiNotes: v });
}

type Make = { gemini?: typeof geminiProvider; anthropic?: typeof anthropicProvider };
/**
 * “Grade with AI”: two independent readings (counted as ONE use of the daily AI grading cap), merged by the
 * consistency check; a suggestion saved for the teacher only (edited, then approved by the teacher). If one reading
 * fails the other is used. Never throws for AI problems.
 */
export async function aiGradeLocked(repo: Repo, actor: Actor, taskId: string, studentId: string, env: EnvLike, now = new Date(), make: Make = {}): Promise<{ outcome: "READY" | "OFF" | "LIMIT" | "FAILED"; reason: string | null; runs?: number }> {
  const { t, sub } = await gradable(repo, actor, taskId, studentId);
  const essay = s(sub.text);
  if (countWords(essay) < 3) return { outcome: "FAILED", reason: "There is no essay to read yet." };
  const schoolId = s(t.schoolId);
  const settings = await aiSettings(repo, schoolId);
  const picked = pickProvider(env, settings, make);
  if (!picked.ok) return { outcome: "OFF", reason: picked.reason };
  const rs = await rateState(repo, schoolId, settings, now);
  if (rs.reason && rs.waitMs > 0) return { outcome: "LIMIT", reason: rs.reason };
  const day = await consumeRateLimit(repo, `writing-ai-grade:${schoolId}:${schoolDay(now)}`, WRITING_AI_GRADE_PER_DAY, 86_400_000, now);
  if (!day.allowed) return { outcome: "LIMIT", reason: `Today's ${WRITING_AI_GRADE_PER_DAY} AI gradings are used. Grade by hand, or ask again tomorrow.` };
  const rubric = rubricOf(t);
  const who = (await studentNames(repo, [studentId])).get(studentId);
  const ids = [who?.name ?? "", who?.number ?? ""].filter((x) => x && x !== "Student");
  const minWords = t.minWords ? Number(t.minWords) : null;
  const ctx: AiTaskContext = {
    gradeLevel: t.gradeLevel ? Number(t.gradeLevel) : null, minWords, timeLimitMin: t.timeLimitMin ? Number(t.timeLimitMin) : null,
    notes: redactNames(s(t.aiNotes), ids), rubricText: redactNames(s(t.rubricText), ids),
  };
  const prompt = htmlToText(s(t.promptHtml)) || s(t.prompt);
  const validator = lockedAiValidator(rubric, essay);
  const read = (reading: number) => callJson(repo, { schoolId, tool: AI_TOOL, picked, items: 1 }, lockedAiSystem(), lockedAiPayload(rubric, prompt, essay, { ...ctx, reading }), validator, 1)
    .catch((e: Error) => ({ ok: false as const, error: e.message, stop: true }));
  const results = await Promise.all([read(1), read(2)]);
  const good = results.flatMap((r) => (r.ok ? [r.value] : []));
  if (!good.length) { const r = results[0]; return { outcome: "FAILED", reason: (!r.ok && r.error) || "The AI did not give a usable grade." }; }
  const merged = capShortEssay(rubric, mergeAiRuns(rubric, good), countWords(essay), minWords);
  await repo.updateMany("WritingSubmission", { taskId, studentId }, { aiGrade: { ...merged, at: now.toISOString() } });
  return { outcome: "READY", reason: null, runs: good.length };
}

// ------------------------------------------------------------------ reports and the dashboard

/** The rubric score (%) of a graded piece of writing of any kind (locked rubric tasks, genre rubrics, reading aloud). */
export function scorePercent(t: Row, sub: Row): number | null {
  if (s(sub.status) !== "SCORED") return null;
  if (sub.scorePct !== null && sub.scorePct !== undefined && sub.scorePct !== "") return Number(sub.scorePct);
  const sc = json<Record<string, number>>(sub.scores);
  if (!sc) return null;
  const total = Object.values(sc).reduce((a, b) => a + Number(b), 0);
  const max = isLocked(t) ? rubricMax(rubricOf(t)) : s(t.kind) === "READ_ALOUD" ? 12 : (() => { const r = rubricFor(s(t.genre)); return r.traits.length * r.max; })();
  return max ? Math.round((100 * total) / max) : null;
}
export function scoreMax(t: Row): number {
  if (isLocked(t)) return rubricMax(rubricOf(t));
  if (s(t.kind) === "READ_ALOUD") return 12;
  const r = rubricFor(s(t.genre)); return r.traits.length * r.max;
}

export interface WritingResults { tasks: { id: string; title: string; locked: boolean; dueAt: string | null }[]; rows: { studentId: string; name: string; pct: Record<string, number>; average: number | null }[]; average: number | null }

/** Writing results of a class (graded work only): the rubric score % per task and student, the averages. */
export async function writingResults(repo: Repo, actor: Actor, classId: string, opts: { studentId?: string; limit?: number } = {}): Promise<WritingResults> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  const members = await classMembers(repo, classId);
  const ids = opts.studentId ? members.filter((x) => x === opts.studentId) : members;
  const tasks = await repo.findMany("WritingTask", { classId, deletedAt: null }, { select: ["id", "title", "kind", "genre", "locked", "rubric", "dueAt", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: opts.limit ?? 12 });
  const subs = tasks.length && ids.length ? await repo.findMany("WritingSubmission", { taskId: { in: tasks.map((t) => t.id) }, studentId: { in: ids }, status: "SCORED" }, { select: ["taskId", "studentId", "status", "scores", "scorePct"] }) : [];
  const names = await studentNames(repo, ids);
  const used = tasks.filter((t) => subs.some((x) => x.taskId === t.id));
  const rows = ids.map((id) => {
    const pct: Record<string, number> = {};
    for (const x of subs.filter((r) => s(r.studentId) === id)) { const t = tasks.find((k) => k.id === x.taskId)!; const p = scorePercent(t, x); if (p !== null) pct[s(t.id)] = p; }
    const v = Object.values(pct);
    return { studentId: id, name: names.get(id)?.name ?? "Student", pct, average: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const avgs = rows.map((r) => r.average).filter((x): x is number => x !== null);
  return { tasks: used.map((t) => ({ id: s(t.id), title: s(t.title), locked: isLocked(t), dueAt: iso(t.dueAt) })), rows, average: avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null };
}

/** The teacher's dashboard: essays handed in and waiting to be graded (their readable classes). */
export async function writingToGrade(repo: Repo, actor: Actor): Promise<number> {
  assertCan(actor, "reports:read");
  const classes = await readableClasses(repo, actor);
  if (!classes.length) return 0;
  const tasks = await repo.findMany("WritingTask", { classId: { in: classes.map((c) => c.id) }, deletedAt: null }, { select: ["id"] });
  return tasks.length ? repo.count("WritingSubmission", { taskId: { in: tasks.map((t) => t.id) }, status: "SUBMITTED" }) : 0;
}
