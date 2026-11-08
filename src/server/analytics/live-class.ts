/**
 * 🟢 The class right now (Nov 2026, IXL "Live Classroom"): for a lab lesson — who is working, who has stopped, who needs
 * help now, on which skill, and how much each student did today. Read only, and light on purpose (the page refreshes
 * itself every 20 seconds while it is open and visible):
 *   - answers of the class since Riyadh midnight (QuestionAttempt + NAFS practice), only the columns used;
 *   - the open practice sessions served in the last 15 minutes (the question on the screen now).
 * Status of each student (the first that fits):
 *   HELP     the last 3 answers (in the last 15 minutes, careful ones) are all wrong   → 🆘 go to them
 *   WORKING  answered or got a new question in the last 3 minutes                       → ✅
 *   IDLE     active in the last 15 minutes, nothing in the last 3                        → ⏸️ stopped
 *   AWAY     nothing in the last 15 minutes                                               → ⚪ not on now
 * GUESSING (a flag, not a status): 3 or more of the last 5 answers were rapid guesses (⚡).
 * Live games are never counted. Access: a class the actor can read.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { skillKeyIndex } from "../skills/status";
import { isRapidGuess } from "../practice/guessing";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const ms = (v: unknown) => (v ? new Date(v instanceof Date ? v.toISOString() : s(v)).getTime() : 0);
const MIN = 60_000;
const RIYADH = 3 * 3_600_000;
export const WORKING_MIN = 3;
export const ACTIVE_MIN = 15;
export const HELP_WRONG_IN_A_ROW = 3;
export const REFRESH_SECONDS = 20;

export type LiveStatus = "HELP" | "WORKING" | "IDLE" | "AWAY";
export interface LiveStudent {
  id: string; name: string; status: LiveStatus; guessing: boolean;
  /** the skill on the screen now, or of the last answer */
  skill: string | null;
  /** minutes since the last answer or question (null: nothing today) */
  minutesAgo: number | null;
  today: { answered: number; correct: number; accuracy: number | null };
  /** the last answers today, oldest → newest (true = right), at most 8 */
  streak: boolean[];
}
export interface LiveClass {
  classId: string; className: string; at: string; refreshSeconds: number;
  counts: Record<LiveStatus, number>;
  students: LiveStudent[];
  today: { answered: number; accuracy: number | null; active: number };
}

/** Riyadh midnight of `now`, as a UTC instant. */
export function riyadhMidnight(now: number): number {
  const d = new Date(now + RIYADH);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - RIYADH;
}

/** The status rule (pure): answers newest LAST, `servedAt` = the question on the screen now (0 = none). */
export function liveStatus(answers: readonly { at: number; correct: boolean; rapid: boolean }[], servedAt: number, now: number): { status: LiveStatus; guessing: boolean; lastAt: number } {
  const lastAt = Math.max(answers.length ? answers[answers.length - 1].at : 0, servedAt);
  const recent = answers.filter((a) => a.at >= now - ACTIVE_MIN * MIN);
  const careful = recent.filter((a) => !a.rapid);
  const last = careful.slice(-HELP_WRONG_IN_A_ROW);
  const guessing = recent.slice(-5).filter((a) => a.rapid).length >= 3;
  if (last.length === HELP_WRONG_IN_A_ROW && last.every((a) => !a.correct) && lastAt >= now - ACTIVE_MIN * MIN) return { status: "HELP", guessing, lastAt };
  if (lastAt && lastAt >= now - WORKING_MIN * MIN) return { status: "WORKING", guessing, lastAt };
  if (lastAt && lastAt >= now - ACTIVE_MIN * MIN) return { status: "IDLE", guessing, lastAt };
  return { status: "AWAY", guessing, lastAt };
}

const ORDER: Record<LiveStatus, number> = { HELP: 0, IDLE: 1, WORKING: 2, AWAY: 3 };

