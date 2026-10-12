/**
 * ✅ My Work completion: when a student FINISHES a piece of work, it is Done — at once, on the server, once.
 *
 * Root causes this fixes (the student finished and My Work still said "In progress"):
 *   1. a skill was only Completed with ≥ 10 answers AND the target mastery (75 %): a student who finished a whole
 *      practice set (20 questions, "level confirmed", or every question answered) below 75 % stayed In progress;
 *   2. the status was written AFTER the response (a background task): a closed tab or a lost task left it stale,
 *      and a slower earlier refresh could overwrite a newer Completed row;
 *   3. practice was linked to the assignment only by Assignment.skillId: older assignments (skillIds only) and
 *      another grade's copy of the skill (pooled family questions) were never linked, nor was a session opened
 *      before the work was assigned;
 *   4. a skill assigned twice (e.g. MAP and RTI) showed the still-open copy in My Work after the other was done;
 *   5. question sets: a goal set ("20 correct answers finish a part") whose questions ran out before the goal ended
 *      the set without ever completing it, and a set with a deleted/unpublished question could never be finished.
 *
 * Now: the answer transaction that ends the work also writes AssignmentStudent → COMPLETED (guarded by
 * completedAt IS NULL, so a double submit, two tabs or a retry write it once), and recomputeCompletion() backfills
 * rows left behind before this fix (run lazily and boundedly when My Work loads). The adaptive engine — levels,
 * mastery, tiers — is not touched: only the work's status.
 */
import type { Repo, Row } from "../seeding/repo";
import { skillFamilyIds } from "../questions/skill-questions";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const OPEN = ["NOT_STARTED", "IN_PROGRESS", "OVERDUE"];

/**
 * 🎯 The owner's 25-question rule: when a student has answered this many questions of an assigned skill, the work is
 * Done (at once, on the server, once). The work's core result (accuracy shown to the teacher) counts these FIRST
 * answers only; practice after that still trains ability and mastery but never changes the work's status or result.
 */
export const ASSIGNMENT_DONE_AT = 25;

export type Completion = "DONE" | "IN_PROGRESS" | "NOT_STARTED";
/**
 * The three things a student's skill work is judged by, kept SEPARATE everywhere:
 *   completion → Done / In progress / Not started, and "answered x of 25"
 *   accuracy   → % correct of the first 25 answers (null before any answer)
 *   mastery    → the engine's mastery % and band for the skill (not part of this object's counts)
 */
export interface WorkProgress { assignmentId: string; completion: Completion; answered: number; of: number; correct: number; accuracy: number | null }

export const accuracyOf = (correct: number, answered: number): number | null => (answered > 0 ? Math.round((100 * correct) / answered) : null);

