/**
 * 🔄 Admin "Reset placement" (owner, 4 Nov 2026): an admin lets many students take the ReadRise placement again at once
 * — a whole grade, a class, chosen students, or only the "doubtful" results the platform finds:
 *   - placed before the placement fix of 30 Oct 2026 (a weak reader could reach 1400 on lucky 2-of-3 answers);
 *   - the level is more than 250 from the student's latest MAP Lexile;
 *   - the student's own readings say the level is too high (3+ counted first tries, average under 60%).
 * A reset is a retake permission (the same marker a teacher's retake uses, tagged "(admin reset)"):
 *   - the level stays until the new test ends (the student keeps reading meanwhile);
 *   - the new test starts from the MAP Lexile / grade start (not from the old result);
 *   - its result replaces the level AND the year's start level (the old start was wrong), see placement.ts;
 *   - nothing is deleted (readings, scores, words, the level history stay);
 *   - it never uses up the teacher's "once per term" retake.
 * Admins only (owner decision). A student never placed already takes the test: nothing to reset.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { RETAKE_REASON, recordLevelChange, s, toDate } from "./engine";
import { countedTries, isUnreliableRun, rapidRead } from "./first-try";

/** The tag in the RRLevelChange reason of an admin reset (placement.ts reads it). */
export const ADMIN_RESET_TAG = "(admin reset)";
/** Placements finished before this date used the old pass bar (2 of 3 up to 1400). */
export const PLACEMENT_FIX_DATE = new Date("2026-10-30T00:00:00+03:00");
export const DOUBT = { mapGap: 250, minReads: 3, lowAverage: 60 } as const;

export interface ResetFilter { gradeId?: string; classId?: string; q?: string; doubtful?: boolean }
export interface ResetCandidate {
  studentId: string; name: string; grade: string; classes: string; level: number | null; placedAt: string | null;
  /** plain-English reasons the result looks doubtful (empty when none) */
  reasons: string[];
  /** a reset is already waiting (or a test is open): nothing to do */
  pending: boolean;
}

function admin(actor: Actor): string {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins can reset placements.");
  if (!actor.schoolId) throw new ValidationError("Open this page from a school account.");
  return actor.schoolId;
}

const validDone = (r: Row) => !!r.completedAt && r.result !== null && r.result !== undefined;

