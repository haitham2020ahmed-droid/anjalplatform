/**
 * Update 40 · fast Data Health: the same results with far less work.
 *  - the EAP estimate is bit-for-bit the old formula (with and without the shared grid cache)
 *  - levelThetas with preloaded answers / `only: "theta"` gives the same numbers as the plain call
 *  - the fast conflict path (levelConflicts, Data Health) finds exactly the conflicts the full Level Story finds
 *  - Data Health rows equal a plain recomputation; activityStats equals practiceStats; no per-student queries
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { clamp, estimateAbilityEAP, probability, type EapCache, type IrtModel } from "../src/adaptive/irt";
import { levelThetas, LEVEL_THETA_COLUMNS, pooledTheta } from "../src/server/curriculum-map/level-evidence";
import { dataHealth, levelConflicts, levelStory } from "../src/server/insights/level-story";
import { activityStats, practiceStats } from "../src/server/insights/student-data";
import { demoDatabase, seededRandom } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

/** The EAP estimate exactly as it was before Update 40 (the reference). */
function eapReference(responses: { a: number; b: number; c: number; credit: number; weight: number }[], opts: { priorMean: number; priorSD: number; thetaMin: number; thetaMax: number; model: IrtModel }) {
  const { priorMean, priorSD, thetaMin, thetaMax, model } = opts;
  let num = 0, den = 0, sq = 0;
  const logPost: number[] = [], grid: number[] = [];
  for (let t = thetaMin; t <= thetaMax + 1e-9; t += 0.05) {
    let lp = -0.5 * ((t - priorMean) / priorSD) ** 2;
    for (const r of responses) {
      if (r.weight <= 0) continue;
      const p = clamp(probability(t, r, model), 1e-9, 1 - 1e-9);
      lp += r.weight * (r.credit * Math.log(p) + (1 - r.credit) * Math.log(1 - p));
    }
    grid.push(t); logPost.push(lp);
  }
  const max = Math.max(...logPost);
  for (let i = 0; i < grid.length; i++) { const w = Math.exp(logPost[i] - max); num += grid[i] * w; den += w; }
  const theta = num / den;
  for (let i = 0; i < grid.length; i++) { const w = Math.exp(logPost[i] - max); sq += (grid[i] - theta) ** 2 * w; }
  return { theta, se: Math.sqrt(sq / den) };
}

describe("Update 40 · EAP speed-up is exact", () => {
  test("bit-for-bit the old estimate: models 1–3, partial credit, zero weights, shared cache across calls", () => {
    const rnd = seededRandom(4040);
    const cache: EapCache = new Map();
    const bank = Array.from({ length: 25 }, () => ({ a: 0.5 + rnd() * 1.5, b: Math.round((rnd() * 5 - 2.5) * 100) / 100, c: [0, 0.2, 0.25, 0.33][Math.floor(rnd() * 4)] }));
    for (let k = 0; k < 120; k++) {
      const n = 1 + Math.floor(rnd() * 80);
      const responses = Array.from({ length: n }, () => {
        const it = bank[Math.floor(rnd() * bank.length)];
        const u = rnd();
        return { ...it, credit: u < 0.45 ? 1 : u < 0.9 ? 0 : Math.round(rnd() * 100) / 100, weight: rnd() < 0.05 ? 0 : Math.round(rnd() * 100) / 100 + (rnd() < 0.5 ? 1 : 0) };
      });
      const model = ([1, 2, 3] as const)[k % 3];
      const opts = { priorMean: k % 2 ? 0 : 0.4, priorSD: k % 4 < 2 ? 1 : 0.7, thetaMin: k % 5 ? -3 : -4, thetaMax: k % 5 ? 3 : 4, model };
      const ref = eapReference(responses, opts);
      const fast = estimateAbilityEAP(responses, opts);
      const shared = estimateAbilityEAP(responses, { ...opts, cache });
      assert.ok(Object.is(fast.theta, ref.theta) && Object.is(fast.se, ref.se), `case ${k}: ${fast.theta} vs ${ref.theta}`);
      assert.ok(Object.is(shared.theta, ref.theta) && Object.is(shared.se, ref.se), `case ${k} (cache)`);
    }
    assert.ok(cache.size >= 2, "the cache is keyed by the grid");
    assert.deepEqual(pooledTheta([]), { theta: 0, se: 1, effN: 0 });
  });
});

