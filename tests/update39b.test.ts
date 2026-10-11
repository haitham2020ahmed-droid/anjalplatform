/**
 * Update 39B — adaptive fixes (FAKE data only: the demo school + the Test School).
 *   rapid guesses: invalid Diagnostic / checks never move a level or a tier; teacher alert
 *   hysteresis: the overall level and the tier do not flip-flop; one short check never moves a tier
 *   no tier before evidence ("Not yet screened"); MAP-based provisional tiers, labelled with the MAP season
 *   new student without MAP: grade-default start; the guessing floor (no inflated ability / RIT)
 *   sustained decline detected and alerted; fluency needs two scores; Diagnostic expiry
 *   closing the loop: ReadRise, ReadMaster, live games, word reviews, writing and RTR feed mastery with source tags
 *   MAP labels refresh with the newest test and show season + date
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { loadQuestionItems } from "../src/server/practice/items";
import { guessingFloor, effectiveGuessing } from "../src/adaptive/guessing";
import { estimateAbilityEAP } from "../src/adaptive/irt";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY } from "../src/config/engine";
import { computeMastery } from "../src/mastery/mastery";
import { ritPosterior } from "../src/server/map/map-plan";
import {
  diagnosticValid, fluencySummary, isDeclining, isInvalidResult, isTrendDeclining, levelThetaOf, levelForTheta, levelThetas, nextLevelState, pooledTheta, refreshLevelStates,
  THETA_ABOVE, THETA_BELOW, THETA_MARGIN, LEVEL_MIN_NEW_ANSWERS, type LevelStateLike,
} from "../src/server/curriculum-map/level-evidence";
import { evidenceLevels } from "../src/server/curriculum-map/evidence-level";
import { checkSignal, decideTier, mapLabel, NOT_SCREENED_TEXT, TIER_RULES, type CheckPoint, type TierEvidenceInput } from "../src/server/tiers/rules";
import { computeTiers } from "../src/server/tiers/tiers";
import { findAlerts, scanAlerts } from "../src/server/insights/alerts";
import { mapSummaries } from "../src/server/insights/student-data";
import { feedReadRise, feedRespond, feedVocabulary, feedWriting, gradeSkillFamilies, RR_SKILL_MAP } from "../src/server/practice/skill-evidence";
import { createGame, hostAction, joinGame, answerGame } from "../src/server/game/live";
import { openWeeklyCheck, gradeDefaultRit, NO_MAP_EASIER_RIT, WEEKLY_CHECK_SIZE } from "../src/server/student/weekly-check";
import { groupPools, GROUPS } from "../src/server/map/map-plan";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const ROOT = process.cwd();
const NOW = new Date(Date.UTC(2026, 9, 14, 9));
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);
const base = (over: Partial<TierEvidenceInput> = {}): TierEvidenceInput => ({
  current: null, diagnostic: null, map: null, checks: [], practice: { avgMastery: 70, skills: 3, weakSkill: null },
  risk: 20, riskHistory: [], fluency: null, interventions: [], ...over,
});
const chk = (n: number, theta: number, items = 8, pct = 50): CheckPoint => ({ at: ago(n), pct, kind: "WEEKLY", items, theta, se: 0.6 });

describe("Update 39B · pure rules", () => {
  test("guessing floor: c = 1/options for multiple choice, 0.5 true/false, 0 constructed; a stored higher c is kept", () => {
    assert.equal(guessingFloor("MULTIPLE_CHOICE", 4), 0.25);
    assert.equal(guessingFloor("DROPDOWN", 3), 1 / 3);
    assert.equal(guessingFloor("TRUE_FALSE", null), 0.5);
    for (const t of ["FILL_BLANK", "SENTENCE_ORDER", "MATCHING", "MULTI_SELECT", "ERROR_CORRECTION"]) assert.equal(guessingFloor(t, 4), 0);
    assert.equal(effectiveGuessing(0, "MULTIPLE_CHOICE", 4), 0.25);
    assert.equal(effectiveGuessing(0.3, "MULTIPLE_CHOICE", 4), 0.3);
    assert.equal(DEFAULT_ADAPTIVE.model, 3, "3PL with the fixed floor is the default model");
    assert.equal(DEFAULT_ADAPTIVE.rapidGuessWeight, 0, "rapid guesses carry no evidence");
  });

  test("guessing floor effect: chance-level answers on 4-option items no longer read as ability", () => {
    // 60% correct on grade-level 4-option items: c = 0 reads it as above grade level, the floor does not
    const resp = Array.from({ length: 30 }, (_, i) => ({ a: 1, b: 0, credit: i % 5 < 3 ? 1 : 0, weight: 1 }));
    const opts = { priorMean: 0, priorSD: 1, thetaMin: -3, thetaMax: 3, model: 3 as const };
    const naive = estimateAbilityEAP(resp.map((r) => ({ ...r, c: 0 })), opts).theta;
    const floor = estimateAbilityEAP(resp.map((r) => ({ ...r, c: 0.25 })), opts).theta;
    assert.ok(naive > 0.3 && floor < naive - 0.4, `c=0 → ${naive.toFixed(2)}, c=0.25 → ${floor.toFixed(2)}`);
    // the RIT estimate too: a new student answering 9 of 15 four-option items right at RIT 210 stays near 210
    const b = Array.from({ length: 15 }, () => 210), x = b.map((_, i) => (i % 5 < 3 ? 1 : 0));
    const rNaive = ritPosterior(b, x, 210), rFloor = ritPosterior(b, x, 210, 10, b.map(() => 0.25));
    assert.ok(rFloor < rNaive && rFloor <= 211, `RIT ${rNaive.toFixed(1)} → ${rFloor.toFixed(1)}`);
    // mastery: 20 rapid lucky clicks manufacture no mastery (weight 0)
    const rapid = Array.from({ length: 20 }, (_, i) => ({ itemId: `q${i}`, correct: true, level: 4, a: 1, b: 0, c: 0.25, responseMs: 900, estimatedSeconds: 40, usedHint: false, at: ago(1).toISOString() }));
    assert.equal(computeMastery(rapid, 1.5, DEFAULT_MASTERY, DEFAULT_ADAPTIVE, NOW).score, 0);
  });

  test("level hysteresis: the θ boundary must be crossed by the margin; a new level needs 12+ answers and 2 evaluations", () => {
    assert.equal(levelForTheta(THETA_ABOVE + 0.05), "ABOVE", "no current level: plain boundary");
    assert.equal(levelForTheta(THETA_ABOVE + 0.05, "ON"), "ON", "from On, Above needs the margin");
    assert.equal(levelForTheta(THETA_ABOVE + THETA_MARGIN + 0.01, "ON"), "ABOVE");
    assert.equal(levelForTheta(THETA_ABOVE - 0.05, "ABOVE"), "ABOVE", "and Above is kept until it falls back past the margin");
    assert.equal(levelForTheta(THETA_BELOW + 0.05, "BELOW"), "BELOW");
    let st: LevelStateLike = { level: "ON", source: "PLATFORM", since: ago(30).getTime(), pending: null, pendingSince: null, pendingCount: 0 };
    // alternating evidence (good week / bad week) never changes the level
    const seq = ["ABOVE", "ON", "ABOVE", "ON", "BELOW", "ON", "ABOVE", "ON"] as const;
    let changes = 0;
    seq.forEach((lv, i) => { const r = nextLevelState(st, { level: lv, from: "PLATFORM", reason: "", newAnswers: 40 }, new Date(ago(20).getTime() + i * DAY)); st = r.state; if (r.changed) changes++; });
    assert.equal(changes, 0, "no flip-flop");
    // consistent evidence: changes on the 2nd evaluation, with enough new answers
    const a = nextLevelState(st, { level: "BELOW", from: "PLATFORM", reason: "", newAnswers: LEVEL_MIN_NEW_ANSWERS - 1 }, ago(2));
    assert.equal(a.changed, false);
    const b2 = nextLevelState(a.state, { level: "BELOW", from: "PLATFORM", reason: "", newAnswers: LEVEL_MIN_NEW_ANSWERS - 1 }, ago(1));
    assert.equal(b2.changed, false, "two evaluations but too few new answers");
    assert.match(b2.held!, /answers since the last change/);
    const c = nextLevelState(b2.state, { level: "BELOW", from: "PLATFORM", reason: "", newAnswers: LEVEL_MIN_NEW_ANSWERS }, NOW);
    assert.deepEqual([c.changed, c.state.level], [true, "BELOW"]);
    // the teacher's level is taken at once
    const t = nextLevelState(c.state, { level: "ABOVE", from: "TEACHER", reason: "", newAnswers: 0 }, NOW);
    assert.deepEqual([t.changed, t.state.level, t.state.source], [true, "ABOVE", "TEACHER"]);
  });

  test("decline check, fluency median, Diagnostic validity", () => {
    assert.equal(isDeclining({ theta: -0.9, se: 0.3, effN: 30 }, { theta: 0.2, se: 0.3, effN: 40 }), true);
    assert.equal(isDeclining({ theta: -0.1, se: 0.3, effN: 30 }, { theta: 0.2, se: 0.3, effN: 40 }), false, "a small dip is not a decline");
    assert.equal(isDeclining({ theta: -1.2, se: 0.6, effN: 5 }, { theta: 0.2, se: 0.3, effN: 40 }), false, "one bad day (few answers) is not a decline");
    const one = fluencySummary([{ percentile: 8, wcpm: 60, at: ago(2).getTime(), source: "COACH" }])!;
    assert.deepEqual([one.usable, one.checks], [false, 1], "one Fluency Coach score alone is not used");
    assert.equal(fluencySummary([{ percentile: 8, wcpm: 60, at: ago(2).getTime(), source: "TEACHER" }])!.usable, true, "a teacher's 1:1 benchmark is");
    const three = fluencySummary([{ percentile: 8, wcpm: 60, at: ago(2).getTime(), source: "COACH" }, { percentile: 40, wcpm: 110, at: ago(9).getTime(), source: "COACH" }, { percentile: 45, wcpm: 115, at: ago(16).getTime(), source: "TEACHER" }])!;
    assert.deepEqual([three.percentile, three.usable], [40, true], "median of the last 3: one outlier does not decide");
    assert.equal(diagnosticValid({ rapid: 10, total: 30, at: ago(3).getTime() }, NOW).valid, false);
    assert.match(diagnosticValid({ rapid: 10, total: 30, at: ago(3).getTime() }, NOW).why!, /re-test/);
    assert.equal(diagnosticValid({ rapid: 0, total: 30, at: ago(80).getTime() }, NOW).valid, false, "older than 10 weeks");
    assert.equal(diagnosticValid({ rapid: 2, total: 30, at: ago(20).getTime() }, NOW).valid, true);
    assert.equal(isInvalidResult(3, 8), true);
    assert.equal(isInvalidResult(2, 8), false);
  });

  test("tiers: no tier before evidence; MAP-based tiers are provisional and labelled with the MAP season", () => {
    const none = decideTier(base(), NOW);
    assert.equal(none.tier, 1);
    assert.match(none.reason, new RegExp(NOT_SCREENED_TEXT));
    const early = decideTier(base({ risk: 85, platform: { days: 1, answers: 0 } }), NOW);
    assert.equal(early.tier, 1, "a high early-warning risk on night 1 (no data yet) is not evidence");
    const t3 = decideTier(base({ map: { percentile: 7, at: ago(30), term: "Fall 2026" } }), NOW);
    assert.deepEqual([t3.tier, t3.provisional], [3, true]);
    assert.match(t3.reason, /Provisional \(from Fall MAP/);
    const t2 = decideTier(base({ map: { percentile: 18, at: ago(30), term: "Fall 2026" } }), NOW);
    assert.deepEqual([t2.tier, t2.provisional], [2, true]);
    assert.equal(decideTier(base({ map: { percentile: 40, at: ago(30), term: "Fall 2026" } }), NOW).tier, 1);
    assert.equal(mapLabel("Winter 2027"), "Winter MAP");
    // confirmed / overridden by the first platform checks: two checks at grade level after MAP → back down
    const over = decideTier(base({ current: { tier: 2, since: ago(30) }, map: { percentile: 18, at: ago(30), term: "Fall 2026" }, checks: [chk(14, 0.1), chk(7, 0.2)] }), NOW);
    assert.equal(over.tier, 1);
    const conf = decideTier(base({ current: { tier: 2, since: ago(30) }, map: { percentile: 18, at: ago(30), term: "Fall 2026" }, checks: [chk(14, -0.9), chk(7, -1.0)] }), NOW);
    assert.deepEqual([conf.tier, conf.provisional], [2, false], "confirmed by low checks: no longer provisional");
  });

  test("tiers: one short check never moves a tier; two in a row or one long check do; minimum 14 days unless two sources agree", () => {
    assert.equal(checkSignal(chk(1, -0.9)), "LOW");
    assert.equal(checkSignal(chk(1, -1.8)), "VERY_LOW");
    assert.equal(checkSignal({ at: ago(1), pct: 85, kind: "PROGRESS" }), "STRONG");
    const cur1 = { tier: 1 as const, since: ago(40) };
    assert.equal(decideTier(base({ current: cur1, checks: [chk(7, 0.3), chk(1, -1.0)] }), NOW).tier, 1, "one low 8-item check");
    const two = decideTier(base({ current: cur1, checks: [chk(7, -0.8), chk(1, -1.0)] }), NOW);
    assert.equal(two.tier, 2);
    assert.match(two.reason, /last 2 checks, 16 items: ability/, "the teacher sees the confidence");
    assert.equal(decideTier(base({ current: cur1, checks: [chk(7, 0.3), chk(1, -1.0, TIER_RULES.MIN_ITEMS_ALONE)] }), NOW).tier, 2, "one long check");
    // dwell: 5 days in Tier 1 — two low checks alone wait; with a second source (MAP) it moves at once
    const fresh = { tier: 1 as const, since: ago(5) };
    const held = decideTier(base({ current: fresh, checks: [chk(4, -0.8), chk(1, -1.0)] }), NOW);
    assert.deepEqual([held.tier, held.held], [1, true]);
    assert.equal(decideTier(base({ current: fresh, checks: [chk(4, -0.8), chk(1, -1.0)], map: { percentile: 20, at: ago(30) } }), NOW).tier, 2);
    // exits stay 2 strong checks, one tier at a time, after 14 days
    const cur3 = { tier: 3 as const, since: ago(30) };
    const down = decideTier(base({ current: cur3, checks: [{ at: ago(8), pct: 85, kind: "WEEKLY" }, { at: ago(1), pct: 90, kind: "WEEKLY" }] }), NOW);
    assert.equal(down.tier, 2, "Tier 3 → Tier 2, not straight to Tier 1");
    assert.equal(decideTier(base({ current: { tier: 2, since: ago(6) }, checks: [{ at: ago(5), pct: 85, kind: "WEEKLY" }, { at: ago(1), pct: 90, kind: "WEEKLY" }] }), NOW).tier, 2, "not before 14 days");
  });

  test("tiers: rapid-guessed checks and Diagnostics never move a tier; stale or contradicted Diagnostics expire; one coach fluency score does not count", () => {
    const cur1 = { tier: 1 as const, since: ago(40) };
    const bad: CheckPoint[] = [{ ...chk(7, -2), invalid: true, rapid: 6 }, { ...chk(1, -2), invalid: true, rapid: 5 }];
    const r = decideTier(base({ current: cur1, checks: bad }), NOW);
    assert.equal(r.tier, 1);
    assert.match(r.reason, /rapid guesses — re-test/);
    assert.equal(decideTier(base({ diagnostic: { pct: 10, level: "BELOW", at: ago(5), valid: false, why: "invalid: 20 of 30 answers were rapid guesses — re-test" } }), NOW).tier, 1);
    const alone = decideTier(base({ diagnostic: { pct: 40, level: "BELOW", at: ago(5) } }), NOW);
    assert.equal(alone.tier, 1, "one Diagnostic alone never sets a tier (item 7)");
    assert.match(alone.reason, /one test alone does not set a tier/);
    const fl = { fluency: { percentile: 30, wcpm: 90, at: ago(2), usable: true, checks: 2 } };
    assert.equal(decideTier(base({ diagnostic: { pct: 40, level: "BELOW", at: ago(5) }, ...fl }), NOW).tier, 2, "a valid recent Diagnostic Below with fluency under the 40th counts");
    assert.equal(decideTier(base({ diagnostic: { pct: 40, level: "BELOW", at: ago(80) }, ...fl }), NOW).tier, 1, "older than 10 weeks");
    assert.equal(decideTier(base({ diagnostic: { pct: 40, level: "BELOW", at: ago(30) }, ...fl, checks: [chk(20, 0.1), chk(10, -0.2)] }), NOW).tier, 1, "contradicted by 2 newer checks");
    assert.equal(decideTier(base({ fluency: { percentile: 12, wcpm: 70, at: ago(2), usable: false, checks: 1 } }), NOW).tier, 1, "one coach score");
    assert.equal(decideTier(base({ fluency: { percentile: 12, wcpm: 70, at: ago(2), usable: true, checks: 2 } }), NOW).tier, 2);
  });

  test("tiers: risk alone is noted, not a tier; MAP under the 10th → Tier 3, 10th–25th → Tier 2; pooled exit; guessed-through interventions are not 'no gain'", () => {
    const r = decideTier(base({ risk: 88, platform: { days: 40, answers: 300 } }), NOW);
    assert.equal(r.tier, 1);
    assert.match(r.reason, /Early-warning risk 88 noted/);
    assert.equal(decideTier(base({ risk: 88, platform: { days: 40, answers: 300 }, level: { level: "BELOW", source: "PLATFORM", declining: false, theta: -0.9 } }), NOW).tier, 2, "with the platform level Below");
    // one low 8-item check does not corroborate (an up-and-down student: +1.6 then −1.3 pools to grade level)
    assert.equal(decideTier(base({ risk: 88, platform: { days: 40, answers: 300 }, checks: [chk(8, 1.6), chk(1, -1.3)] }), NOW).tier, 1);
    assert.equal(decideTier(base({ risk: 88, platform: { days: 40, answers: 300 }, checks: [chk(8, -0.5), chk(1, -1.0)] }), NOW).tier, 2, "two checks that pool low do");
    assert.equal(decideTier(base({ map: { percentile: 9, at: ago(30) } }), NOW).tier, 3);
    assert.equal(decideTier(base({ map: { percentile: 10, at: ago(30) } }), NOW).tier, 2, "10th = Tier 2 (spec: under 10 → Tier 3)");
    // exit: two 8-item checks, neither low, together at grade level (pooled) — one tier at a time
    const cur = { tier: 2 as const, since: ago(30) };
    assert.equal(decideTier(base({ current: cur, checks: [chk(14, -0.4), chk(7, 0.1)] }), NOW).tier, 1, "pooled (−0.15) ≥ −0.3, neither low");
    assert.equal(decideTier(base({ current: cur, checks: [chk(14, -0.7), chk(7, 0.6)] }), NOW).tier, 2, "one of them low: no exit");
    // interventions: guessed through (few careful answers) → not judged; careful work with no gain → counts
    const iv = (n: number, valid: number) => ({ endedAt: ago(n), skillId: "sk", gain: 0, validAnswers: valid });
    const guessed = decideTier(base({ current: { tier: 2, since: ago(40) }, map: { percentile: 20, at: ago(50) }, interventions: [iv(20, 2), iv(5, 3)] }), NOW);
    assert.deepEqual([guessed.tier, guessed.refer], [2, false]);
    const real = decideTier(base({ current: { tier: 2, since: ago(40) }, map: { percentile: 20, at: ago(50) }, interventions: [iv(20, 30), iv(5, 25)] }), NOW);
    assert.deepEqual([real.tier, real.refer], [3, true]);
  });

  test("decline as a trend: a steady 3-week slide is caught, an up-and-down student is not; the level uses the recent θ while declining", () => {
    const w = (theta: number) => ({ theta, se: 0.2, effN: 60 });
    assert.equal(isTrendDeclining([w(-0.1), w(-0.4), w(-0.7)]), true);
    assert.equal(isTrendDeclining([w(-0.1), w(-0.6), w(-0.1)]), false, "up and down");
    assert.equal(isTrendDeclining([w(0.1), w(0.0), w(-0.15)]), false, "too small");
    assert.equal(isTrendDeclining([w(-0.1), null, w(-0.7)]), false, "a week without answers");
    const th = { theta: -0.4, se: 0.1, effN: 300, answers: 300, recent: { theta: -0.9, se: 0.2, effN: 120 }, prior: { theta: -0.1, se: 0.2, effN: 180 }, declining: true, drift: -0.8, lastAt: 0 };
    assert.equal(levelThetaOf(th), -0.9);
    assert.equal(levelThetaOf({ ...th, declining: false }), -0.4);
  });

  test("ReadRise question kinds map to curriculum skills", () => {
    for (const k of ["central-idea", "inference", "vocabulary", "detail", "text-structure", "author-purpose", "cause-effect", "compare", "sequence"]) assert.ok(RR_SKILL_MAP[k]?.length, k);
    assert.equal(RR_SKILL_MAP.vocabulary[0], "context-clues", "vocabulary in context");
    assert.equal(RR_SKILL_MAP.detail[0], "text-evidence");
  });
});

describe("Update 39B · on the Test School", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;
  let classId = ""; let students: string[] = []; let skillId = ""; let qids: string[] = []; let schoolId = ""; let grade = 4;
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  async function answers(studentId: string, ok: boolean[], at: Date, opts: { rapid?: boolean; b?: number; assignmentId?: string } = {}) {
    const sess = await repo.create("PracticeSession", { studentId, skillId, mode: opts.assignmentId ? "TEACHER_QUIZ" : "ADAPTIVE_PRACTICE", assignmentId: opts.assignmentId ?? null, startedAt: at });
    for (let i = 0; i < ok.length; i++) await repo.create("QuestionAttempt", { sessionId: sess.id, studentId, questionId: qids[i % qids.length], skillId, response: { value: "Z" }, isCorrect: ok[i], responseMs: opts.rapid ? 900 : 25_000, rapidGuess: Boolean(opts.rapid), difficultyB: opts.b ?? 0, createdAt: new Date(at.getTime() + i * 60_000) });
    return String(sess.id);
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    schoolId = String(admin.schoolId);
    for (const i of [1, 2, 3, 4, 5, 6]) {
      const t = await actorFor(`test.teacher.${i}`);
      const c = (await readableClasses(repo, t))[0];
      if (!c) continue;
      const g = Number((await repo.findUnique("Grade", { id: c.gradeId }))!.level);
      if (g === 4 && !classId) { teacher = t; classId = String(c.id); }
    }
    students = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    let best = 0;
    for (const k of await repo.findMany("Skill", { curriculumId: cur.id })) {
      const items = await loadQuestionItems(repo, (await repo.findMany("Question", { skillId: k.id, status: "PUBLISHED" })).map((q) => String(q.id)));
      if (items.length > best && items.some((i) => i.type === "MULTIPLE_CHOICE")) { best = items.length; skillId = String(k.id); qids = items.map((i) => i.questionId); }
    }
    assert.ok(skillId);
    await repo.updateMany("Student", { id: { in: students } }, { createdAt: ago(60) });
  });

  test("guessing floor at run time: multiple-choice items carry c = 1/options (no question rewritten)", async () => {
    const items = await loadQuestionItems(repo, qids);
    const mc = items.find((i) => i.type === "MULTIPLE_CHOICE")!;
    assert.equal(mc.irt.c, 1 / mc.options!.length);
    const q = (await repo.findUnique("Question", { id: mc.questionId }))!;
    assert.equal(Number(q.irtC), 0, "the stored question is unchanged");
  });

  test("rapid-guessed Diagnostic: invalid — no level, no tier, a teacher alert to re-test", async () => {
    const sid = students[0];
    await repo.create("DiagnosticScore", { diagnosticId: "dg-x", studentId: sid, assignmentId: "a-x", correct: 2, total: 30, pct: 6.7, level: "BELOW", byStandard: [], byStrand: [], rapid: 25, minutes: 2, completedAt: ago(2) });
    const ev = (await evidenceLevels(repo, schoolId, [sid], grade, {}, NOW)).get(sid)!;
    assert.notEqual(ev.from, "PLACEMENT");
    await computeTiers(repo, schoolId, NOW, { studentIds: [sid], notify: false, route: false });
    const t = (await repo.findUnique("StudentTier", { studentId: sid }))!;
    assert.equal(Number(t.tier), 1, String(t.reason));
    const alerts = await findAlerts(repo, schoolId, NOW);
    const a = alerts.find((x) => x.studentId === sid && x.kind === "INVALID_TEST");
    assert.ok(a, "INVALID_TEST alert");
    assert.match(a!.detail, /Invalid — re-test/);
  });

  test("no day-1 tier without evidence; a MAP-only tier is provisional and says which MAP", async () => {
    const [a, b] = [students[1], students[2]];
    await repo.create("MapResult", { studentId: b, testDate: new Date("2026-09-15T00:00:00Z"), subject: "Reading", goalName: null, rit: 175, achievementPercentile: 8, termName: "Fall 2026", importedAt: NOW });
    await computeTiers(repo, schoolId, NOW, { studentIds: [a, b], notify: false, route: false });
    const ta = (await repo.findUnique("StudentTier", { studentId: a }))!, tb = (await repo.findUnique("StudentTier", { studentId: b }))!;
    assert.equal(Number(ta.tier), 1);
    assert.match(String(ta.reason), /Not yet screened/);
    assert.equal(Number(tb.tier), 3);
    assert.match(String(tb.reason), /Provisional \(from Fall MAP/);
    assert.match(String(tb.reason), /Fall MAP \(2026-09-15\)/);
  });

  test("two weeks of weaker answers: the decline is detected, alerted, and the level moves down only once confirmed", async () => {
    const sid = students[3];
    for (let d = 40; d >= 16; d -= 3) await answers(sid, [true, true, true, false, true, true, true, true], ago(d));          // good weeks
    let st = await refreshLevelStates(repo, schoolId, ago(15));
    const before = (await repo.findUnique("StudentLevelState", { studentId: sid }))!;
    assert.notEqual(String(before.level), "BELOW");
    for (let d = 13; d >= 1; d -= 2) await answers(sid, [false, false, true, false, false, false, true, false], ago(d)); // the drop
    st = await refreshLevelStates(repo, schoolId, ago(0.5));
    let s1 = (await repo.findUnique("StudentLevelState", { studentId: sid }))!;
    assert.equal(Boolean(s1.declining), true, JSON.stringify({ recent: s1.thetaRecent, prior: s1.thetaPrior }));
    assert.ok(st.declining >= 1);
    assert.equal(String(s1.level), String(before.level), "not on one evaluation");
    assert.equal(String(s1.pending), "BELOW");
    await refreshLevelStates(repo, schoolId, NOW);
    s1 = (await repo.findUnique("StudentLevelState", { studentId: sid }))!;
    assert.equal(String(s1.level), "BELOW", "confirmed on the second evaluation");
    const log = (await repo.findMany("AuditLog", { entityId: sid, action: "level.change" })).map((l) => (typeof l.after === "string" ? JSON.parse(l.after) : l.after)).find((a) => a.category === "OVERALL" && a.level === "BELOW");
    assert.ok(log && log.evidence && log.evidence.declining === true, "level history keeps the evidence");
    const alerts = await findAlerts(repo, schoolId, NOW);
    assert.ok(alerts.some((x) => x.studentId === sid && x.kind === "DECLINING"));
    const ev = (await evidenceLevels(repo, schoolId, [sid], grade, {}, NOW)).get(sid)!;
    assert.equal(ev.level, "BELOW");
    // the stored alert closes itself once the daily check no longer sees a decline
    await scanAlerts(repo, schoolId, NOW, true);
    assert.equal((await repo.findMany("StudentAlert", { studentId: sid, kind: "DECLINING", status: "OPEN" })).length, 1);
    await repo.updateMany("StudentLevelState", { studentId: sid }, { declining: false });
    await scanAlerts(repo, schoolId, new Date(NOW.getTime() + 86_400_000), true);
    const closed = (await repo.findMany("StudentAlert", { studentId: sid, kind: "DECLINING" }))[0];
    assert.equal(String(closed.status), "HANDLED");
    assert.match(String(closed.action), /Cleared automatically/);
  });

  test("fluency: one Fluency Coach score does not change the level; two do (median)", async () => {
    const sid = students[4];
    await repo.create("MapResult", { studentId: sid, testDate: new Date("2026-09-15T00:00:00Z"), subject: "Reading", goalName: null, rit: 214, achievementPercentile: 75, termName: "Fall 2026", importedAt: NOW });
    const lv0 = (await evidenceLevels(repo, schoolId, [sid], grade, {}, NOW)).get(sid)!.level;
    await repo.create("FluencyCheck", { studentId: sid, wcpm: 40, percentile: 5, source: "COACH", checkedAt: ago(3) });
    const one = (await evidenceLevels(repo, schoolId, [sid], grade, {}, NOW)).get(sid)!;
    assert.equal(one.level, lv0);
    assert.match(one.why, /not used until a second check/);
    await repo.create("FluencyCheck", { studentId: sid, wcpm: 42, percentile: 6, source: "COACH", checkedAt: ago(1) });
    const two = (await evidenceLevels(repo, schoolId, [sid], grade, {}, NOW)).get(sid)!;
    if (lv0 === "ABOVE") assert.equal(two.level, "ON", "two weak fluency scores move it one band (never two)");
  });

  test("Diagnostic Below older than 10 weeks no longer sets the level", async () => {
    const sid = students[5];
    await repo.create("DiagnosticScore", { diagnosticId: "dg-old", studentId: sid, assignmentId: "a-old", correct: 10, total: 30, pct: 33, level: "BELOW", byStandard: [], byStrand: [], rapid: 0, minutes: 30, completedAt: ago(90) });
    await repo.upsert("StudentLevel", { studentId: sid }, { level: "BELOW", source: "PLACEMENT", updatedAt: ago(90) }, { level: "BELOW", source: "PLACEMENT", updatedAt: ago(90) });
    assert.notEqual((await evidenceLevels(repo, schoolId, [sid], grade, {}, NOW)).get(sid)!.from, "PLACEMENT");
    await repo.updateMany("DiagnosticScore", { diagnosticId: "dg-old" }, { completedAt: ago(10) });
    assert.equal((await evidenceLevels(repo, schoolId, [sid], grade, {}, NOW)).get(sid)!.from, "PLACEMENT", "a recent one still does");
  });

  test("new student without MAP: the first Weekly Check (8 items) starts at the grade's typical RIT, leaning easier", async () => {
    const sid = students[6];
    const me = await studentActor(sid);
    const href = await openWeeklyCheck(repo, me, NOW);
    assert.ok(href);
    const wc = (await repo.findMany("WeeklyCheck", { studentId: sid }))[0];
    const norm = await gradeDefaultRit(repo, grade, NOW);
    assert.ok(norm, "grade norm");
    const pk = await groupPools(repo, schoolId, grade);
    const ritOf = new Map(GROUPS.flatMap((g) => (pk.pools.get(g.key) ?? []).map((q) => [q.id, q.rit] as const)));
    const qs = (await repo.findMany("AssessmentQuestion", { assessmentId: (await repo.findUnique("Assignment", { id: wc.assignmentId }))!.assessmentId })).map((r) => ritOf.get(String(r.questionId))).filter((x): x is number => typeof x === "number");
    assert.ok(Number(wc.total) <= WEEKLY_CHECK_SIZE && WEEKLY_CHECK_SIZE === 8);
    if (qs.length >= 3) { const mean = qs.reduce((a, b) => a + b, 0) / qs.length; assert.ok(Math.abs(mean - (norm! - NO_MAP_EASIER_RIT)) <= 8, `items around ${mean.toFixed(0)} vs grade ${norm}`); }
  });

  test("closing the loop: ReadRise, live game, word review, writing and RTR feed mastery with a source tag, never twice", async () => {
    const sid = students[7];
    // ReadRise: an inference question and a vocabulary question on a run read for 4 minutes
    const run = await repo.create("RRRun", { studentId: sid, schoolId, articleId: "rr-art", versionLevel: 700, band: "MID", step: "WRITE", answers: { "1": "B", "2": "A" }, score: 100, readSeconds: 240, levelBefore: 700, startedAt: ago(1), completedAt: ago(1) });
    await repo.create("RRQuestion", { articleId: "rr-art", band: "MID", number: 1, stem: "Why?", options: ["a", "b", "c", "d"], answer: "B", skill: "inference" });
    await repo.create("RRQuestion", { articleId: "rr-art", band: "MID", number: 2, stem: "Means?", options: ["a", "b", "c", "d"], answer: "A", skill: "vocabulary" });
    const n1 = await feedReadRise(repo, String(run.id), ago(1));
    assert.equal(n1, 2);
    assert.equal(await feedReadRise(repo, String(run.id), ago(1)), 0, "no double counting");
    const ev = await repo.findMany("SkillEvidence", { studentId: sid, source: "READRISE" });
    assert.equal(ev.length, 2);
    const inf = { id: (await gradeSkillFamilies(repo, sid)).family.get("inference")! };
    assert.ok(inf && ev.some((e) => e.skillId === inf.id));
    const m = await repo.findUnique("StudentSkillMastery", { studentId: sid, skillId: inf.id });
    assert.ok(m && Number(m.score) > 0 && Number(m.attempts) === 0, "mastery moved; the answer count (saved answers) did not");
    // a rapid run is left out
    const fast = await repo.create("RRRun", { studentId: sid, schoolId, articleId: "rr-art", versionLevel: 700, band: "MID", step: "WRITE", answers: { "1": "B" }, score: 50, readSeconds: 12, levelBefore: 700, startedAt: NOW, completedAt: NOW });
    assert.equal(await feedReadRise(repo, String(fast.id), NOW), 0);
    // live game: the answer is recorded for the game only (no QuestionAttempt — Games Part 1)
    const tSkill = (await repo.findMany("Question", { id: { in: qids } }))[0];
    const g: any = await createGame(repo, teacher, { title: "TEST game", skillIds: [String(tSkill.skillId)], classId, count: 3, seconds: 20 }, NOW);
    const me = await studentActor(sid);
    await joinGame(repo, me, g.code, NOW);
    await hostAction(repo, teacher, g.id, "start", NOW);
    const row = (await repo.findUnique("LiveGame", { id: g.id }))!;
    const gq = (typeof row.questionIds === "string" ? JSON.parse(row.questionIds) : row.questionIds) as string[];
    const q0 = (await loadQuestionItems(repo, [gq[0]]))[0];
    const right = q0.options?.find((o) => o.correct)?.label ?? "A";
    await answerGame(repo, me, g.id, 0, right, new Date(NOW.getTime() + 8000));
    // Games Part 1 (owner rule: games never change levels, mastery or scores): a game answer no longer feeds the engine
    const att = await repo.findMany("QuestionAttempt", { studentId: sid, source: "GAME" });
    assert.equal(att.length, 0);
    // word review → Context Clues when the curriculum has no Concept Vocabulary skill (the word is shown in its sentence)…
    const fam = (await gradeSkillFamilies(repo, sid)).family;
    assert.equal(await feedVocabulary(repo, sid, [{ word: "quiet", correct: true }], NOW), 1);
    assert.equal(String((await repo.findMany("SkillEvidence", { studentId: sid, source: "VOCAB" }))[0].skillId), fam.get("context-clues"));
    // …and → Concept Vocabulary when it has that skill
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const like = (await repo.findUnique("Skill", { id: inf.id }))!;
    const { id: _id, ...copy } = like;
    const cv = await repo.create("Skill", { ...copy, code: "G4.concept-vocabulary", name: "Concept Vocabulary", sequence: 999 });
    assert.equal(await feedVocabulary(repo, sid, [{ word: "brave", correct: true }, { word: "calm", correct: false }], NOW), 2);
    assert.ok(await repo.findUnique("StudentSkillMastery", { studentId: sid, skillId: cv.id }));
    // writing (after grading) and Respond to Reading (marked)
    assert.ok(await feedWriting(repo, sid, "task-1", { ideas: 3, organization: 3, language: 2, conventions: 2 }, "NARRATIVE", NOW) >= 1);
    assert.equal(await feedRespond(repo, sid, "rtr-1", 3, NOW), 1);
    assert.equal(await feedRespond(repo, sid, "rtr-1", 3, NOW), 0, "once per marked response");
    const sources = new Set((await repo.findMany("SkillEvidence", { studentId: sid })).map((r) => String(r.source)));
    assert.deepEqual([...sources].sort(), ["READRISE", "RTR", "VOCAB", "WRITING"]);
  });

  test("ReadMaster answers become engine attempts (source READMASTER)", async () => {
    const { recordEngineAttempt } = await import("../src/server/lessons/run");
    const sid = students[8] ?? students[0];
    const it = (await loadQuestionItems(repo, [qids[0]]))[0];
    const ses = await repo.create("PracticeSession", { studentId: sid, mode: "ADAPTIVE_PRACTICE", startedAt: NOW, endedAt: NOW, endReason: "READMASTER" });
    await recordEngineAttempt(repo, { sessionId: String(ses.id), studentId: sid, skillId: String(it.skillKey), schoolId, item: it, response: null, credit: 1, usedHint: false, responseMs: 40_000, now: NOW, reasonCode: "READMASTER", source: "READMASTER" });
    assert.equal((await repo.findMany("QuestionAttempt", { studentId: sid, source: "READMASTER" })).length, 1);
    assert.ok(await repo.findUnique("StudentSkillMastery", { studentId: sid, skillId: String(it.skillKey) }));
  });

  test("MAP labels show their season and date, and follow the newest test", async () => {
    const sid = students[9] ?? students[1];
    await repo.create("MapResult", { studentId: sid, testDate: new Date("2026-09-15T00:00:00Z"), subject: "Reading", goalName: null, rit: 180, achievementPercentile: 12, termName: "Fall 2026", importedAt: NOW, projectedGrowth: 8 });
    let m = (await mapSummaries(repo, [sid], "READING", new Map([[sid, 4]]))).get(sid)!;
    assert.equal(m.asOf, "Fall MAP · 2026-09-15");
    assert.equal(m.status, "AT_RISK");
    assert.match(m.statusWhy, /Fall MAP · 2026-09-15/);
    await repo.create("MapResult", { studentId: sid, testDate: new Date("2027-01-20T00:00:00Z"), subject: "Reading", goalName: null, rit: 195, achievementPercentile: 45, termName: "Winter 2027", importedAt: NOW });
    m = (await mapSummaries(repo, [sid], "READING", new Map([[sid, 4]]))).get(sid)!;
    assert.equal(m.asOf, "Winter MAP · 2027-01-20");
    assert.equal(m.status, "ON_TRACK", "the Fall 'at risk' label is replaced by the Winter result");
  });
});
