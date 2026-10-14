/**
 * ✏️ Learn edits, problem reports and Hide — the files are NEVER changed or deleted.
 *
 *   A teacher edits any text of one lesson level (or one word card) → their own version, seen AT ONCE by the students of
 *   that teacher's classes, and sent to the admin as a proposal (PENDING). The admin sees a word-level diff and
 *   Approves (APPROVED = the school's version for everyone; an older school version becomes RETIRED) or Rejects
 *   (REJECTED = it stays the teacher's own). "Restore original" withdraws the teacher's own version (WITHDRAWN); the
 *   admin's Restore retires the school version. An admin's own edit is the school version at once.
 *   Which version a reader gets: the teacher's own (teacher) / their class teachers' own (student) → the school
 *   version → the file. One bounded read per lesson level / per selection.
 *
 *   Report a problem → the admin's list; the admin can Hide a lesson (never delete) until it is fixed.
 * Staff only for writing; every new table is read through safeIfBehind by the pages.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { changedLeaves, checkLevel, checkWordCard, LEVEL_WORDS, type LevelKey, type LLevel, type WordCard } from "../../lib/learn/format";
import { safeIfBehind } from "../db/schema-errors";
import { lessonFile, readLessons } from "./files";

const s = (v: unknown) => String(v ?? "");
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };
export type EditKind = "LESSON" | "WORD";
export type EditSource = "FILE" | "SCHOOL" | "MINE" | "TEACHER" | "NONE";
/** The statuses a reader can get: the school's version and a teacher's own. */
const LIVE = ["APPROVED", "PENDING", "REJECTED"];

export const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
export const isStaff = (a: Actor) => a.role === "TEACHER" || isAdmin(a);
export function staffSchool(actor: Actor): string {
  if (!isStaff(actor) || !actor.schoolId) throw new ForbiddenError("Teachers and admins only.");
  return actor.schoolId;
}
export function adminSchool(actor: Actor): string {
  if (!isAdmin(actor) || !actor.schoolId) throw new ForbiddenError("Only the admin can do this.");
  return actor.schoolId;
}

/** The signed-in teacher's Teacher id (null for an admin without a teacher record). */
export async function teacherIdOf(repo: Repo, actor: Actor): Promise<string | null> {
  if (!isStaff(actor)) return null;
  const t = (await repo.findMany("Teacher", { userId: actor.userId }, { select: ["id"], take: 1 }))[0];
  return t ? s(t.id) : null;
}
/** The teachers (Teacher ids) of a student's classes — their own versions reach the student. Two bounded reads. */
export async function classTeacherIds(repo: Repo, studentId: string): Promise<string[]> {
  const classIds = (await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId));
  if (!classIds.length) return [];
  return [...new Set((await repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["teacherId"] })).map((x) => s(x.teacherId)))];
}

/** Picks the version a reader gets from the live edits of ONE ref (+ level): own/teachers' first, then the school's. */
export function pickEdit(rows: Row[], teacherIds: readonly string[]): Row | null {
  const by = (a: Row, b: Row) => new Date(s(b.updatedAt)).getTime() - new Date(s(a.updatedAt)).getTime();
  const own = rows.filter((r) => (r.status === "PENDING" || r.status === "REJECTED") && r.authorTeacherId && teacherIds.includes(s(r.authorTeacherId))).sort(by)[0];
  if (own) return own;
  return rows.filter((r) => r.status === "APPROVED").sort(by)[0] ?? null;
}

/** The live edits of some refs (one read). */
export function liveEdits(repo: Repo, schoolId: string, kind: EditKind, refs: string[], level?: number): Promise<Row[]> {
  if (!refs.length) return Promise.resolve([]);
  return repo.findMany("LearnEdit", { schoolId, kind, ref: refs.length === 1 ? refs[0] : { in: refs }, status: { in: LIVE }, ...(level === undefined ? {} : { level }) },
    { select: ["id", "ref", "level", "status", "authorTeacherId", "authorUserId", "content", "updatedAt"], orderBy: [{ field: "updatedAt", dir: "desc" }], take: 400 });
}