/** The students of the filter with their level and the doubtful reasons (placed students only). */
export async function resetCandidates(repo: Repo, actor: Actor, f: ResetFilter = {}): Promise<ResetCandidate[]> {
  const schoolId = admin(actor);
  let students = (await repo.findMany("Student", { schoolId, deletedAt: null }, { select: ["id", "userId", "gradeId"] }));
  if (f.gradeId) students = students.filter((x) => s(x.gradeId) === f.gradeId);
  const members = await repo.findMany("ClassMembership", { studentId: { in: students.map((x) => s(x.id)) } }, { select: ["classId", "studentId", "leftAt"] });
  const live = members.filter((m) => !m.leftAt);
  if (f.classId) { const inClass = new Set(live.filter((m) => s(m.classId) === f.classId).map((m) => s(m.studentId))); students = students.filter((x) => inClass.has(s(x.id))); }
  if (!students.length) return [];
  const ids = students.map((x) => s(x.id));
  const [users, grades, classes, rrs, placements, changes, maps, runs] = await Promise.all([
    repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }),
    repo.findMany("Grade", { schoolId }, { select: ["id", "name", "level"] }),
    repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name"] }),
    repo.findMany("RRStudent", { studentId: { in: ids } }),
    repo.findMany("RRPlacement", { studentId: { in: ids } }, { select: ["studentId", "result", "startedAt", "completedAt"] }),
    repo.findMany("RRLevelChange", { studentId: { in: ids } }, { select: ["studentId", "reason", "createdAt"] }),
    repo.findMany("MapResult", { studentId: { in: ids }, lexile: { not: null } }, { select: ["studentId", "lexile", "testDate"] }),
    repo.findMany("RRRun", { studentId: { in: ids }, completedAt: { not: null } }, { select: ["studentId", "articleId", "band", "score", "firstTry", "stretch", "completedAt", "startedAt", "unreliable", "readSeconds"] }),
  ]);
  const uname = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const gname = new Map(grades.map((g) => [s(g.id), s(g.name) || `Grade ${s(g.level)}`]));
  const cname = new Map(classes.map((c) => [s(c.id), s(c.name)]));
  const rrOf = new Map(rrs.map((r) => [s(r.studentId), r]));
  const group = <T extends Row>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) { const k = s(r.studentId); (m.get(k) ?? m.set(k, []).get(k)!).push(r); } return m; };
  const pBy = group(placements), cBy = group(changes), mBy = group(maps), rBy = group(runs), memBy = group(live);
  const q = s(f.q).trim().toLowerCase();
  const out: ResetCandidate[] = [];
  for (const st of students) {
    const id = s(st.id), name = uname.get(s(st.userId)) ?? "";
    if (q && !name.toLowerCase().includes(q)) continue;
    const ps = (pBy.get(id) ?? []).sort((a, b) => toDate(b.startedAt).getTime() - toDate(a.startedAt).getTime());
    const last = ps.find(validDone) ?? null;
    const open = ps.some((p) => !p.completedAt);
    const rr = rrOf.get(id);
    const placed = !!last || s(rr?.source) === "PLACEMENT" || s(rr?.source) === "TEACHER";
    if (!placed) continue; // never placed: the student takes the test anyway
    const doneAt = last ? toDate(last.completedAt).getTime() : 0;
    const pending = open || (cBy.get(id) ?? []).some((c) => s(c.reason).startsWith(RETAKE_REASON) && toDate(c.createdAt).getTime() > doneAt);
    const level = rr ? Number(rr.level) : last ? Number(last.result) : null;
    const reasons: string[] = [];
    if (last && doneAt < PLACEMENT_FIX_DATE.getTime() && s(rr?.source) !== "TEACHER") reasons.push(`Placed on ${toDate(last.completedAt).toISOString().slice(0, 10)}, before the placement fix (30 Oct 2026)`);
    const map = (mBy.get(id) ?? []).sort((a, b) => toDate(b.testDate).getTime() - toDate(a.testDate).getTime())[0];
    if (map && level !== null && Math.abs(level - Number(map.lexile)) > DOUBT.mapGap) reasons.push(`Level ${level} is ${Math.abs(level - Number(map.lexile))} from the MAP Lexile ${Number(map.lexile)}`);
    const reads = countedTries((rBy.get(id) ?? []).filter((r) => !isUnreliableRun(r) && !rapidRead(r) && r.score !== null && r.score !== undefined));
    if (reads.length >= DOUBT.minReads) {
      const avg = Math.round(reads.reduce((n, r) => n + Number(r.score), 0) / reads.length);
      if (avg < DOUBT.lowAverage) reasons.push(`Reads at ${avg}% on average (${reads.length} readings) — the level looks too high`);
    }
    if (f.doubtful && !reasons.length) continue;
    out.push({
      studentId: id, name, grade: gname.get(s(st.gradeId)) ?? "", reasons, pending, level,
      classes: [...new Set((memBy.get(id) ?? []).map((m) => cname.get(s(m.classId))).filter(Boolean))].join(", "),
      placedAt: last ? toDate(last.completedAt).toISOString().slice(0, 10) : null,
    });
  }
  return out.sort((a, b) => a.grade.localeCompare(b.grade) || a.classes.localeCompare(b.classes) || a.name.localeCompare(b.name));
}

export interface ResetResult { reset: number; restarted: number; skipped: number }

/** Lets the chosen students take the placement again (see the file-top comment). */
export async function adminResetPlacements(repo: Repo, actor: Actor, studentIds: readonly string[], reason = "", now = new Date()): Promise<ResetResult> {
  const schoolId = admin(actor);
  const ids = [...new Set(studentIds.map(s).filter(Boolean))];
  if (!ids.length) throw new ValidationError("Choose at least one student.");
  if (ids.length > 2000) throw new ValidationError("Too many students at once (2000 at most).");
  const why = reason.trim().slice(0, 150);
  const mine = new Set((await repo.findMany("Student", { id: { in: ids }, schoolId, deletedAt: null }, { select: ["id"] })).map((x) => s(x.id)));
  const res: ResetResult = { reset: 0, restarted: 0, skipped: 0 };
  for (const id of ids) {
    if (!mine.has(id)) { res.skipped++; continue; }
    const ps = (await repo.findMany("RRPlacement", { studentId: id })).sort((a, b) => toDate(b.startedAt).getTime() - toDate(a.startedAt).getTime());
    const open = ps.find((p) => !p.completedAt);
    if (open) { await repo.updateMany("RRPlacement", { id: s(open.id) }, { steps: [], startedAt: now }); res.restarted++; continue; }
    const last = ps.find(validDone);
    const rr = await repo.findUnique("RRStudent", { studentId: id });
    if (!last && s(rr?.source) !== "TEACHER") { res.skipped++; continue; }
    const doneAt = last ? toDate(last.completedAt).getTime() : 0;
    const waiting = (await repo.findMany("RRLevelChange", { studentId: id }, { select: ["reason", "createdAt"] })).some((c) => s(c.reason).startsWith(RETAKE_REASON) && toDate(c.createdAt).getTime() > doneAt);
    if (waiting) { res.skipped++; continue; }
    const level = rr ? Number(rr.level) : Number(last!.result);
    await recordLevelChange(repo, { studentId: id, schoolId, from: level, to: level, reason: `${RETAKE_REASON} ${ADMIN_RESET_TAG}${why ? `: ${why}` : ""}`, now });
    res.reset++;
  }
  return res;
}
