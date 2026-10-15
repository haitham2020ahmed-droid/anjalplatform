/**
 * 🚫 Cancelled work, student side ("Assigned", src/server/teacher/assigned.ts): what a teacher cancelled — for
 * everyone, or for this one student — is hidden from My Work, the home badge, the menu numbers and My Tests' to-do
 * list at once. Nothing is deleted (answers and results stay); an Undo brings it back.
 *
 * Each AssignmentCancel row carries the My Work row keys it hides (worked out when it was cancelled), so the filter
 * is one bounded read of the school's active cancels — kept in memory while nothing is cancelled or restored (write
 * counter) and for 10 s across processes — plus, only when needed, one read for the two kinds whose My Work key is
 * not unique to one assignment (a ReadRise article given to several classes; a Learn lesson given twice).
 * A database without the table (an update not pushed yet) hides nothing.
 */
import type { Repo, Row } from "../seeding/repo";
import { modelVersion } from "../cache/bank-version";
import { TtlCache } from "../lib/ttl-cache";
import { safeIfBehind } from "../db/schema-errors";

const s = (v: unknown) => String(v ?? "");
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };

const CACHE_MS = 10_000;
const caches = new WeakMap<object, TtlCache<Row[]>>();

/** The school's active (not restored) cancels — newest first, bounded. */
export async function activeCancels(repo: Repo, schoolId: string | null | undefined): Promise<Row[]> {
  if (!schoolId) return [];
  let c = caches.get(repo);
  if (!c) caches.set(repo, (c = new TtlCache<Row[]>(CACHE_MS, 500)));
  return c.getOrLoad(`${schoolId}|${modelVersion("AssignmentCancel")}`, () => safeIfBehind("assigned.cancels",
    () => repo.findMany("AssignmentCancel", { schoolId, restoredAt: null }, { select: ["id", "kind", "refId", "classId", "studentId", "keys"], orderBy: [{ field: "cancelledAt", dir: "desc" }], take: 5000 }), [] as Row[]));
}

/** The My Work row keys hidden for this student (a skill / test set's own Assignment id is one of them). */
export async function hiddenWorkKeys(repo: Repo, studentId: string, schoolId: string | null | undefined): Promise<Set<string>> {
  const rows = (await activeCancels(repo, schoolId)).filter((r) => !r.studentId || s(r.studentId) === studentId);
  const out = new Set<string>();
  if (!rows.length) return out;
  const readrise = rows.filter((r) => r.kind === "READRISE" && r.classId);
  const learn = rows.filter((r) => r.kind === "LEARN" || r.kind === "WORDS");
  const [classIds, assignees] = await Promise.all([
    readrise.length ? repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }).then((m) => new Set(m.map((x) => s(x.classId)))) : Promise.resolve(new Set<string>()),
    learn.length ? safeIfBehind("assigned.learn", () => repo.findMany("LearnAssignee", { studentId }, { select: ["assignId", "kind", "ref"], take: 500 }), [] as Row[]) : Promise.resolve([] as Row[]),
  ]);
  const learnCancelled = new Set(learn.map((r) => s(r.refId)));
  for (const r of rows) {
    // a ReadRise article: only the class it was cancelled for (the same article may be open in another class)
    if (r.kind === "READRISE" && r.classId && !classIds.has(s(r.classId))) continue;
    if (r.kind === "LEARN" || r.kind === "WORDS") {
      // the same lesson / words given again (another, active assignment): still in My Work
      for (const k of json<string[]>(r.keys, [])) {
        const mine = assignees.filter((a) => `learn:${s(a.kind)}:${s(a.ref)}` === k);
        if (mine.length && mine.every((a) => learnCancelled.has(s(a.assignId)))) out.add(k);
      }
      continue;
    }
    for (const k of json<string[]>(r.keys, [])) out.add(s(k));
  }
  return out;
}

/**
 * Is this assignment (a skill, a set, a test set, a plan's place) cancelled for this student? The quiz player, the
 * home's "Continue" and the plan pages ask (owner r68: a cancel is honoured everywhere the student sees work). One
 * cached read; nothing when nothing is cancelled.
 */
export async function isCancelledForStudent(repo: Repo, studentId: string, schoolId: string | null | undefined, assignmentId: string): Promise<boolean> {
  if (!assignmentId || !schoolId) return false;
  const rows = await activeCancels(repo, schoolId);
  if (!rows.length) return false;
  const hidden = await hiddenWorkKeys(repo, studentId, schoolId);
  return hidden.has(assignmentId) || hidden.has(`test:${assignmentId}`);
}

/**
 * A plan's place is cancelled for the student: the student's own set(s) of it are hidden, or every set of the place is
 * (a Curriculum Map place the student has not opened yet, cancelled for everyone).
 */
export const placeCancelled = (aids: readonly string[], mine: readonly string[], hidden: Set<string>): boolean =>
  hidden.size > 0 && ((mine.length > 0 && mine.every((a) => hidden.has(a))) || (aids.length > 0 && aids.every((a) => hidden.has(a))));

