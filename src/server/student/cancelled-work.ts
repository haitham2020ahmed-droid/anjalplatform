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