/** The work's progress from its AssignmentStudent row (answered/correct may be passed when just computed). */
export function workProgressOf(assignmentId: string, row: Row | null | undefined, core?: { answered: number; correct: number }): WorkProgress {
  const answered = Math.min(ASSIGNMENT_DONE_AT, core?.answered ?? Number(row?.coreAnswered ?? 0));
  const correct = Math.min(answered, core?.correct ?? Number(row?.coreCorrect ?? 0));
  const done = Boolean(row && (d(row.completedAt) || s(row.status) === "COMPLETED"));
  return { assignmentId, completion: done ? "DONE" : answered > 0 || s(row?.status) === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED", answered, of: ASSIGNMENT_DONE_AT, correct, accuracy: accuracyOf(correct, answered) };
}

/**
 * The work's core counts so far: the stored ones, else (a row from before the 25-question rule) the first answers
 * given in the practice sessions linked to it — at most ASSIGNMENT_DONE_AT, oldest first. Two bounded reads.
 */
export async function coreCountsOf(repo: Repo, assignmentId: string, studentId: string, row: Row | null | undefined): Promise<{ answered: number; correct: number }> {
  if (row && row.coreAnswered !== null && row.coreAnswered !== undefined) return { answered: Number(row.coreAnswered), correct: Number(row.coreCorrect ?? 0) };
  const sessions = await repo.findMany("PracticeSession", { assignmentId, studentId, mode: "ADAPTIVE_PRACTICE" }, { select: ["id"] });
  if (!sessions.length) return { answered: 0, correct: 0 };
  const first = await repo.findMany("QuestionAttempt", { sessionId: { in: sessions.map((x) => x.id) } }, { select: ["isCorrect"], orderBy: [{ field: "createdAt", dir: "asc" }, { field: "id", dir: "asc" }], take: ASSIGNMENT_DONE_AT });
  return { answered: first.length, correct: first.filter((a) => Boolean(a.isCorrect)).length };
}

/**
 * Who may open /practice/[skillId] as assigned work. Root causes of "This skill has not been assigned to you" for
 * work that WAS assigned: the old check compared Assignment.skillId === skillId strictly (via a single-skill helper),
 * so (1) another grade's copy of the skill (one family, pooled questions) was refused, (2) an older row listing
 * several skills in skillIds was refused, and (3) the prerequisite the engine itself routes to ("Practise …") was
 * refused. Now: ANY not-deleted assignment of the student whose skill(s) are in the skill's family counts; a
 * prerequisite of such a skill counts too. Work that has not started yet gives its start date (a clear message).
 */
export async function assignedSkillAccess(repo: Repo, studentId: string, skillId: string, now = new Date()): Promise<{ assigned: boolean; startsAt: Date | null }> {
  const rows = await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"] });
  if (!rows.length) return { assigned: false, startsAt: null };
  const [list, family] = await Promise.all([
    repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["skillId", "skillIds", "startAt"] }),
    skillFamilyIds(repo, skillId),
  ]);
  const fam = new Set([skillId, ...family]);
  const skillsOf = (a: Row): string[] => {
    let ids: unknown = a.skillIds;
    if (typeof ids === "string") { try { ids = JSON.parse(ids); } catch { ids = null; } }
    return [...new Set([...(a.skillId ? [s(a.skillId)] : []), ...(Array.isArray(ids) ? ids.map(s) : [])])].filter(Boolean);
  };
  const started = (a: Row) => !(d(a.startAt) && d(a.startAt)! > now);
  const mine = list.filter((a) => skillsOf(a).some((k) => fam.has(k)));
  if (mine.some(started)) return { assigned: true, startsAt: null };
  // a prerequisite of an assigned (started) skill: the engine sends the student there from the assigned practice
  const open = [...new Set(list.filter(started).flatMap(skillsOf))];
  if (open.length && (await repo.count("SkillPrerequisite", { prerequisiteSkillId: { in: [...fam] }, skillId: { in: open } })) > 0) return { assigned: true, startsAt: null };
  const later = mine.map((a) => d(a.startAt)!).sort((x, y) => x.getTime() - y.getTime())[0];
  return { assigned: false, startsAt: later ?? null };
}

/** Practice endings that mean "the student finished this practice" (not a pause, a detour or a time-out). */
export const FINISH_REASONS: ReadonlySet<string> = new Set(["COMPLETED", "LEVEL_CONFIRMED", "ALL_QUESTIONS_ANSWERED", "POOL_EXHAUSTED", "SKILL_FINISHED", "RETRY_LATER"]);
export const isFinishReason = (r: unknown): boolean => FINISH_REASONS.has(s(r));

/** The one skill of an assignment (single-skill, or an older row with exactly one skill in skillIds). */
export function skillOfAssignment(a: Row): string | null {
  if (a.skillId) return s(a.skillId);
  let ids: unknown = a.skillIds;
  if (typeof ids === "string") { try { ids = JSON.parse(ids); } catch { ids = null; } }
  return Array.isArray(ids) && ids.length === 1 ? s(ids[0]) : null;
}

/**
 * The student's OPEN skill assignments for this skill (or another grade's copy of it, same family), started, the
 * exact skill first, then earliest due. The first one is linked to a new practice session; all of them are
 * completed when the practice is finished (My Work shows one row per skill).
 */
export async function openWorkFor(repo: Repo, studentId: string, skillId: string, now = new Date()): Promise<string[]> {
  const rows = await repo.findMany("AssignmentStudent", { studentId, status: { in: OPEN }, completedAt: null }, { select: ["assignmentId"] });
  if (!rows.length) return [];
  const [list, family] = await Promise.all([
    repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["id", "skillId", "skillIds", "dueAt", "startAt", "createdAt", "assessmentId"] }),
    skillFamilyIds(repo, skillId),
  ]);
  const fam = new Set([skillId, ...family]);
  return list
    .filter((a) => !a.assessmentId && fam.has(s(skillOfAssignment(a))) && !(d(a.startAt) && d(a.startAt)! > now))
    .sort((x, y) => Number(skillOfAssignment(y) === skillId) - Number(skillOfAssignment(x) === skillId)
      || (d(x.dueAt)?.getTime() ?? Infinity) - (d(y.dueAt)?.getTime() ?? Infinity)
      || (d(x.createdAt)?.getTime() ?? 0) - (d(y.createdAt)?.getTime() ?? 0))
    .map((a) => s(a.id));
}

