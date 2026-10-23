/**
 * 🏅 Badges: earned for completing skills, finishing work, moving up a level, reading and writing, and steady
 * practice. Worked out from the student's own records every time (nothing can be gamed from the browser); the
 * first time a badge is seen it is saved (StudentBadge) with its date. A student sees only their own badges —
 * there are no leaderboards or comparisons.
 */
import type { Repo } from "../seeding/repo";
import { isUniqueError } from "../db/prisma-repo";
import { ladderSettings } from "../curriculum-map/ladder-settings";
import { activeDays, streakAndPoints } from "./streak";

/** "Steady Practice": distinct days of activity in the last N days (consistency, not streak — gaps are fine). */
const CONSISTENT_WINDOW_DAYS = 21;
import { BADGES, type BadgeDef, type BadgeMetric } from "../../lib/badge-catalog";
import { isGrammarCode } from "../grammar/grammar";

const s = (v: unknown) => String(v ?? "");
// the list itself is pure data (src/lib/badge-catalog.ts) so emblems can be drawn in the browser too (Games Part 3)
export { BADGES, type BadgeDef } from "../../lib/badge-catalog";
type Metric = BadgeMetric;

export interface StudentBadge extends BadgeDef { earned: boolean; earnedAt: string | null; value: number }

async function metrics(repo: Repo, studentId: string, schoolId: string | null, now: Date): Promise<Record<Metric, number>> {
  // every read in one round trip (Update 42B)
  const [rules, mastery, tasks, logs, articles, writing, sp, correct, maps, sims, words] = await Promise.all([
    ladderSettings(repo, schoolId),
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "attempts", "correct"] }),
    repo.findMany("AssignmentStudent", { studentId, status: "COMPLETED" }, { select: ["assignmentId"] }),
    repo.findMany("AuditLog", { entityType: "Student", entityId: studentId, action: "level.change" }, { select: ["before", "after"] }),
    repo.count("ReadMasterAttempt", { studentId }),
    repo.findMany("RespondAssignmentStudent", { studentId }, { select: ["finishedAt"] }),
    streakAndPoints(repo, studentId, now),
    // 🔧 fix (Oct 2026): a rapid-guess answer should not count toward "First Steps" / "Sharp Shooter" / "Super Brain"
    // (same exclusion as the points count in streak.ts).
    repo.count("QuestionAttempt", { studentId, isCorrect: true, rapidGuess: false }),
    repo.findMany("MapResult", { studentId, goalName: null }, { select: ["subject", "rit", "termName", "testDate"] }),
    repo.findMany("MapSimSession", { studentId, kind: "SIM", status: "DONE" }, { select: ["subject", "resultRit", "finishedAt"] }),
    repo.count("StudentWord", { studentId }),
  ]);
  // Games Part 3: ReadRise articles finished, Questions of the Day, Live Challenges, plans, coins (one more round trip)
  const [rrArticles, qotdCorrect, qotdAnswered, ledger, wallet, consistentDaysRaw] = await Promise.all([
    repo.count("RRRun", { studentId, step: "DONE" }),
    repo.count("QotdAnswer", { studentId, correct: true }),
    repo.count("QotdAnswer", { studentId }),
    repo.findMany("CoinLedger", { studentId, reason: { in: ["live", "live.win", "plan"] } }, { select: ["reason"], take: 2000 }),
    repo.findUnique("StudentReward", { studentId }),
    // consistency, not score: how many DISTINCT days the student practised in the last 3 weeks (gaps are fine)
    activeDays(repo, studentId, new Date(now.getTime() - CONSISTENT_WINDOW_DAYS * 86_400_000)),
  ]);
  const consistentDays = new Set(consistentDaysRaw).size;
  const RANK: Record<string, number> = { SUPPORT: -1, BELOW: 0, ON: 1, ABOVE: 2, CHALLENGE: 3 };
  const levelUps = logs.filter((l) => { const a = (l.after ?? {}) as Record<string, unknown>, b = (l.before ?? {}) as Record<string, unknown>; return a.outcome === "CHANGED" && a.source === "ADAPTIVE" && b.level && RANK[s(a.level)] > RANK[s(b.level)]; }).length;
  const masteredRows = mastery.filter((m) => Number(m.attempts) >= rules.masteredMin && (Number(m.correct) / Math.max(1, Number(m.attempts))) * 100 >= rules.masteredPct);
  const mastered = masteredRows.length;
  // grammar skills mastered (Grammar Master): the codes of the mastered skills only
  const grammarMastered = masteredRows.length ? (await repo.findMany("Skill", { id: { in: masteredRows.slice(0, 1000).map((m) => m.skillId) } }, { select: ["code"] })).filter((k) => isGrammarCode(k.code)).length : 0;
  const finishedWriting = writing.filter((w) => w.finishedAt).length;
  // MAP growth: the latest real MAP score or practice-test result minus the Fall score (best subject)
  const ms = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
  let growth = 0;
  for (const subj of ["READING", "LANGUAGE"]) {
    const mine = maps.filter((m) => (subj === "READING" ? /read/i : /language/i).test(s(m.subject))).sort((a, b) => ms(a.testDate) - ms(b.testDate));
    const fall = mine.find((m) => /fall/i.test(s(m.termName)));
    if (!fall) continue;
    const later = [...mine.filter((m) => m !== fall && ms(m.testDate) > ms(fall.testDate)).map((m) => Number(m.rit)), ...sims.filter((x) => x.subject === subj).map((x) => Number(x.resultRit))];
    if (later.length) growth = Math.max(growth, Math.max(...later) - Number(fall.rit));
  }
  return { correct, mastered, tasks: tasks.length + finishedWriting, levelUps, streak: sp.streak, articles, writing: finishedWriting, growth: Math.max(0, growth), words, practiceTests: sims.length,
    rrArticles, grammarMastered, qotdCorrect, qotdAnswered,
    liveWins: ledger.filter((l) => l.reason === "live.win").length, liveGames: ledger.filter((l) => l.reason === "live").length, plans: ledger.filter((l) => l.reason === "plan").length,
    coinsEarned: Number(wallet?.earned ?? 0), consistentDays };
}