export interface LevelVersion { level: LLevel; source: EditSource; editId: string | null; status: string | null }
/** One lesson level as a reader gets it (teacherIds: the reader's own Teacher id, or a student's class teachers). */
export async function lessonLevelFor(repo: Repo, schoolId: string, code: string, level: LevelKey, teacherIds: readonly string[], ownTeacherId: string | null = null): Promise<LevelVersion | null> {
  const file = lessonFile(code);
  if (!file) return null;
  const rows = await safeIfBehind("learn.edits", () => liveEdits(repo, schoolId, "LESSON", [code], Number(level)), [] as Row[]);
  const e = pickEdit(rows, teacherIds);
  if (!e) return { level: file.levels[level], source: "FILE", editId: null, status: null };
  const mine = ownTeacherId !== null && s(e.authorTeacherId) === ownTeacherId && e.status !== "APPROVED";
  return { level: json<LLevel>(e.content, file.levels[level]), source: e.status === "APPROVED" ? "SCHOOL" : mine ? "MINE" : "TEACHER", editId: s(e.id), status: s(e.status) };
}

/** The school's current version of a lesson level (approved or the file) — what an edit starts from. */
async function schoolLevel(repo: Repo, schoolId: string, code: string, level: LevelKey): Promise<LLevel | null> {
  return (await lessonLevelFor(repo, schoolId, code, level, []))?.level ?? null;
}

const asLevel = (n: unknown): LevelKey => { const k = s(n) as LevelKey; if (!["1", "2", "3", "4"].includes(k)) throw new ValidationError("Choose a level from 1 to 4."); return k; };

/** Saves an edit of one lesson level (teacher: their own version + a proposal; admin: the school's version). */
export async function saveLessonEdit(repo: Repo, actor: Actor, code: string, levelIn: unknown, content: LLevel, now = new Date()): Promise<{ id: string; status: string }> {
  const schoolId = staffSchool(actor);
  const level = asLevel(levelIn);
  const file = lessonFile(code);
  if (!file) throw new ValidationError("This lesson is not on the platform.");
  const p: string[] = [];
  checkLevel(content, level, p);
  if (p.length) throw new ValidationError(`Please fix: ${p.slice(0, 4).join("; ")}`);
  const base = await schoolLevel(repo, schoolId, code, level);
  if (JSON.stringify(base) === JSON.stringify(content)) throw new ValidationError("Nothing was changed.");
  return writeEdit(repo, actor, schoolId, "LESSON", code, Number(level), content as unknown as Record<string, unknown>, base as unknown as Record<string, unknown>, now);
}

async function writeEdit(repo: Repo, actor: Actor, schoolId: string, kind: EditKind, ref: string, level: number, content: Record<string, unknown>, base: Record<string, unknown> | null, now: Date): Promise<{ id: string; status: string }> {
  const teacherId = await teacherIdOf(repo, actor);
  const admin = isAdmin(actor);
  if (admin) await repo.updateMany("LearnEdit", { schoolId, kind, ref, level, status: "APPROVED" }, { status: "RETIRED", decidedById: actor.userId, decidedAt: now, updatedAt: now });
  else if (teacherId) await repo.updateMany("LearnEdit", { schoolId, kind, ref, level, authorTeacherId: teacherId, status: { in: ["PENDING", "REJECTED"] } }, { status: "WITHDRAWN", updatedAt: now });
  else throw new ForbiddenError("Teachers and admins only.");
  const status = admin ? "APPROVED" : "PENDING";
  const row = await repo.create("LearnEdit", { schoolId, kind, ref, level, authorUserId: actor.userId, authorTeacherId: admin ? null : teacherId, content, base, status, note: null, decidedById: admin ? actor.userId : null, decidedAt: admin ? now : null, createdAt: now, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: `learn.edit.${kind.toLowerCase()}`, entityType: "LearnEdit", entityId: s(row.id), after: { ref, level, status }, at: now });
  return { id: s(row.id), status };
}

/** Restore original: a teacher withdraws their own version; the admin retires the school version (back to the file). */
export async function restoreOriginal(repo: Repo, actor: Actor, kind: EditKind, ref: string, level: number, now = new Date()): Promise<number> {
  const schoolId = staffSchool(actor);
  if (isAdmin(actor)) {
    const n = await repo.updateMany("LearnEdit", { schoolId, kind, ref, level, status: "APPROVED" }, { status: "RETIRED", decidedById: actor.userId, decidedAt: now, updatedAt: now });
    await audit(repo, { actorId: actor.userId, action: "learn.restore", entityType: "LearnEdit", entityId: `${kind}:${ref}:${level}`, after: { retired: n }, at: now });
    return n;
  }
  const teacherId = await teacherIdOf(repo, actor);
  if (!teacherId) return 0;
  return repo.updateMany("LearnEdit", { schoolId, kind, ref, level, authorTeacherId: teacherId, status: { in: ["PENDING", "REJECTED"] } }, { status: "WITHDRAWN", updatedAt: now });
}