/** Rows of My Work (or any list keyed the same way) without the cancelled ones. */
export function withoutCancelled<T extends { assignmentId: string }>(rows: T[], hidden: Set<string>): T[] {
  return hidden.size ? rows.filter((r) => !hidden.has(r.assignmentId)) : rows;
}

// ------------------------------------------------------------------ r78: ONE rule for "is this assignment live?"

/**
 * r78 (owner: "cancelled on Assigned = gone EVERYWHERE"). An Assignment row is live when BOTH flags say so:
 *   1. the database flag: `deletedAt` is null (a hard cancel: the old Cancel button, a withdrawn plan's sections) —
 *      every read puts it in its `where` through liveAssignmentWhere();
 *   2. the soft cancel of the Assigned page (AssignmentCancel, not restored): for everyone, or for one student — the
 *      row's own id among the cancel's keys (a skill / set / progress check, a test's set, a plan's place), its test
 *      (TEST) or its plan (PLAN: also the places a student opens AFTER the cancel, by curriculumPlanId).
 * Answers and stars stay in the database; only the assignment is no longer listed or counted.
 */
export function liveAssignmentWhere<W extends Record<string, unknown>>(where: W = {} as W): W & { deletedAt: null } {
  return { ...where, deletedAt: null };
}

export interface CancelIndex {
  /** nothing is cancelled in the school (the common case: callers skip all filtering) */
  empty: boolean;
  /** is this Assignment row (id, testId?, curriculumPlanId?, deletedAt?) live — for everyone, or for this student? */
  live(a: Row, studentId?: string | null): boolean;
  /** is this assigned thing of another kind (RESPOND, WRITING, NAFS_PRACTICE …: the Assigned kind + its row id) live? */
  liveRef(kind: string, refId: string, studentId?: string | null): boolean;
}

interface Bucket { ids: Set<string>; tests: Set<string>; plans: Set<string> }
const bucket = (): Bucket => ({ ids: new Set(), tests: new Set(), plans: new Set() });
const NOTHING: CancelIndex = { empty: true, live: (a) => !a.deletedAt, liveRef: () => true };
const indexes = new WeakMap<Row[], CancelIndex>();

/** Pure: the cancel rows → the index (assignment ids are the keys without a ":" prefix). */
export function cancelIndexOf(cancels: readonly Row[]): CancelIndex {
  if (!cancels.length) return NOTHING;
  const all = bucket(), one = new Map<string, Bucket>();
  for (const c of cancels) {
    const b = c.studentId ? (one.get(s(c.studentId)) ?? one.set(s(c.studentId), bucket()).get(s(c.studentId))!) : all;
    for (const k of json<unknown[]>(c.keys, [])) { const key = s(k); if (key && !key.includes(":")) b.ids.add(key); }
    if (c.kind === "SKILL" || c.kind === "PROGRESS_CHECK") b.ids.add(s(c.refId));
    if (c.kind === "TEST") b.tests.add(s(c.refId));
    if (c.kind === "PLAN") b.plans.add(s(c.refId));
  }
  const refs = new Set(cancels.map((c) => `${s(c.kind)}|${s(c.refId)}|${s(c.studentId)}`));
  const hit = (b: Bucket | undefined, a: Row) => Boolean(b && (b.ids.has(s(a.id)) || (a.testId && b.tests.has(s(a.testId))) || (a.curriculumPlanId && b.plans.has(s(a.curriculumPlanId)))));
  return {
    empty: false,
    live: (a, sid) => !a.deletedAt && !hit(all, a) && !(sid && hit(one.get(s(sid)), a)),
    liveRef: (kind, refId, sid) => !refs.has(`${kind}|${refId}|`) && !(sid && refs.has(`${kind}|${refId}|${s(sid)}`)),
  };
}

/** The school's cancel index (one cached read, shared with My Work). */
export async function cancelIndex(repo: Repo, schoolId: string | null | undefined): Promise<CancelIndex> {
  const rows = await activeCancels(repo, schoolId).catch(() => [] as Row[]);
  if (!rows.length) return NOTHING;
  let ix = indexes.get(rows);
  if (!ix) indexes.set(rows, (ix = cancelIndexOf(rows)));
  return ix;
}

/** The cancel index of the school of these students (one small read when the caller has no school id). */
export async function cancelIndexForStudents(repo: Repo, studentIds: readonly string[], schoolId?: string | null): Promise<CancelIndex> {
  let school = schoolId ?? null;
  if (!school && studentIds.length) school = s((await repo.findUnique("Student", { id: studentIds[0] }))?.schoolId) || null;
  return cancelIndex(repo, school);
}

/**
 * Links (assignmentId, studentId) of live assignments only: `byId` holds the Assignment rows read (a link whose row is
 * missing — deleted, or left out by liveAssignmentWhere — is dropped too).
 */
export function liveLinks<T extends Row>(links: readonly T[], byId: ReadonlyMap<string, Row>, ix: CancelIndex): T[] {
  return links.filter((l) => { const a = byId.get(s(l.assignmentId)); return Boolean(a) && ix.live(a!, s(l.studentId)); });
}
