/**
 * 🏅 Badges: earned for completing skills, finishing work, moving up a level, reading and writing, and steady
 * practice. Worked out from the student's own records every time (nothing can be gamed from the browser); the
 * first time a badge is seen it is saved (StudentBadge) with its date. A student sees only their own badges —
 * there are no leaderboards or comparisons.
 */
import type { Repo } from "../seeding/repo";
import { ladderSettings } from "../curriculum-map/ladder-settings";
import { streakAndPoints } from "./streak";

const s = (v: unknown) => String(v ?? "");
export interface BadgeDef { code: string; icon: string; name: string; description: string; metric: Metric; target: number }
type Metric = "correct" | "mastered" | "tasks" | "levelUps" | "streak" | "articles" | "writing" | "growth" | "words" | "practiceTests";

export const BADGES: BadgeDef[] = [
  { code: "first-steps", icon: "👣", name: "First Steps", description: "Answer 10 questions correctly.", metric: "correct", target: 10 },
  { code: "sharp-shooter", icon: "🎯", name: "Sharp Shooter", description: "Answer 100 questions correctly.", metric: "correct", target: 100 },
  { code: "super-brain", icon: "🧠", name: "Super Brain", description: "Answer 500 questions correctly.", metric: "correct", target: 500 },
  { code: "skill-master", icon: "⭐", name: "Skill Master", description: "Master your first skill.", metric: "mastered", target: 1 },
  { code: "skill-star", icon: "🌟", name: "Skill Star", description: "Master 5 skills.", metric: "mastered", target: 5 },
  { code: "skill-champion", icon: "🏆", name: "Skill Champion", description: "Master 15 skills.", metric: "mastered", target: 15 },
  { code: "task-finisher", icon: "✅", name: "Task Finisher", description: "Finish your first task from your teacher.", metric: "tasks", target: 1 },
  { code: "hard-worker", icon: "💪", name: "Hard Worker", description: "Finish 10 tasks from your teacher.", metric: "tasks", target: 10 },
  { code: "level-up", icon: "🚀", name: "Level Up!", description: "Move up a level by your answers.", metric: "levelUps", target: 1 },
  { code: "rocket", icon: "🌠", name: "Rocket", description: "Move up a level 5 times.", metric: "levelUps", target: 5 },
  { code: "on-fire", icon: "🔥", name: "On Fire", description: "Practise 3 days in a row.", metric: "streak", target: 3 },
  { code: "unstoppable", icon: "⚡", name: "Unstoppable", description: "Practise 7 days in a row.", metric: "streak", target: 7 },
  { code: "bookworm", icon: "📚", name: "Bookworm", description: "Finish 5 ReadMaster articles.", metric: "articles", target: 5 },
  { code: "writer", icon: "✍️", name: "Writer", description: "Finish 3 Respond to Reading answers in your book.", metric: "writing", target: 3 },
  { code: "growing", icon: "📈", name: "Growing", description: "Grow 3 RIT points since your Fall MAP.", metric: "growth", target: 3 },
  { code: "band-up", icon: "🚀", name: "Band Up!", description: "Grow 10 RIT points since your Fall MAP: a whole band higher.", metric: "growth", target: 10 },
  { code: "word-collector", icon: "📒", name: "Word Collector", description: "Look up 20 new words in your readings.", metric: "words", target: 20 },
  { code: "test-ready", icon: "🧭", name: "Test Ready", description: "Finish a MAP practice test.", metric: "practiceTests", target: 1 },
];

export interface StudentBadge extends BadgeDef { earned: boolean; earnedAt: string | null; value: number }

