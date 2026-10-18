/**
 * 🗓️ The Weekly Check: 8 questions a week (Update 39B: a result that can move a support tier needs 8+ items — 5 was
 * too noisy: 30.5% of students reversed tiers twice in 6 weeks), chosen around the student's current RIT (one per MAP goal area of
 * Reading, then Language), never seen before. It keeps the RIT estimate (“now” on My MAP) and the teacher's picture
 * current between MAP tests. It lives outside My Work (a hidden set) and shows on the student's home page.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { estimateRit, groupPools, GROUPS, type PoolQ } from "../map/map-plan";
import { weekStart } from "./weekly";
import { withLock } from "../lib/key-lock";
import { diagnosticPool } from "../diagnostic/test";
import { evidenceLevels } from "../curriculum-map/evidence-level";

const s = (v: unknown) => String(v ?? "");
export const WEEKLY_CHECK_SIZE = 8;
/** the hidden marker of the check's assignment (kept out of My Work and the plans) */
export const WEEKLY_CHECK_MARK = "WEEKLY_CHECK";
const hash = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export interface WeeklyCheckView { week: string; status: "TODO" | "STARTED" | "DONE"; href: string; correct: number; total: number; ritBefore: number | null; ritAfter: number | null }

async function context(repo: Repo, actor: Actor): Promise<{ studentId: string; klass: Row; grade: number } | null> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const m = (await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  const g = klass ? await repo.findUnique("Grade", { id: klass.gradeId }) : null;
  return klass && g ? { studentId: actor.studentId, klass, grade: Number(g.level) } : null;
}

/** This week's check (without making it). */
export async function weeklyCheck(repo: Repo, actor: Actor, now = new Date()): Promise<WeeklyCheckView | null> {
  const c = await context(repo, actor);
  if (!c) return null;
  const week = weekStart(now).toISOString().slice(0, 10);
  const row = (await repo.findMany("WeeklyCheck", { studentId: c.studentId, week }))[0];
  if (!row) {
    const pk = await groupPools(repo, s(actor.schoolId), c.grade);
    const n = GROUPS.filter((g) => g.subject === "READING").reduce((t, g) => t + (pk.pools.get(g.key)?.length ?? 0), 0);
    // not enough questions linked to MAP goal areas: the grade's questions by standard serve instead
    const m = n >= WEEKLY_CHECK_SIZE ? n : (await diagnosticPool(repo, s(actor.schoolId), c.grade)).length;
    return m >= WEEKLY_CHECK_SIZE ? { week, status: "TODO", href: "/student/weekly-check", correct: 0, total: WEEKLY_CHECK_SIZE, ritBefore: null, ritAfter: null } : null;
  }
  const ses = (await repo.findMany("PracticeSession", { studentId: c.studentId, assignmentId: row.assignmentId, mode: "TEACHER_QUIZ" }))[0];
  const answered = ses ? await repo.count("QuestionAttempt", { sessionId: ses.id }) : 0;
  return { week, status: row.completedAt ? "DONE" : answered ? "STARTED" : "TODO", href: `/quiz/${s(row.assignmentId)}`, correct: Number(row.correct), total: Number(row.total), ritBefore: row.ritBefore === null ? null : Number(row.ritBefore), ritAfter: row.ritAfter === null ? null : Number(row.ritAfter) };
}