/**
 * Practising again after the work is Done (no open work for the skill): the student's latest assignment of this
 * skill (family) with the teacher's own questions, so the picks — and the no-repeat rules inside them — still apply.
 * Null when there is none (the platform chooses from the whole pool).
 */
export async function lastPickedWorkFor(repo: Repo, studentId: string, skillId: string, now = new Date()): Promise<string | null> {
  const rows = await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"], take: 1000 });
  if (!rows.length) return null;
  const [list, family] = await Promise.all([
    repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["id", "skillId", "skillIds", "startAt", "createdAt", "assessmentId", "questionIds"] }),
    skillFamilyIds(repo, skillId),
  ]);
  const fam = new Set([skillId, ...family]);
  const hasPicks = (v: unknown) => { let x = v; if (typeof x === "string") { try { x = JSON.parse(x); } catch { x = null; } } return Array.isArray(x) && x.length > 0; };
  const best = list
    .filter((a) => !a.assessmentId && hasPicks(a.questionIds) && fam.has(s(skillOfAssignment(a))) && !(d(a.startAt) && d(a.startAt)! > now))
    .sort((x, y) => (d(y.createdAt)?.getTime() ?? 0) - (d(x.createdAt)?.getTime() ?? 0))[0];
  return best ? s(best.id) : null;
}

/** Marks the student's rows of these assignments Done (idempotent: only rows not completed yet are written). */
export async function markDone(repo: Repo, assignmentIds: readonly string[], studentId: string, at: Date): Promise<number> {
  const ids = [...new Set(assignmentIds.filter(Boolean))];
  if (!ids.length) return 0;
  return repo.updateMany("AssignmentStudent", { assignmentId: { in: ids }, studentId, completedAt: null }, { status: "COMPLETED", progress: 1, completedAt: at });
}

/**
 * One answer counted toward the work's core result (the first ASSIGNMENT_DONE_AT answers), in the answer's own
 * transaction. Guarded by the stored count (a double submit or a second tab is counted once); at the 25th answer the
 * work becomes Done (completedAt IS NULL guard: written once). Returns the new counts, or null when not counted.
 */
export async function countCoreAnswer(tx: Repo, assignmentId: string, studentId: string, prev: { answered: number; correct: number; stored: number | null; done: boolean }, correct: boolean, at: Date): Promise<{ answered: number; correct: number; justDone: boolean } | null> {
  if (prev.answered >= ASSIGNMENT_DONE_AT) {
    // a row from before the rule that already had 25 answers: its first 25 are its result, and it is Done now
    if (prev.done && prev.stored !== null) return null;
    if (prev.stored === null) await tx.updateMany("AssignmentStudent", { assignmentId, studentId, coreAnswered: null }, { coreAnswered: ASSIGNMENT_DONE_AT, coreCorrect: Math.min(prev.correct, ASSIGNMENT_DONE_AT) });
    const n = await markDone(tx, [assignmentId], studentId, at);
    return n > 0 ? { answered: ASSIGNMENT_DONE_AT, correct: prev.correct, justDone: true } : null;
  }
  const answered = prev.answered + 1, right = prev.correct + (correct ? 1 : 0);
  const n = await tx.updateMany("AssignmentStudent", { assignmentId, studentId, coreAnswered: prev.stored }, { coreAnswered: answered, coreCorrect: right });
  if (n !== 1) return null;
  // the 25th answer: Done now (or already Done earlier — e.g. the target mastery was reached — and stays Done)
  const justDone = answered >= ASSIGNMENT_DONE_AT;
  if (justDone) await markDone(tx, [assignmentId], studentId, at);
  return { answered, correct: right, justDone };
}