async function metrics(repo: Repo, studentId: string, schoolId: string | null, now: Date): Promise<Record<Metric, number>> {
  const rules = await ladderSettings(repo, schoolId);
  const [mastery, tasks, logs, articles, writing, sp] = await Promise.all([
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["attempts", "correct"] }),
    repo.findMany("AssignmentStudent", { studentId, status: "COMPLETED" }, { select: ["assignmentId"] }),
    repo.findMany("AuditLog", { entityType: "Student", entityId: studentId, action: "level.change" }, { select: ["before", "after"] }),
    repo.count("ReadMasterAttempt", { studentId }),
    repo.findMany("RespondAssignmentStudent", { studentId }, { select: ["finishedAt"] }),
    streakAndPoints(repo, studentId, now),
  ]);
  const correct = await repo.count("QuestionAttempt", { studentId, isCorrect: true });
  const RANK: Record<string, number> = { SUPPORT: -1, BELOW: 0, ON: 1, ABOVE: 2, CHALLENGE: 3 };
  const levelUps = logs.filter((l) => { const a = (l.after ?? {}) as Record<string, unknown>, b = (l.before ?? {}) as Record<string, unknown>; return a.outcome === "CHANGED" && a.source === "ADAPTIVE" && b.level && RANK[s(a.level)] > RANK[s(b.level)]; }).length;
  const mastered = mastery.filter((m) => Number(m.attempts) >= rules.masteredMin && (Number(m.correct) / Math.max(1, Number(m.attempts))) * 100 >= rules.masteredPct).length;
  const finishedWriting = writing.filter((w) => w.finishedAt).length;
  // MAP growth: the latest real MAP score or practice-test result minus the Fall score (best subject)
  const [maps, sims, words] = await Promise.all([
    repo.findMany("MapResult", { studentId, goalName: null }, { select: ["subject", "rit", "termName", "testDate"] }),
    repo.findMany("MapSimSession", { studentId, kind: "SIM", status: "DONE" }, { select: ["subject", "resultRit", "finishedAt"] }),
    repo.count("StudentWord", { studentId }),
  ]);
  const ms = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
  let growth = 0;
  for (const subj of ["READING", "LANGUAGE"]) {
    const mine = maps.filter((m) => (subj === "READING" ? /read/i : /language/i).test(s(m.subject))).sort((a, b) => ms(a.testDate) - ms(b.testDate));
    const fall = mine.find((m) => /fall/i.test(s(m.termName)));
    if (!fall) continue;
    const later = [...mine.filter((m) => m !== fall && ms(m.testDate) > ms(fall.testDate)).map((m) => Number(m.rit)), ...sims.filter((x) => x.subject === subj).map((x) => Number(x.resultRit))];
    if (later.length) growth = Math.max(growth, Math.max(...later) - Number(fall.rit));
  }
  return { correct, mastered, tasks: tasks.length + finishedWriting, levelUps, streak: sp.streak, articles, writing: finishedWriting, growth: Math.max(0, growth), words, practiceTests: sims.length };
}

/** Every badge with earned / not yet and progress; newly earned ones are saved with today's date. */
export async function studentBadges(repo: Repo, studentId: string, now = new Date()): Promise<StudentBadge[]> {
  const st = await repo.findUnique("Student", { id: studentId });
  const m = await metrics(repo, studentId, st ? s(st.schoolId) : null, now);
  const defs = await repo.findMany("Badge", { code: { in: BADGES.map((b) => b.code) } });
  const idOf = new Map(defs.map((d) => [s(d.code), s(d.id)]));
  for (const b of BADGES) if (!idOf.has(b.code)) idOf.set(b.code, s((await repo.upsert("Badge", { code: b.code }, { code: b.code, name: b.name, description: b.description, criteria: { metric: b.metric, target: b.target } }, { name: b.name, description: b.description, criteria: { metric: b.metric, target: b.target } })).id));
  const have = new Map((await repo.findMany("StudentBadge", { studentId })).map((x) => [s(x.badgeId), x.awardedAt]));
  const out: StudentBadge[] = [];
  for (const b of BADGES) {
    const id = idOf.get(b.code)!, value = m[b.metric], earned = value >= b.target || have.has(id);
    let at = have.get(id);
    if (earned && !have.has(id)) { await repo.create("StudentBadge", { studentId, badgeId: id, awardedAt: now }); at = now; }
    out.push({ ...b, earned, earnedAt: at ? new Date(at instanceof Date ? at.toISOString() : s(at)).toISOString() : null, value: Math.min(value, b.target) });
  }
  return out;
}