/** Opens this week's check (made the first time): returns the quiz link. */
export function openWeeklyCheck(repo: Repo, actor: Actor, now = new Date()): Promise<string | null> {
  return withLock(`weekly:${actor.userId}`, () => openWeeklyCheckUnlocked(repo, actor, now));
}
async function openWeeklyCheckUnlocked(repo: Repo, actor: Actor, now: Date): Promise<string | null> {
  const c = await context(repo, actor);
  if (!c) return null;
  const week = weekStart(now).toISOString().slice(0, 10);
  const existing = (await repo.findMany("WeeklyCheck", { studentId: c.studentId, week }))[0];
  if (existing) return `/quiz/${s(existing.assignmentId)}`;
  const schoolId = s(actor.schoolId);
  const pk = await groupPools(repo, schoolId, c.grade);
  // around the current RIT: the platform's estimate, else the latest MAP Reading RIT, else the middle of the pool
  const est = await estimateRit(repo, schoolId, c.studentId, "READING", now);
  const maps = (await repo.findMany("MapResult", { studentId: c.studentId }, { select: ["subject", "goalName", "rit", "testDate"] })).filter((m) => !m.goalName && /read/i.test(s(m.subject))).sort((a, b) => new Date(s(b.testDate instanceof Date ? b.testDate.toISOString() : b.testDate)).getTime() - new Date(s(a.testDate instanceof Date ? a.testDate.toISOString() : a.testDate)).getTime());
  const all = GROUPS.filter((g) => g.subject === "READING").flatMap((g) => pk.pools.get(g.key) ?? []);
  const seen = new Set((await repo.findMany("QuestionAttempt", { studentId: c.studentId }, { select: ["questionId"] })).map((a) => s(a.questionId)));
  const pick: PoolQ[] = [];
  if (all.length < WEEKLY_CHECK_SIZE) {
    // fallback: the grade's questions by standard (Literature, Informational, Vocabulary, Grammar), at the student's level
    const pool = await diagnosticPool(repo, schoolId, c.grade);
    if (pool.length < WEEKLY_CHECK_SIZE) return null;
    const lv = (await evidenceLevels(repo, schoolId, [c.studentId], c.grade, {}, now)).get(c.studentId)?.level ?? "ON";
    const aimLevel = lv === "BELOW" ? 3 : lv === "ABOVE" ? 5 : 4;
    const strands = ["LIT", "INFO", "VOCAB", "LANG", "LIT", "INFO"];
    for (const st of strands) {
      if (pick.length >= WEEKLY_CHECK_SIZE) break;
      const inS = pool.filter((q) => q.area.strand === st && !pick.some((p) => p.id === q.id));
      const fresh = inS.filter((q) => !seen.has(q.id));
      const from = fresh.length ? fresh : inS;
      if (!from.length) continue;
      const best = [...from].sort((a, b) => Math.abs(a.level - aimLevel) - Math.abs(b.level - aimLevel) || hash(c.studentId + week + a.id) - hash(c.studentId + week + b.id))[0];
      pick.push({ id: best.id, skillId: "", rit: 0 });
    }
    for (const q of pool) { if (pick.length >= WEEKLY_CHECK_SIZE) break; if (!pick.some((p) => p.id === q.id) && !seen.has(q.id)) pick.push({ id: q.id, skillId: "", rit: 0 }); }
  }
  const sorted = [...all].sort((a, b) => a.rit - b.rit);
  // Update 39B (new student without MAP): the first check starts at the grade's typical RIT, leaning a little easier,
  // never at an early estimate from a few days of practice (RIT 217 put an On-level new student at 0/5)
  const done = await repo.count("WeeklyCheck", { studentId: c.studentId, completedAt: { not: null } });
  const gradeTarget = !maps[0] ? await gradeDefaultRit(repo, c.grade, now) : null;
  const target = gradeTarget !== null && (done === 0 || !est) ? gradeTarget - NO_MAP_EASIER_RIT
    : est?.rit ?? (maps[0] ? Number(maps[0].rit) : sorted.length ? sorted[Math.floor(sorted.length / 2)].rit : 200);
  const base = [...GROUPS.filter((g) => g.subject === "READING"), ...GROUPS.filter((g) => g.subject === "LANGUAGE" && g.key !== "WRITING")];
  // 🧭 the weakest instructional area of the latest MAP comes first and twice, aimed at that area's own RIT
  const weak = await weakestArea(repo, c.studentId);
  const weakG = weak ? base.find((g) => g.key === weak.key) : undefined;
  const others = base.filter((g) => g !== weakG);
  const order = weakG ? [weakG, others[0], weakG, ...others.slice(1)] : base;
  for (let round = 0; all.length >= WEEKLY_CHECK_SIZE && pick.length < WEEKLY_CHECK_SIZE && round < 5; round++) {
    for (const g of order) {
      if (pick.length >= WEEKLY_CHECK_SIZE) break;
      const pool = (pk.pools.get(g.key) ?? []).filter((q) => !pick.some((p) => p.id === q.id));
      const fresh = pool.filter((q) => !seen.has(q.id));
      const from = fresh.length ? fresh : pool;
      if (!from.length) continue;
      // a little above and below the target in turn, so the check measures both ways
      const aim = (weakG && g === weakG ? weak!.rit : target) + [0, 4, -4, 7, -7][(pick.length + round) % 5];
      const best = [...from].sort((a, b) => Math.abs(a.rit - aim) - Math.abs(b.rit - aim) || hash(c.studentId + week + a.id) - hash(c.studentId + week + b.id))[0];
      pick.push(best);
    }
  }
  const lead = (await repo.findMany("ClassTeacher", { classId: c.klass.id }, { select: ["teacherId", "isLead"] })).sort((a, b) => Number(Boolean(b.isLead)) - Number(Boolean(a.isLead)))[0];
  if (!lead) return null;
  const set = await repo.create("Assessment", { title: `Weekly Check · ${week}`, type: "BENCHMARK", isAdaptive: false, maxQuestions: pick.length, status: "PUBLISHED", createdById: actor.userId, createdAt: now });
  await repo.createMany("AssessmentQuestion", pick.map((q, order) => ({ assessmentId: set.id, questionId: q.id, order, points: 1 })));
  const a = await repo.create("Assignment", { classId: c.klass.id, createdById: lead.teacherId, title: `Weekly Check · ${week}`, target: "ASSESSMENT", track: "MAP", assessmentId: set.id, curriculumPlanId: WEEKLY_CHECK_MARK, note: "Weekly Check", createdAt: now, source: "MAP" });
  await repo.create("AssignmentStudent", { assignmentId: a.id, studentId: c.studentId, status: "NOT_STARTED", progress: 0 });
  await repo.create("WeeklyCheck", { studentId: c.studentId, week, assignmentId: a.id, correct: 0, total: pick.length, ritBefore: est?.rit ?? (maps[0] ? Number(maps[0].rit) : null), ritAfter: null, completedAt: null, createdAt: now });
  return `/quiz/${s(a.id)}`;
}