/** Per-process memo so the backfill runs at most once per student every few minutes (My Work loads often). */
const lastRun = new Map<string, number>();
export const RECOMPUTE_EVERY_MS = 5 * 60_000;
/** At most this many open rows are looked at in one backfill. */
export const RECOMPUTE_LIMIT = 500;

/**
 * Backfill: open AssignmentStudent rows whose work was in fact finished become COMPLETED.
 *   skill work      → a practice session of it (linked, or for the same skill family and started after the work was
 *                     assigned) ended with a finishing reason
 *   question sets   → the set's session ended (all answered, the goal's questions ran out, …) or reached its goal,
 *                     or every question still available was answered
 * Bounded: at most RECOMPUTE_LIMIT open rows; reads are by assignment ids and (with a student) that student's rows.
 * Without a studentId it backfills every school's open rows (an admin script), page by page up to the limit.
 * Returns how many rows were completed.
 */
export async function recomputeCompletion(repo: Repo, studentId?: string, opts: { now?: Date; limit?: number; force?: boolean } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  if (studentId && !opts.force) {
    const at = lastRun.get(studentId);
    if (at !== undefined && Date.now() - at < RECOMPUTE_EVERY_MS && Date.now() >= at) return 0;
    if (lastRun.size > 50_000) lastRun.clear();
    lastRun.set(studentId, Date.now());
  }
  const limit = Math.max(1, Math.min(5000, opts.limit ?? RECOMPUTE_LIMIT));
  const open = await repo.findMany("AssignmentStudent", { ...(studentId ? { studentId } : {}), status: { in: OPEN }, completedAt: null }, { select: ["assignmentId", "studentId"], take: limit });
  if (!open.length) return 0;
  const assignments = await repo.findMany("Assignment", { id: { in: [...new Set(open.map((r) => s(r.assignmentId)))] }, deletedAt: null }, { select: ["id", "skillId", "skillIds", "assessmentId", "createdAt", "startAt"] });
  return completeFinished(repo, open, assignments, now);
}

/**
 * My Work's lazy backfill: the student's own rows and assignments (already read by the page), at most once per
 * student every RECOMPUTE_EVERY_MS in this process. Returns how many rows were completed.
 */
export async function backfillForStudent(repo: Repo, studentId: string, rows: Row[], assignments: Row[], now = new Date()): Promise<number> {
  const at = lastRun.get(studentId);
  if (at !== undefined && Date.now() - at < RECOMPUTE_EVERY_MS && Date.now() >= at) return 0;
  if (!rows.some((r) => OPEN.includes(s(r.status)) && !d(r.completedAt))) return 0;
  if (lastRun.size > 50_000) lastRun.clear();
  lastRun.set(studentId, Date.now());
  return completeFinished(repo, rows.slice(0, RECOMPUTE_LIMIT), assignments, now);
}

/** Forgets when the backfill last ran (tests). */
export const resetBackfillMemo = (): void => lastRun.clear();