describe("Update 40 · fast Data Health on a seeded world", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let ids: string[]; let classIds: string[];
  const NOW = new Date("2026-10-12T09:00:00Z");
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 }));
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none", now: NOW });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await a("test.teacher.1");
    const school = await repo.findUnique("School", { id: teacher.schoolId! });
    const adminUser = (await repo.findMany("User", { schoolId: school!.id, role: "SCHOOL_ADMIN" }))[0];
    admin = await resolveActor(repo, adminUser);
    const classes = (await repo.findMany("Class", { schoolId: school!.id })).filter((c) => !c.deletedAt);
    classIds = classes.map((c) => s(c.id));
    const mem = await repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null });
    ids = [...new Set(mem.map((m) => s(m.studentId)))].sort();
    assert.ok(ids.length >= 12, `${ids.length} students`);
    // a varied world: MAP, Diagnostics (valid, rapid-guess invalid, too old), answers of every kind
    const diagTest = await repo.create("DiagnosticTest", { schoolId: school!.id, grade: 4, year: "2026-2027", title: "TEST BOY", assessmentId: "none", status: "CLOSED", period: "BOY", createdAt: new Date(NOW.getTime() - 40 * DAY) });
    const qs = (await repo.findMany("Question", {})).slice(0, 60);
    const rnd = seededRandom(77);
    for (const [i, sid] of ids.entries()) {
      const kind = i % 6;
      if (kind !== 5) await repo.create("MapResult", { studentId: sid, testDate: new Date(NOW.getTime() - 30 * DAY), subject: "Reading", goalName: null, rit: [232, 190, 205, 228, 186][kind], achievementPercentile: [92, 8, 50, 88, 5][kind], termName: "Fall 2026", importedAt: NOW });
      if (kind <= 3) await repo.create("DiagnosticScore", { diagnosticId: diagTest.id, studentId: sid, assignmentId: "none", correct: 10, total: 40, pct: [25, 90, 50, 20][kind], level: ["BELOW", "ABOVE", "ON", "BELOW"][kind], byStandard: {}, byStrand: {}, rapid: kind === 3 ? 20 : 2, completedAt: new Date(NOW.getTime() - (kind === 2 ? 200 : 20) * DAY) });
      if (i % 4 === 3) continue; // some students without answers
      const ses = await repo.create("PracticeSession", { studentId: sid, skillId: qs[0].skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(NOW.getTime() - 50 * DAY), activeMs: 600_000 });
      const n = 8 + Math.floor(rnd() * 40), strong = i % 3 === 0;
      for (let k = 0; k < n; k++) {
        const q = qs[Math.floor(rnd() * qs.length)];
        await repo.create("QuestionAttempt", {
          sessionId: ses.id, studentId: sid, questionId: q.id, skillId: q.skillId, response: "A", isCorrect: rnd() < (strong ? 0.9 : 0.3), responseMs: 20_000,
          partialCredit: rnd() < 0.1 ? 0.5 : null, rapidGuess: rnd() < 0.08, usedHint: rnd() < 0.15, source: ["PRACTICE", "GAME", "REVIEW", "LESSON"][k % 4], difficultyB: Math.round((rnd() * 3 - 1.5) * 100) / 100,
          createdAt: new Date(NOW.getTime() - Math.floor(rnd() * 50) * DAY - k * 60_000),
        } as never);
      }
    }
  });

  test("levelThetas: preloaded answers and the θ-only mode give the same numbers as the plain call", async () => {
    const full = await levelThetas(repo, ids, NOW);
    const rows = await repo.findMany("QuestionAttempt", { studentId: { in: ids } }, { select: LEVEL_THETA_COLUMNS });
    assert.deepEqual(await levelThetas(repo, ids, NOW, { rows }), full, "preloaded answers (a superset of the window)");
    const lite = await levelThetas(repo, ids, NOW, { rows, only: "theta" });
    assert.ok(full.size >= 6);
    for (const [id, f] of full) {
      const l = lite.get(id)!;
      assert.deepEqual({ theta: l.theta, se: l.se, effN: l.effN, answers: l.answers, lastAt: l.lastAt }, { theta: f.theta, se: f.se, effN: f.effN, answers: f.answers, lastAt: f.lastAt }, id);
    }
  });

  test("activityStats = practiceStats for lastActive, recentAnswers and recentAccuracy", async () => {
    const attempts = await repo.findMany("QuestionAttempt", { studentId: { in: ids } });
    const [p, a] = await Promise.all([practiceStats(repo, ids, NOW), activityStats(repo, ids, NOW, attempts)]);
    for (const id of ids) assert.deepEqual(a.get(id), { lastActive: p.get(id)!.lastActive, recentAnswers: p.get(id)!.recentAnswers, recentAccuracy: p.get(id)!.recentAccuracy }, id);
  });

  test("the fast conflict path finds exactly what the full Level Story finds (every student, both directions)", async () => {
    const expected: unknown[] = [];
    for (const id of ids) { const st = await levelStory(repo, admin, id, NOW); if (st.conflict) expected.push(st.conflict); }
    assert.ok(expected.length >= 3, `${expected.length} conflicts in the world`);
    const fast = await levelConflicts(repo, admin, classIds, NOW);
    const key = (x: any) => `${x.className}|${x.name}|${x.studentId}`;
    assert.deepEqual(fast.map((x) => ({ ...x })).sort((a, b) => key(a).localeCompare(key(b))), (expected as any[]).sort((a, b) => key(a).localeCompare(key(b))));
    assert.ok(fast.some((c) => c.high.source === "MAP Reading") && fast.some((c) => /Platform/.test(c.high.source) || /Platform/.test(c.low.source)), "MAP and platform conflicts are both covered");
  });

  test("Data Health rows = a plain recomputation; conflicts as levelConflicts; teacher scope kept", async () => {
    const h = await dataHealth(repo, admin, NOW);
    const p = await practiceStats(repo, ids, NOW);
    const maps = new Set((await repo.findMany("MapResult", {})).map((r) => s(r.studentId)));
    const diag = new Set((await repo.findMany("DiagnosticScore", {})).map((r) => s(r.studentId)));
    const conflicts = await levelConflicts(repo, admin, classIds, NOW);
    assert.deepEqual(h.conflicts, conflicts);
    for (const row of h.rows) {
      const st = (await repo.findMany("ClassMembership", { classId: row.classId, leftAt: null })).map((m) => s(m.studentId));
      const active = (id: string) => (p.get(id)?.lastActive ? new Date(p.get(id)!.lastActive!).getTime() >= NOW.getTime() - 14 * DAY : false);
      assert.deepEqual(row.noMap, st.filter((id) => !maps.has(id)));
      assert.deepEqual(row.noDiagnostic, st.filter((id) => !diag.has(id)));
      assert.deepEqual(row.inactive, st.filter((id) => !active(id)));
      assert.deepEqual(row.noData, st.filter((id) => !maps.has(id) && !diag.has(id) && !((p.get(id)?.recentAnswers ?? 0) >= 10)));
      assert.equal(row.conflicts, conflicts.filter((c) => st.includes(c.studentId)).length);
    }
    const t = await dataHealth(repo, teacher, NOW);
    for (const c of t.conflicts) assert.ok(teacher.teacherStudentIds!.has(c.studentId), "a teacher sees only their students");
  });

  test("no per-student queries: Data Health reads each table once, whatever the number of students", async () => {
    let n = 0;
    const counting = new Proxy(repo, { get(target, prop, recv) { const v = Reflect.get(target, prop, recv); return typeof v === "function" && ["findMany", "findUnique", "count"].includes(String(prop)) ? (...a: unknown[]) => { n++; return (v as Function).apply(target, a); } : v; } });
    await dataHealth(counting as never, admin, NOW);
    const all = n; n = 0;
    await dataHealth(counting as never, teacher, NOW);
    assert.ok(all <= 16, `${all} queries for ${ids.length} students`);
    assert.ok(Math.abs(all - n) <= 3, `admin ${all} vs teacher ${n}: the count does not grow with the students`);
  });
});