/** Admin: Approve (the school's version) or Reject (stays the teacher's own) a proposal. */
export async function decideEdit(repo: Repo, actor: Actor, editId: string, approve: boolean, note: string | null = null, now = new Date()): Promise<void> {
  const schoolId = adminSchool(actor);
  const e = await repo.findUnique("LearnEdit", { id: editId });
  if (!e || s(e.schoolId) !== schoolId) throw new ValidationError("This proposal is not there any more.");
  if (s(e.status) !== "PENDING") throw new ValidationError("This proposal was already decided.");
  if (approve) await repo.updateMany("LearnEdit", { schoolId, kind: e.kind, ref: e.ref, level: Number(e.level), status: "APPROVED" }, { status: "RETIRED", decidedById: actor.userId, decidedAt: now, updatedAt: now });
  await repo.updateMany("LearnEdit", { id: editId }, { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, decidedAt: now, note: note ? note.slice(0, 300) : null, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: approve ? "learn.edit.approve" : "learn.edit.reject", entityType: "LearnEdit", entityId: editId, after: { ref: s(e.ref), level: Number(e.level) }, at: now });
}

export interface Proposal { id: string; kind: EditKind; ref: string; level: number; title: string; by: string; at: string; changes: { path: string; old: string; now: string }[] }
/** Admin: the open proposals (newest first) with what changed (old vs new per text). Bounded. */
export async function proposals(repo: Repo, actor: Actor, take = 50): Promise<Proposal[]> {
  const schoolId = adminSchool(actor);
  const rows = await repo.findMany("LearnEdit", { schoolId, status: "PENDING" }, { select: ["id", "kind", "ref", "level", "authorUserId", "content", "base", "updatedAt"], orderBy: [{ field: "updatedAt", dir: "desc" }], take });
  if (!rows.length) return [];
  const users = await repo.findMany("User", { id: { in: [...new Set(rows.map((r) => s(r.authorUserId)))] } }, { select: ["id", "displayName"] });
  const files = readLessons().valid;
  return rows.map((r) => {
    const kind = s(r.kind) as EditKind, ref = s(r.ref);
    const title = kind === "LESSON" ? `${files.get(ref)?.title ?? ref}` : ref.split("|").pop() ?? ref;
    return { id: s(r.id), kind, ref, level: Number(r.level), title, by: s(users.find((u) => u.id === r.authorUserId)?.displayName), at: new Date(s(r.updatedAt)).toISOString(), changes: changedLeaves(json(r.base, {}), json(r.content, {})).slice(0, 60) };
  });
}

// ------------------------------------------------------------------ words

/** Saves a word card (an edit of an explained word, or a first explanation / a new word of a selection). */
export async function saveWordEdit(repo: Repo, actor: Actor, key: string, card: WordCard, base: WordCard | null, now = new Date()): Promise<{ id: string; status: string }> {
  const schoolId = staffSchool(actor);
  const parts = key.split("|");
  if (parts.length !== 4 || parts.slice(0, 3).some((x) => !/^\d{1,3}$/.test(x)) || !parts[3]) throw new ValidationError("Unknown word.");
  const p = checkWordCard(card, card.word);
  if (p.length) throw new ValidationError(`Please fix: ${p.slice(0, 4).map((x) => x.replace(/^[^:]*:\s*/, "")).join("; ")}`);
  if (base && JSON.stringify(base) === JSON.stringify(card)) throw new ValidationError("Nothing was changed.");
  return writeEdit(repo, actor, schoolId, "WORD", key, 0, card as unknown as Record<string, unknown>, base as unknown as Record<string, unknown> | null, now);
}

// ------------------------------------------------------------------ reports + hide