/** The backfill's work for rows already read (My Work passes its own rows: no second read). */
export async function completeFinished(repo: Repo, open: Row[], assignments: Row[], now = new Date()): Promise<number> {
  const rows = open.filter((r) => OPEN.includes(s(r.status ?? "NOT_STARTED")) && !d(r.completedAt));
  if (!rows.length || !assignments.length) return 0;
  const byId = new Map(assignments.filter((a) => !a.deletedAt).map((a) => [s(a.id), a]));
  const mine = rows.filter((r) => byId.has(s(r.assignmentId)));
  if (!mine.length) return 0;
  const aIds = [...new Set(mine.map((r) => s(r.assignmentId)))];
  const students = [...new Set(mine.map((r) => s(r.studentId)))];
  const skillWork = mine.filter((r) => skillOfAssignment(byId.get(s(r.assignmentId))!) && !byId.get(s(r.assignmentId))!.assessmentId);
  const skillIds = [...new Set(skillWork.map((r) => skillOfAssignment(byId.get(s(r.assignmentId))!)!))];
  const [linked, unlinked] = await Promise.all([
    repo.findMany("PracticeSession", { assignmentId: { in: aIds }, studentId: { in: students } }, { select: ["assignmentId", "studentId", "skillId", "mode", "endedAt", "endReason", "goalReachedAt", "questionCount", "assessmentId"] }),
    // practice of the same skill that was not linked (opened before the work was assigned, or from another page)
    skillWork.length && students.length <= 50 ? repo.findMany("PracticeSession", { studentId: { in: students }, assignmentId: null, mode: "ADAPTIVE_PRACTICE", endedAt: { not: null } }, { select: ["studentId", "skillId", "startedAt", "endedAt", "endReason"], take: 2000 }) : Promise.resolve([] as Row[]),
  ]);
  // families of the assigned skills (memoised per skill): a session on another grade's copy counts too
  const famOf = new Map<string, Set<string>>();
  for (const k of skillIds) famOf.set(k, new Set([k, ...(await skillFamilyIds(repo, k))]));
  // fixed question sets whose session is still open: the questions still available (a deleted or unpublished one
  // can never be answered)
  const setIds = [...new Set(mine.map((r) => byId.get(s(r.assignmentId))!).filter((a) => a.assessmentId).map((a) => s(a.assessmentId)))];
  const openSets = linked.filter((x) => x.mode === "TEACHER_QUIZ" && !x.endedAt && Number(x.questionCount ?? 0) > 0);
  const avail = new Map<string, number>();
  const kinds = new Map<string, Row>();
  if (setIds.length) {
    const sets = await repo.findMany("Assessment", { id: { in: setIds } }, { select: ["id", "type", "isAdaptive", "targetCorrect"] });
    for (const x of sets) kinds.set(s(x.id), x);
    const fixed = [...new Set(openSets.map((x) => s(byId.get(s(x.assignmentId))?.assessmentId)))].filter((id) => id && !kinds.get(id)?.isAdaptive && s(kinds.get(id)?.type) !== "DIAGNOSTIC");
    if (fixed.length) {
      const aq = await repo.findMany("AssessmentQuestion", { assessmentId: { in: fixed } }, { select: ["assessmentId", "questionId"], take: 20_000 });
      const ok = aq.length ? new Set((await repo.findMany("Question", { id: { in: [...new Set(aq.map((x) => s(x.questionId)))] }, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })).map((q) => s(q.id))) : new Set<string>();
      for (const x of aq) if (ok.has(s(x.questionId))) avail.set(s(x.assessmentId), (avail.get(s(x.assessmentId)) ?? 0) + 1);
      for (const id of fixed) if (!avail.has(id)) avail.set(id, 0);
    }
  }
  let done = 0;
  for (const r of mine) {
    const a = byId.get(s(r.assignmentId))!;
    const sid = s(r.studentId);
    const own = linked.filter((x) => s(x.assignmentId) === s(a.id) && s(x.studentId) === sid);
    let at: Date | null = null;
    if (a.assessmentId) {
      const set = kinds.get(s(a.assessmentId));
      for (const x of own) {
        if (x.mode !== "TEACHER_QUIZ") continue;
        if (x.goalReachedAt) at = d(x.goalReachedAt);
        else if (x.endedAt && (Number(set?.targetCorrect) > 0 || s(x.endReason) === "COMPLETED")) at = d(x.endedAt);
        else if (!x.endedAt && avail.has(s(a.assessmentId)) && Number(x.questionCount ?? 0) >= avail.get(s(a.assessmentId))! && avail.get(s(a.assessmentId))! > 0) at = now;
        if (at) break;
      }
    } else {
      const k = skillOfAssignment(a);
      if (!k) continue;
      const fam = famOf.get(k) ?? new Set([k]);
      const since = d(a.startAt) ?? d(a.createdAt);
      const fin = [...own, ...unlinked.filter((x) => s(x.studentId) === sid && fam.has(s(x.skillId)) && (!since || (d(x.startedAt)?.getTime() ?? 0) >= since.getTime()))]
        .filter((x) => x.endedAt && isFinishReason(x.endReason))
        .sort((p, q) => (d(p.endedAt)?.getTime() ?? 0) - (d(q.endedAt)?.getTime() ?? 0))[0];
      if (fin) at = d(fin.endedAt);
      // the 25-question rule for work answered before it existed: 25+ answers in its linked practice → Done
      else if (Number(r.coreAnswered ?? 0) >= ASSIGNMENT_DONE_AT || own.filter((x) => x.mode === "ADAPTIVE_PRACTICE").reduce((n, x) => n + Number(x.questionCount ?? 0), 0) >= ASSIGNMENT_DONE_AT) at = now;
    }
    if (at) done += await markDone(repo, [s(a.id)], sid, at);
  }
  return done;
}