export async function liveClass(repo: Repo, actor: Actor, classId: string, nowD = new Date()): Promise<LiveClass> {
  assertCan(actor, "reports:read");
  const klass = (await readableClasses(repo, actor)).find((c) => s(c.id) === s(classId));
  if (!klass) throw new ForbiddenError("Class not found.");
  const now = nowD.getTime();
  const ids = await classMembers(repo, s(classId));
  const since = new Date(riyadhMidnight(now));
  const [names, qa, nafs, open, ix] = await Promise.all([
    studentNames(repo, ids),
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "skillId", "isCorrect", "rapidGuess", "createdAt", "source"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("NafsPracticeAnswer", { studentId: { in: ids }, at: { gte: since } }, { select: ["studentId", "questionId", "correct", "ms", "at"] }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("PracticeSession", { studentId: { in: ids }, endedAt: null, currentServedAt: { gte: new Date(now - ACTIVE_MIN * MIN) } }, { select: ["studentId", "skillId", "currentServedAt"] }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
    skillKeyIndex(repo, s(klass.schoolId) || s(actor.schoolId)),
  ]);
  const skillName = (id: string) => (id ? ix.nameOf.get(ix.keyOf.get(id) ?? "") ?? null : null);
  type A = { at: number; correct: boolean; rapid: boolean; skillId: string };
  const by = new Map<string, A[]>();
  const push = (sid: string, a: A) => { const l = by.get(sid); if (l) l.push(a); else by.set(sid, [a]); };
  for (const r of qa) if (s(r.source) !== "GAME") push(s(r.studentId), { at: ms(r.createdAt), correct: Boolean(r.isCorrect), rapid: Boolean(r.rapidGuess), skillId: s(r.skillId) });
  for (const r of nafs) push(s(r.studentId), { at: ms(r.at), correct: Boolean(r.correct), rapid: isRapidGuess(Math.max(0, Number(r.ms) || 0)), skillId: "" });
  const servedBy = new Map<string, { at: number; skillId: string }>();
  for (const o of open) { const at = ms(o.currentServedAt); const cur = servedBy.get(s(o.studentId)); if (!cur || at > cur.at) servedBy.set(s(o.studentId), { at, skillId: s(o.skillId) }); }

  const students: LiveStudent[] = ids.map((id) => {
    const list = (by.get(id) ?? []).sort((a, b) => a.at - b.at);
    const served = servedBy.get(id);
    const st = liveStatus(list, served?.at ?? 0, now);
    const last = list[list.length - 1];
    const correct = list.filter((a) => a.correct).length;
    const skill = (served && served.at >= (last?.at ?? 0) ? skillName(served.skillId) : null) ?? (last?.skillId ? skillName(last.skillId) : last ? "NAFS practice" : null);
    return {
      id, name: names.get(id)?.name ?? "Student", status: st.status, guessing: st.guessing, skill,
      minutesAgo: st.lastAt ? Math.max(0, Math.floor((now - st.lastAt) / MIN)) : null,
      today: { answered: list.length, correct, accuracy: list.length ? Math.round((100 * correct) / list.length) : null },
      streak: list.slice(-8).map((a) => a.correct),
    };
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.minutesAgo ?? 1e9) - (b.minutesAgo ?? 1e9) || a.name.localeCompare(b.name));

  const counts: Record<LiveStatus, number> = { HELP: 0, WORKING: 0, IDLE: 0, AWAY: 0 };
  for (const x of students) counts[x.status]++;
  const answered = students.reduce((x, st) => x + st.today.answered, 0), right = students.reduce((x, st) => x + st.today.correct, 0);
  return {
    classId: s(klass.id), className: s(klass.name), at: new Date(now).toISOString(), refreshSeconds: REFRESH_SECONDS, counts, students,
    today: { answered, accuracy: answered ? Math.round((100 * right) / answered) : null, active: students.filter((x) => x.today.answered > 0).length },
  };
}
