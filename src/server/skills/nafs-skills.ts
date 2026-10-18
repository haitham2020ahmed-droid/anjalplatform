/**
 * 🇸🇦 r82 (owner: "'Assign adaptive practice now' from the NAFS Suggested plan should be source NAFS and go to my Student
 * Skills"): a NAFS adaptive practice the teacher gave (NafsPractice — a row of the Assigned page, kind NAFS_PRACTICE) is
 * ASSIGNED work of source NAFS. Each of its targets is one Student Skills column in the "NAFS" area:
 *   a Ministry standard  "S12 Could it happen?"  (code = S01–S13, short name = MOE_LABEL)
 *   a NAFS skill         "Main idea"             (the NAFS framework's skill name)
 * The star of a student × target comes from their NAFS practice answers (NafsPracticeAnswer — the NAFS tables only;
 * the platform's stars, attempts and engine are never read or written), on the star scale with the NAFS practice's own
 * mastery rule (the closest existing rule: the platform's ⭐ needs 30 careful practice answers + the engine's mastery,
 * which NAFS answers never feed):
 *   ☆ Not started  no answer yet ·  ◐ Learning  answered, not mastered yet ·
 *   ⭐ Mastered     the practice's mastery: 4 of the last 5 answers right with at least 2 of them at Medium or Hard
 *                  (MASTERY in nafs/practice.ts; once mastered in a practice it stays mastered, as the practice shows it)
 * NAFS TESTS and booklets never count (tests measure, they do not assign a skill — r74 / r78).
 * Light: one read of the practices (targets) and one bounded read of their answers for the class (newest NAFS_ANSWERS_TAKE).
 */
import type { Repo, Row } from "../seeding/repo";
import { NOT_STARTED_VIEW, ms, type StarStatus, type StarView } from "./status";
import { MOE_BY_CODE, MOE_LABEL, SKILL_BY_CODE, type Difficulty } from "../nafs/framework";
import { isMastered } from "../nafs/practice";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };

export const NAFS_PREFIX = "nafs:";
export const nafsKey = (target: string) => `${NAFS_PREFIX}${target}`;
export const isNafsKey = (key: string) => key.startsWith(NAFS_PREFIX);
export const targetOfKey = (key: string) => key.slice(NAFS_PREFIX.length);
/** at most this many NAFS practice answers are read for one class */
export const NAFS_ANSWERS_TAKE = 20000;

/** Pure: the column of a target — "S12" + "Could it happen?" (a standard) or "" + "Main idea" (a NAFS skill). */
export function nafsColumn(key: string): { name: string; code: string; short: string; full: string } {
  const t = targetOfKey(key);
  const moe = MOE_BY_CODE.get(t);
  if (moe) { const short = MOE_LABEL[t] ?? moe.short; return { name: short, code: moe.short, short, full: moe.text }; }
  const k = SKILL_BY_CODE.get(t);
  const name = k?.name ?? t;
  return { name, code: "", short: name, full: k?.about ?? name };
}

/** The targets of some practices (one read). */
export async function practiceTargets(repo: Repo, practiceIds: readonly string[]): Promise<Map<string, { targets: string[]; createdAt: number }>> {
  const out = new Map<string, { targets: string[]; createdAt: number }>();
  if (!practiceIds.length) return out;
  for (const p of await repo.findMany("NafsPractice", { id: { in: [...new Set(practiceIds)] }, deletedAt: null }, { select: ["id", "targets", "createdAt"] })) {
    out.set(s(p.id), { targets: json<unknown[]>(p.targets, []).map(s).filter(Boolean), createdAt: ms(p.createdAt) });
  }
  return out;
}

/** the NAFS practice's own mastery (nafs/practice.ts isMastered: 4 of the last 5 right, ≥ 2 of them at Medium or Hard) */
export const nafsMastered = (last: [number, 0 | 1][]): boolean => isMastered(last as [Difficulty, 0 | 1][]);

export interface NafsCell { now: StarView; before: StarStatus; inRange: { answered: number; correct: number } | null }
/**
 * Pure: student|key → the star now (as of `end`), the star at `cut` (the trend) and the answers inside the dates, from
 * the answers (practiceId, studentId, target, difficulty, correct, at). Mastery is replayed per practice run.
 */
export function nafsCells(answers: readonly Row[], opts: { end: number; cut: number; start?: number | null; on?: boolean }): Map<string, NafsCell> {
  const by = new Map<string, Row[]>();
  for (const a of answers) { const k = `${s(a.studentId)}|${nafsKey(s(a.target))}`; (by.get(k) ?? by.set(k, []).get(k)!).push(a); }
  const out = new Map<string, NafsCell>();
  for (const [k, list] of by) {
    list.sort((a, b) => ms(a.at) - ms(b.at));
    const at = (t: number) => {
      const runs = new Map<string, [number, 0 | 1][]>();
      let n = 0, right = 0, first: number | null = null, last: number | null = null, masteredAt: number | null = null;
      for (const a of list) {
        const when = ms(a.at); if (when > t) break;
        const ok = a.correct === true || a.correct === 1;
        n++; if (ok) right++; first ??= when; last = when;
        const seq = runs.get(s(a.practiceId)) ?? []; seq.push([Number(a.difficulty) || 2, ok ? 1 : 0]); runs.set(s(a.practiceId), seq);
        if (masteredAt === null && nafsMastered(seq)) masteredAt = when;
      }
      return { n, right, first, last, masteredAt };
    };
    const x = at(opts.end), b = at(opts.cut);
    const status: StarStatus = !x.n ? "NOT_STARTED" : x.masteredAt !== null ? "MASTERED" : "IN_PROGRESS";
    const now: StarView = !x.n ? NOT_STARTED_VIEW(k.slice(k.indexOf("|") + 1)) : {
      ...NOT_STARTED_VIEW(k.slice(k.indexOf("|") + 1)), status, answered: x.n, correct: x.right, score: Math.round((100 * x.right) / x.n),
      startedAt: x.first ? new Date(x.first).toISOString() : null, masteredAt: x.masteredAt !== null ? new Date(x.masteredAt).toISOString() : null, updatedAt: x.last ? new Date(x.last).toISOString() : null,
    };
    const before: StarStatus = !b.n ? "NOT_STARTED" : b.masteredAt !== null ? "MASTERED" : "IN_PROGRESS";
    let inRange: NafsCell["inRange"] = null;
    if (opts.on) {
      const inside = list.filter((a) => ms(a.at) <= opts.end && (opts.start === null || opts.start === undefined || ms(a.at) >= opts.start));
      inRange = { answered: inside.length, correct: inside.filter((a) => a.correct === true || a.correct === 1).length };
    }
    out.set(k, { now, before, inRange });
  }
  return out;
}

/** The NAFS practice answers of these practices and students (one bounded read, newest first). */
export async function nafsAnswers(repo: Repo, practiceIds: readonly string[], studentIds: readonly string[], until?: number): Promise<Row[]> {
  if (!practiceIds.length || !studentIds.length) return [];
  return repo.findMany("NafsPracticeAnswer", { practiceId: { in: [...new Set(practiceIds)] }, studentId: { in: [...new Set(studentIds)] }, ...(until ? { at: { lte: new Date(until) } } : {}) },
    { select: ["practiceId", "studentId", "target", "difficulty", "correct", "at"], orderBy: [{ field: "at", dir: "desc" }], take: NAFS_ANSWERS_TAKE });
}