/** Report a problem (any staff member) → the admin's list. */
export async function reportProblem(repo: Repo, actor: Actor, kind: EditKind, ref: string, level: number, text: string, now = new Date()): Promise<void> {
  const schoolId = staffSchool(actor);
  const t = s(text).replace(/\s+/g, " ").trim();
  if (t.length < 5) throw new ValidationError("Write in a few words what is wrong.");
  if (kind === "LESSON" && !lessonFile(ref)) throw new ValidationError("This lesson is not on the platform.");
  await repo.create("LearnReport", { schoolId, kind, ref: ref.slice(0, 160), level: Number(level) || 0, userId: actor.userId, text: t.slice(0, 1000), status: "OPEN", createdAt: now });
}

export interface ReportRow { id: string; kind: EditKind; ref: string; level: number; title: string; text: string; by: string; at: string; hidden: boolean }
/** Admin: the open problem reports (newest first). */
export async function openReports(repo: Repo, actor: Actor, take = 100): Promise<ReportRow[]> {
  const schoolId = adminSchool(actor);
  const rows = await repo.findMany("LearnReport", { schoolId, status: "OPEN" }, { select: ["id", "kind", "ref", "level", "userId", "text", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take });
  if (!rows.length) return [];
  const codes = [...new Set(rows.filter((r) => r.kind === "LESSON").map((r) => s(r.ref)))];
  const [users, hidden] = await Promise.all([
    repo.findMany("User", { id: { in: [...new Set(rows.map((r) => s(r.userId)))] } }, { select: ["id", "displayName"] }),
    codes.length ? repo.findMany("LearnLesson", { schoolId, code: { in: codes }, hidden: true }, { select: ["code"] }) : Promise.resolve([] as Row[]),
  ]);
  const files = readLessons().valid;
  return rows.map((r) => ({ id: s(r.id), kind: s(r.kind) as EditKind, ref: s(r.ref), level: Number(r.level), title: r.kind === "LESSON" ? files.get(s(r.ref))?.title ?? s(r.ref) : s(r.ref).split("|").pop() ?? "", text: s(r.text), by: s(users.find((u) => u.id === r.userId)?.displayName), at: new Date(s(r.createdAt)).toISOString(), hidden: hidden.some((h) => h.code === r.ref) }));
}
export async function closeReport(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  const schoolId = adminSchool(actor);
  await repo.updateMany("LearnReport", { id, schoolId }, { status: "DONE", resolvedAt: now });
}

/** Admin: Hide a lesson from students and teachers' lists (never deleted) — or show it again. */
export async function setLessonHidden(repo: Repo, actor: Actor, code: string, hidden: boolean, reason: string | null = null, now = new Date()): Promise<void> {
  const schoolId = adminSchool(actor);
  const f = lessonFile(code);
  if (!f) throw new ValidationError("This lesson is not on the platform.");
  const data = { hidden, hiddenReason: hidden ? s(reason).slice(0, 300) || null : null, hiddenById: hidden ? actor.userId : null, hiddenAt: hidden ? now : null, updatedAt: now };
  const had = await repo.findMany("LearnLesson", { schoolId, code }, { select: ["id"], take: 1 });
  if (had.length) await repo.updateMany("LearnLesson", { id: had[0].id }, data);
  else await repo.create("LearnLesson", { schoolId, code, title: f.title.slice(0, 191), subject: f.subject, goalArea: f.goalArea, subtopic: f.subtopic || null, standards: f.standards, families: f.families, skillNames: f.skillNames, fileHash: f.hash, loadedAt: now, ...data });
  await audit(repo, { actorId: actor.userId, action: hidden ? "learn.hide" : "learn.show", entityType: "LearnLesson", entityId: code, after: { reason: data.hiddenReason }, at: now });
}

/** The hidden lesson codes of a school (one read). */
export async function hiddenCodes(repo: Repo, schoolId: string): Promise<Set<string>> {
  return new Set((await repo.findMany("LearnLesson", { schoolId, hidden: true }, { select: ["code"] })).map((r) => s(r.code)));
}

/** Students never see level words: any text a teacher writes is checked too. */
export function hasLevelWord(x: unknown): string | null {
  const walk = (v: unknown): string | null => {
    if (typeof v === "string") { const m = LEVEL_WORDS.exec(v); return m ? m[0] : null; }
    if (Array.isArray(v)) { for (const y of v) { const r = walk(y); if (r) return r; } return null; }
    if (v && typeof v === "object") { for (const y of Object.values(v)) { const r = walk(y); if (r) return r; } }
    return null;
  };
  return walk(x);
}