/** Every badge with earned / not yet and progress; newly earned ones are saved with today's date. */
export async function studentBadges(repo: Repo, studentId: string, now = new Date()): Promise<StudentBadge[]> {
  // independent reads together (Update 42B): the student (for the school's rules), the badge list, the badges held
  const [st, defs, held] = await Promise.all([
    repo.findUnique("Student", { id: studentId }),
    repo.findMany("Badge", { code: { in: BADGES.map((b) => b.code) } }),
    repo.findMany("StudentBadge", { studentId }),
  ]);
  const m = await metrics(repo, studentId, st ? s(st.schoolId) : null, now);
  const idOf = new Map(defs.map((d) => [s(d.code), s(d.id)]));
  for (const b of BADGES) if (!idOf.has(b.code)) idOf.set(b.code, s((await repo.upsert("Badge", { code: b.code }, { code: b.code, name: b.name, description: b.description, criteria: { metric: b.metric, target: b.target } }, { name: b.name, description: b.description, criteria: { metric: b.metric, target: b.target } })).id));
  const have = new Map(held.map((x) => [s(x.badgeId), x.awardedAt]));
  const out: StudentBadge[] = [];
  const awards: Promise<unknown>[] = [];
  for (const b of BADGES) {
    const id = idOf.get(b.code)!, value = m[b.metric], earned = value >= b.target || have.has(id);
    let at = have.get(id);
    // 🔧 fix (Oct 2026): two concurrent calls (e.g. two requests re-checking badges at once) could both see the badge
    // not yet held and both insert — StudentBadge's composite PK (studentId, badgeId) then throws a unique-constraint
    // error (P2002) on the loser. Same swallow-on-race pattern as insertLedger (motivation/coins.ts): only a unique
    // error is swallowed, anything else is rethrown.
    if (earned && !have.has(id)) {
      awards.push(repo.create("StudentBadge", { studentId, badgeId: id, awardedAt: now }).catch((e) => { if (!isUniqueError(e)) throw e; }));
      have.set(id, now); at = now;
    }
    out.push({ ...b, earned, earnedAt: at ? new Date(at instanceof Date ? at.toISOString() : s(at)).toISOString() : null, value: Math.min(value, b.target) });
  }
  await Promise.all(awards);
  return out;
}