/** RIT points under the grade's typical score for the first check of a student without MAP (easier-leaning start). */
export const NO_MAP_EASIER_RIT = 3;
/** The grade's typical (national mean) Reading RIT this season, or null. */
export async function gradeDefaultRit(repo: Repo, grade: number, now: Date): Promise<number | null> {
  const { ensureNationalNorms, nationalNorm, seasonOf } = await import("../map/rit");
  await ensureNationalNorms(repo).catch(() => null);
  const n = await nationalNorm(repo, grade, seasonOf(null, now)).catch(() => null);
  return n ? Math.round(n.mean) : null;
}

/** Called after each answer of a Weekly Check: when every question is answered, the result and the new estimate are kept. */
export async function finishWeeklyCheck(repo: Repo, assignmentId: string, studentId: string, sessionId: string, schoolId: string, now = new Date()): Promise<void> {
  const row = (await repo.findMany("WeeklyCheck", { assignmentId, studentId }))[0];
  if (!row || row.completedAt) return;
  const attempts = await repo.findMany("QuestionAttempt", { sessionId }, { select: ["questionId", "isCorrect"] });
  const answered = new Set(attempts.map((a) => s(a.questionId)));
  if (answered.size < Number(row.total)) return;
  const est = await estimateRit(repo, schoolId, studentId, "READING", now);
  await repo.updateMany("WeeklyCheck", { id: row.id }, { correct: attempts.filter((a) => a.isCorrect).length, ritAfter: est?.rit ?? row.ritBefore ?? null, completedAt: now });
}

/** The student's weakest MAP instructional area in their latest term (by its RIT), if the areas were imported. */
export async function weakestArea(repo: Repo, studentId: string): Promise<{ key: string; rit: number } | null> {
  const { areaFromName } = await import("../map/nwea-area");
  const rows = (await repo.findMany("MapResult", { studentId }, { select: ["goalName", "rit", "termName", "testDate"] })).filter((r) => r.goalName);
  if (!rows.length) return null;
  const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
  const latest = rows.reduce((a, b) => (t(b.testDate) > t(a.testDate) ? b : a));
  const byArea = new Map<string, number>();
  for (const r of rows.filter((x) => s(x.termName) === s(latest.termName))) { const k = areaFromName(s(r.goalName).split(":")[0]) ?? areaFromName(s(r.goalName)); if (k && k !== "WRITING" && !byArea.has(k)) byArea.set(k, Number(r.rit)); }
  const w = [...byArea].sort((a, b) => a[1] - b[1])[0];
  return w ? { key: w[0], rit: w[1] } : null;
}
