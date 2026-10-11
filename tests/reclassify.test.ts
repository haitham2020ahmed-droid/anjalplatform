/**
 * 🔁 Automatic re-classification from students' FIRST answers (src/server/questions/reclassify.ts):
 * first attempt only (no retries, rapid guesses or hints), per grade, On-level basis with the non-adaptive fallback,
 * thresholds + difficulty steps, hysteresis, the 7-day limit, a person's level → a suggestion (approval applies and
 * logs), every alert kind, held-back questions out of adaptive pools, school scoping, and the daily hook.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { LEVEL_TO_B } from "../src/config/engine";
import {
  alertsFor, decide, difficultyStep, gradeStat, isManualLevel, nextLevel, pointBiserial, releaseHold, runReclassify, setAlertStatus,
  LAST_RUN_KEY, NOTICE_KEY, type Response,
} from "../src/server/questions/reclassify";
import { heldBackQuestionIds } from "../src/server/questions/held-back";
import { alertList, levelChangeList, questionData } from "../src/server/admin/question-data";
import { reviewSuggestion } from "../src/server/ai/jobs";
import { getQuestion, updateDraft } from "../src/server/admin/questions";
import { loadItemsForSkills } from "../src/server/practice/items";
import { runDaily } from "../src/server/insights/daily";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const DAY = 86_400_000, HOUR = 3_600_000;
const s = (v: unknown) => String(v ?? "");

// ------------------------------------------------------------------ pure rules

describe("reclassify: rules", () => {
  test("difficulty steps: >90 → 2, 80–90 → 3, 40–80 → 4, 25–40 → 5, <25 → 6", () => {
    assert.deepEqual([95, 90.5, 90, 85, 80.5, 80, 60, 40, 39.9, 25, 24.9, 5].map(difficultyStep), [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6]);
  });

  test("thresholds with 2 points of hysteresis at 80 and 40", () => {
    assert.equal(nextLevel("ON", 82), "ON", "82 is inside the band");
    assert.equal(nextLevel("ON", 82.1), "BELOW");
    assert.equal(nextLevel("ON", 38), "ON");
    assert.equal(nextLevel("ON", 37.9), "ABOVE");
    assert.equal(nextLevel("BELOW", 79), "BELOW", "a Below question needs < 78 to come back");
    assert.equal(nextLevel("BELOW", 77.9), "ON");
    assert.equal(nextLevel("BELOW", 20), "ABOVE");
    assert.equal(nextLevel("ABOVE", 41), "ABOVE");
    assert.equal(nextLevel("ABOVE", 42.1), "ON");
    assert.equal(nextLevel("ABOVE", 95), "BELOW");
  });

  test("decide: level and difficulty in step, never out of the level", () => {
    assert.deepEqual(decide(4, 93), { level: "BELOW", difficulty: 2 });
    assert.deepEqual(decide(4, 85), { level: "BELOW", difficulty: 3 });
    assert.deepEqual(decide(4, 30), { level: "ABOVE", difficulty: 5 });
    assert.deepEqual(decide(4, 10), { level: "ABOVE", difficulty: 6 });
    assert.deepEqual(decide(4, 60), { level: "ON", difficulty: 4 });
    assert.deepEqual(decide(4, 81), { level: "ON", difficulty: 4 }, "hysteresis keeps it On");
    assert.deepEqual(decide(3, 95), { level: "BELOW", difficulty: 2 }, "same level, clearly past the 90 edge");
    assert.deepEqual(decide(3, 91), { level: "BELOW", difficulty: 3 }, "within 2 points of an edge: no step");
    assert.deepEqual(decide(5, 10), { level: "ABOVE", difficulty: 6 });
    assert.deepEqual(decide(1, 99), { level: "BELOW", difficulty: 1 }, "an authored extreme the data agrees with is kept");
    assert.deepEqual(decide(7, 3), { level: "ABOVE", difficulty: 7 });
  });

  test("a person's level is manual; imported, AI-estimated and data levels are automatic", () => {
    assert.equal(isManualLevel({ difficultySource: "MANUAL" }), true);
    assert.equal(isManualLevel({ difficultySource: "TEACHER" }), true);
    assert.equal(isManualLevel({ difficultySource: "AUTHORED", metaReviewedAt: new Date() }), true, "metadata confirmed by a person");
    assert.equal(isManualLevel({ difficultySource: null, tags: JSON.stringify({ review: { status: "VERIFIED" } }) }), true);
    assert.equal(isManualLevel({ difficultySource: "ESTIMATE", metaReviewedAt: new Date() }), false, "an approved AI estimate still changes automatically");
    assert.equal(isManualLevel({ difficultySource: "DATA" }), false);
    assert.equal(isManualLevel({ difficultySource: null }), false, "imported");
    assert.equal(isManualLevel({ difficultySource: "CALIBRATED" }), false);
  });

  const R = (correct: boolean, ability: number | null, extra: Partial<Response> = {}): Response => ({ studentId: "x", correct, ms: 20_000, chosen: correct ? "A" : "B", ability, onLevel: true, nonAdaptive: true, at: 0, ...extra });

  test("point-biserial: positive when strong students are right, negative when they are wrong", () => {
    const healthy = Array.from({ length: 60 }, (_, i) => ({ correct: i >= 30, ability: i / 30 - 1 }));
    assert.ok(pointBiserial(healthy)! > 0.5);
    assert.ok(pointBiserial(healthy.map((r) => ({ ...r, correct: !r.correct })))! < -0.5);
    assert.equal(pointBiserial(healthy.map((r) => ({ ...r, correct: true }))), null, "no wrong group");
  });

  test("each alert kind, only with 30+ first answers", () => {
    const kinds = (rs: Response[], wrong = ["B", "C", "D"], slow: number | null = null) => alertsFor(gradeStat(rs, wrong), 4, slow).map((a) => a.kind).sort();
    const spread = (i: number) => ["B", "C", "D"][i % 3];
    assert.deepEqual(kinds(Array.from({ length: 30 }, (_, i) => R(i < 5, null, { chosen: i < 5 ? "A" : spread(i) }))), ["KEY_SUSPECT"], "17% right");
    assert.deepEqual(kinds(Array.from({ length: 29 }, () => R(false, null))), [], "29 answers: nothing yet");
    assert.deepEqual(kinds(Array.from({ length: 30 }, (_, i) => R(i < 12, null, { chosen: i < 12 ? "A" : "B" }))), ["DISTRACTOR_MAGNET"], "60% chose B");
    assert.deepEqual(kinds(Array.from({ length: 30 }, () => R(true, null))), ["TOO_EASY"]);
    assert.deepEqual(kinds(Array.from({ length: 30 }, (_, i) => R(i < 18, null, { chosen: i < 18 ? "A" : spread(i), ms: 90_000 })), undefined, 20_000), ["SLOW"]);
    const neg = Array.from({ length: 60 }, (_, i) => R(i < 30, i / 30 - 1, { chosen: i < 30 ? "A" : spread(i) }));
    assert.deepEqual(kinds(neg), ["NEGATIVE_DISCRIMINATION"]);
    assert.deepEqual(kinds(neg.slice(10, 50)), [], "negative discrimination needs 50+ answers with an ability");
  });
});

// ------------------------------------------------------------------ the database side

describe("reclassify: daily run on the demo school", () => {
  let repo: SqliteRepo; let admin: Actor; let schoolId: string;
  let G4: string[], G5: string[], G6: string[];
  let SK: string, G6SK: string, mcType: string;
  const pool: string[] = [];
  const T0 = Date.now();
  const at = (days: number) => new Date(T0 + days * DAY);
  let q: Record<string, string> = {};

  /** One first answer (and optional extras) per student, each in its own session. */
  async function answer(qid: string, students: string[], o: { right: (i: number) => boolean; when: Date; mode?: string; rapid?: (i: number) => boolean; hint?: (i: number) => boolean; sessionHint?: (i: number) => boolean; wrong?: (i: number) => string; ms?: number }) {
    const qq = (await repo.findUnique("Question", { id: qid }))!;
    // the question's own labels: "A" in a scenario = its key, "B"/"C"/"D" = its 1st/2nd/3rd wrong option
    const opts = await repo.findMany("QuestionOption", { questionId: qid }, { orderBy: [{ field: "label" }] });
    const key = s(opts.find((x) => x.isCorrect)!.label), wrongs = opts.filter((x) => !x.isCorrect).map((x) => s(x.label));
    const label = (l: string) => (l === "A" ? key : wrongs[(l.charCodeAt(0) - 66) % wrongs.length]);
    for (let i = 0; i < students.length; i++) {
      const right = o.right(i);
      const sess = await repo.create("PracticeSession", { studentId: students[i], skillId: qq.skillId, mode: o.mode ?? "ADAPTIVE_PRACTICE", startedAt: o.when, hintQuestionId: o.sessionHint?.(i) ? qid : null });
      await repo.create("QuestionAttempt", {
        sessionId: sess.id, studentId: students[i], questionId: qid, skillId: qq.skillId, response: { value: label(right ? "A" : (o.wrong?.(i) ?? ["B", "C", "D"][i % 3])) }, isCorrect: right,
        responseMs: o.ms ?? 20_000, usedHint: Boolean(o.hint?.(i)), rapidGuess: Boolean(o.rapid?.(i)), difficultyB: 0, createdAt: new Date(o.when.getTime() + i),
      });
    }
  }
  const stat = async (qid: string, grade: number) => (await repo.findMany("QuestionGradeStat", { questionId: qid, grade }))[0];
  const question = async (qid: string) => (await repo.findUnique("Question", { id: qid }))!;
  const alertKinds = async (qid: string) => (await repo.findMany("QuestionAlert", { questionId: qid })).map((a) => s(a.kind)).sort();

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 35 }));
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = s(admin.schoolId);
    const grades = await repo.findMany("Grade", { schoolId });
    const byLevel = (lv: number) => s(grades.find((g) => Number(g.level) === lv)!.id);
    const studentsOf = async (lv: number) => (await repo.findMany("Student", { gradeId: byLevel(lv) }, { orderBy: [{ field: "id" }] })).map((x) => s(x.id));
    [G4, G5, G6] = [await studentsOf(4), await studentsOf(5), await studentsOf(6)];
    mcType = s((await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" }))!.id);
    const mc = await repo.findMany("Question", { status: "PUBLISHED", typeId: mcType });
    const per = new Map<string, string[]>();
    for (const x of mc) per.set(s(x.skillId), [...(per.get(s(x.skillId)) ?? []), s(x.id)]);
    const [big] = [...per.entries()].sort((a, b) => b[1].length - a[1].length);
    SK = big[0]; pool.push(...big[1]);
    const g6cur = (await repo.findMany("Curriculum", { gradeId: byLevel(6) }))[0];
    G6SK = s((await repo.findMany("Skill", { curriculumId: g6cur.id }))[0].id);
    const names = ["onBasis", "above", "hyst", "limit", "manual", "keySuspect", "magnet", "negDisc", "tooEasy", "slow", "fallback", "fallbackShort", "daily"];
    q = Object.fromEntries(names.map((n, i) => [n, pool[i]]));
    // every test question starts at difficulty 4, imported (no source), uncalibrated
    await repo.updateMany("Question", { id: { in: Object.values(q) } }, { difficultyLevel: 4, irtB: LEVEL_TO_B[4], difficultySource: null, calibrated: false, metaReviewedAt: null });
    await repo.updateMany("Question", { id: q.manual }, { difficultySource: "MANUAL" });
    await repo.updateMany("Question", { id: { in: [q.fallback, q.fallbackShort] } }, { skillId: G6SK });
    // Grade 4 levels (chosen by the teacher): 0–49 On, 50–59 Below, 60–69 Above; abilities spread −1…+1.3
    for (let i = 0; i < G4.length; i++) {
      await repo.create("StudentLevel", { studentId: G4[i], level: i < 50 ? "ON" : i < 60 ? "BELOW" : "ABOVE", source: "TEACHER", setById: null });
      await repo.create("StudentAbility", { studentId: G4[i], scope: "GLOBAL", theta: i / 30 - 1, thetaSE: 0.3, responses: 20 });
    }

    const t = at(0);
    // on-level basis: on-level 28/30 right; 15 Below-level students all wrong (overall only 62%); retries,
    // rapid guesses and hinted first answers never count
    await answer(q.onBasis, G4.slice(0, 30), { right: (i) => i >= 2, when: new Date(t.getTime() - 3 * HOUR) });
    await answer(q.onBasis, G4.slice(0, 2), { right: () => true, when: new Date(t.getTime() - 2 * HOUR) }); // retries: right now, still wrong
    await answer(q.onBasis, G4.slice(30, 35), { right: () => false, rapid: () => true, when: new Date(t.getTime() - 2 * HOUR) });
    await answer(q.onBasis, G4.slice(30, 35), { right: () => true, when: new Date(t.getTime() - HOUR) }); // their retry is not a first answer
    await answer(q.onBasis, G4.slice(35, 38), { right: () => false, hint: () => true, when: new Date(t.getTime() - 2 * HOUR) });
    await answer(q.onBasis, G4.slice(38, 40), { right: () => false, sessionHint: () => true, when: new Date(t.getTime() - 2 * HOUR) });
    await answer(q.onBasis, G4.slice(50, 60), { right: () => false, when: new Date(t.getTime() - 2 * HOUR) });
    await answer(q.onBasis, G5.slice(0, 34), { right: (i) => i % 2 === 0, when: new Date(t.getTime() - 2 * HOUR) }); // Grade 5: information only
    // above: 9/30 right
    await answer(q.above, G4.slice(0, 30), { right: (i) => i < 9, when: new Date(t.getTime() - HOUR) });
    // hysteresis: 27/33 = 81.8% stays On
    await answer(q.hyst, G4.slice(0, 33), { right: (i) => i < 27, when: new Date(t.getTime() - HOUR) });
    // 7-day limit: 26/30 → Below now
    await answer(q.limit, G4.slice(0, 30), { right: (i) => i < 26, when: new Date(t.getTime() - HOUR) });
    // a person's level: 28/30 → a suggestion only
    await answer(q.manual, G4.slice(0, 30), { right: (i) => i < 28, when: new Date(t.getTime() - HOUR) });
    // alerts
    await answer(q.keySuspect, G4.slice(0, 30), { right: (i) => i < 3, when: new Date(t.getTime() - HOUR) });
    await answer(q.magnet, G4.slice(0, 30), { right: (i) => i < 12, wrong: () => "B", when: new Date(t.getTime() - HOUR) });
    await answer(q.negDisc, G4.slice(0, 60), { right: (i) => i < 30, when: new Date(t.getTime() - HOUR) }); // the weaker half right
    await answer(q.tooEasy, G4.slice(0, 30), { right: () => true, when: new Date(t.getTime() - HOUR) });
    await answer(q.slow, G4.slice(0, 30), { right: (i) => i < 18, ms: 100_000, when: new Date(t.getTime() - HOUR) });
    // fallback (Grade 6 question, no levels): 10/35 right in teacher sets; 30 adaptive answers all right do not count
    await answer(q.fallback, G6.slice(0, 35), { right: (i) => i < 10, mode: "TEACHER_QUIZ", when: new Date(t.getTime() - HOUR) });
    await answer(q.fallback, G6.slice(35, 65), { right: () => true, when: new Date(t.getTime() - HOUR) });
    // fewer than 30 non-adaptive answers: nothing changes
    await answer(q.fallbackShort, G6.slice(0, 20), { right: () => false, mode: "TEACHER_QUIZ", wrong: (i) => ["B", "C", "D"][i % 3], when: new Date(t.getTime() - HOUR) });
    await answer(q.fallbackShort, G6.slice(20, 50), { right: () => true, when: new Date(t.getTime() - HOUR) });

    const r = await runReclassify(repo, schoolId, at(0));
    assert.ok(r.questions >= 12 && r.changed > 0, JSON.stringify(r));
  });

  test("first answers only, per grade, the On-level basis: 93% of on-level Grade 4 students → Below, difficulty 2", async () => {
    const st = await stat(q.onBasis, 4);
    assert.equal(Number(st.responses), 40, "30 on-level + 10 Below-level; 5 rapid + 5 hinted first answers excluded; retries ignored");
    assert.equal(Number(st.responsesOnLevel), 30);
    assert.equal(Number(st.pctOnLevel), 93.3);
    assert.equal(Number(st.pct), 70, "28 of 40 overall");
    const g5 = await stat(q.onBasis, 5);
    assert.deepEqual([Number(g5.responses), Number(g5.pct)], [34, 50], "Grade 5 is kept separately");
    const qq = await question(q.onBasis);
    assert.deepEqual([Number(qq.difficultyLevel), Number(qq.irtB), s(qq.difficultySource)], [2, LEVEL_TO_B[2], "DATA"]);
    const log = (await repo.findMany("QuestionLevelChange", { questionId: q.onBasis }))[0];
    assert.deepEqual([s(log.fromLevel), s(log.toLevel), Number(log.fromDifficulty), Number(log.toDifficulty), s(log.basis), s(log.source), Number(log.grade)], ["ON", "BELOW", 4, 2, "ON_LEVEL_STUDENTS", "AUTO", 4]);
    assert.match(s(log.reason), /93% of 30 on-level Grade 4 students answered right on their first try/);
    assert.ok(await repo.findMany("AuditLog", { action: "question.reclassify", entityId: q.onBasis }).then((x) => x.length === 1));
  });

  test("thresholds: 30% → Above, difficulty 5; 81.8% stays On (hysteresis)", async () => {
    assert.equal(Number((await question(q.above)).difficultyLevel), 5);
    assert.equal(Number((await question(q.hyst)).difficultyLevel), 4);
    assert.equal(await repo.count("QuestionLevelChange", { questionId: q.hyst }), 0);
    assert.equal(Number((await question(q.limit)).difficultyLevel), 3, "86.7% → Below, difficulty 3");
  });

  test("fallback: every Grade 6 student's non-adaptive answers (30+); fewer → nothing changes", async () => {
    const qq = await question(q.fallback);
    assert.equal(Number(qq.difficultyLevel), 5, "28.6% → Above, difficulty 5 (adaptive answers ignored)");
    const log = (await repo.findMany("QuestionLevelChange", { questionId: q.fallback }))[0];
    assert.deepEqual([s(log.basis), Number(log.grade), Number(log.responses)], ["ALL_STUDENTS", 6, 35]);
    assert.match(s(log.reason), /assigned sets, Weekly Checks and tests only/);
    assert.equal(Number((await question(q.fallbackShort)).difficultyLevel), 4);
    assert.equal(await repo.count("QuestionLevelChange", { questionId: q.fallbackShort }), 0);
  });

  test("each alert kind; KEY_SUSPECT and NEGATIVE_DISCRIMINATION hold the question", async () => {
    assert.deepEqual(await alertKinds(q.keySuspect), ["KEY_SUSPECT"]);
    assert.deepEqual(await alertKinds(q.magnet), ["DISTRACTOR_MAGNET"]);
    assert.deepEqual(await alertKinds(q.negDisc), ["NEGATIVE_DISCRIMINATION"]);
    assert.deepEqual(await alertKinds(q.tooEasy), ["TOO_EASY"]);
    assert.deepEqual(await alertKinds(q.slow), ["SLOW"]);
    assert.deepEqual(await alertKinds(q.hyst), []);
    const held = await heldBackQuestionIds(repo, Object.values(q));
    assert.deepEqual([...held].sort(), [q.keySuspect, q.negDisc].sort());
    const rows = await alertList(repo, admin, {});
    const ks = rows.find((r) => r.questionId === q.keySuspect)!;
    assert.deepEqual([ks.kind, ks.grade, ks.responses, ks.pct, ks.heldBack], ["KEY_SUSPECT", 4, 30, 10, true]);
    assert.match(ks.detail, /answer key may be wrong/);
  });

  test("held-back questions are out of adaptive pools (not out of a teacher's set); releasing the hold brings them back", async () => {
    const ids = async () => new Set((await loadItemsForSkills(repo, [SK])).map((i) => i.questionId));
    let pool1 = await ids();
    assert.ok(!pool1.has(q.keySuspect) && !pool1.has(q.negDisc), "held out");
    assert.ok(pool1.has(q.magnet), "a misleading option alone does not hold");
    const ks = (await repo.findMany("QuestionAlert", { questionId: q.keySuspect }))[0];
    await releaseHold(repo, admin, s(ks.id));
    pool1 = await ids();
    assert.ok(pool1.has(q.keySuspect), "released");
    assert.equal(s((await repo.findUnique("QuestionAlert", { id: ks.id }))!.status), "OPEN", "the alert stays open");
    const nd = (await repo.findMany("QuestionAlert", { questionId: q.negDisc }))[0];
    await setAlertStatus(repo, admin, s(nd.id), "RESOLVED");
    assert.ok((await ids()).has(q.negDisc), "resolving releases the hold too");
  });

  test("a person's level is never changed: a suggestion; approving it applies and logs APPROVED", async () => {
    const qq = await question(q.manual);
    assert.equal(Number(qq.difficultyLevel), 4);
    assert.equal(await repo.count("QuestionLevelChange", { questionId: q.manual }), 0);
    const sg = await repo.findMany("AiSuggestion", { schoolId, tool: "INTEL", kind: "DIFFICULTY", questionId: q.manual, status: "SUGGESTED" });
    assert.equal(sg.length, 1);
    assert.match(s(sg[0].detail), /set by a person/);
    // more answers: no second suggestion
    await answer(q.manual, G4.slice(30, 32), { right: () => true, when: new Date(at(1).getTime() - HOUR) });
    await runReclassify(repo, schoolId, at(1));
    assert.equal(await repo.count("AiSuggestion", { questionId: q.manual, kind: "DIFFICULTY" }), 1);
    await reviewSuggestion(repo, admin, s(sg[0].id), "APPROVE", at(1));
    const after = await question(q.manual);
    assert.equal(Number(after.difficultyLevel), 2);
    const log = (await repo.findMany("QuestionLevelChange", { questionId: q.manual }))[0];
    assert.deepEqual([s(log.source), s(log.approvedById), s(log.toLevel)], ["APPROVED", admin.userId, "BELOW"]);
    assert.match(s(log.reason), /^Approved: /);
  });

  test("at most one change per 7 days", async () => {
    // 10 more on-level students, all wrong: 26/40 = 65% → On, but the last change was 2 days ago
    await answer(q.limit, G4.slice(30, 40), { right: () => false, when: new Date(at(2).getTime() - HOUR) });
    await runReclassify(repo, schoolId, at(2));
    assert.equal(Number((await question(q.limit)).difficultyLevel), 3, "blocked within 7 days");
    await answer(q.limit, G4.slice(40, 41), { right: () => false, when: new Date(at(9).getTime() - HOUR) });
    await runReclassify(repo, schoolId, at(9));
    assert.equal(Number((await question(q.limit)).difficultyLevel), 4, "after 7 days it moves back to On");
    const logs = await levelChangeList(repo, admin, {});
    assert.equal(logs.filter((l) => l.questionId === q.limit).length, 2);
  });

  test("dismissed alerts stay dismissed; resolved ones re-open only on new evidence", async () => {
    const te = (await repo.findMany("QuestionAlert", { questionId: q.tooEasy }))[0];
    await setAlertStatus(repo, admin, s(te.id), "DISMISSED");
    const ks = (await repo.findMany("QuestionAlert", { questionId: q.keySuspect }))[0];
    await setAlertStatus(repo, admin, s(ks.id), "RESOLVED", at(9));
    await answer(q.tooEasy, G4.slice(30, 31), { right: () => true, when: new Date(at(10).getTime() - HOUR) });
    await answer(q.keySuspect, G4.slice(30, 31), { right: () => false, when: new Date(at(10).getTime() - HOUR) });
    await runReclassify(repo, schoolId, at(10));
    assert.equal(s((await repo.findUnique("QuestionAlert", { id: te.id }))!.status), "DISMISSED");
    assert.equal(s((await repo.findUnique("QuestionAlert", { id: ks.id }))!.status), "RESOLVED", "one answer since resolving is not enough evidence");
  });

  test("question detail: per-grade statistics, its own grade first-class", async () => {
    const v = await questionData(repo, admin, q.onBasis);
    assert.deepEqual(v.grades.map((g) => [g.grade, g.own]), [[4, true], [5, false]]);
    assert.equal(v.changes.length, 1);
  });

  test("only this school's students' answers count, and only this school's questions are written", async () => {
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const other = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    assert.notEqual(other.schoolId, schoolId);
    const theirs = (await repo.findMany("Student", { schoolId: other.schoolId })).map((x) => s(x.id)).slice(0, 35);
    const before4 = await stat(q.hyst, 4);
    await answer(q.hyst, theirs, { right: () => false, when: new Date(at(11).getTime() - HOUR) });
    await runReclassify(repo, s(other.schoolId), at(11));
    assert.equal(Number((await stat(q.hyst, 4)).responses), Number(before4.responses), "another school's run never writes this school's question");
    assert.equal((await repo.findMany("QuestionGradeStat", { questionId: q.hyst })).length, 1, "no row from the other school's students");
    await answer(q.hyst, G4.slice(33, 34), { right: () => true, when: new Date(at(11).getTime() - HOUR) });
    await runReclassify(repo, schoolId, at(11));
    const after = await stat(q.hyst, 4);
    assert.equal(Number(after.responses), Number(before4.responses) + 1, "the other school's 35 wrong answers are ignored");
    await assert.rejects(questionData(repo, other, q.hyst), /Not found/);
  });

  test("the question editor marks a changed level as set by hand", async () => {
    const free = pool.find((id) => !Object.values(q).includes(id))!;
    const d = await getQuestion(repo, admin, free);
    await updateDraft(repo, admin, free, { ...d.input, stem: `${d.input.stem} ` });
    assert.notEqual(s((await question(free)).difficultySource), "MANUAL", "same level: not marked");
    await updateDraft(repo, admin, free, { ...d.input, level: d.input.level === 4 ? 5 : 4 } as typeof d.input);
    assert.equal(s((await question(free)).difficultySource), "MANUAL");
    assert.equal(isManualLevel(await question(free)), true);
  });

  test("the daily job runs it; the admins get one notice a week", async () => {
    await answer(q.daily, G4.slice(0, 30), { right: () => true, when: new Date(at(12).getTime() - HOUR) });
    const r = await runDaily(repo, schoolId, at(12));
    assert.equal(typeof r.reclassified, "number");
    const last = (await repo.findMany("SchoolSetting", { schoolId, key: LAST_RUN_KEY }))[0];
    assert.equal(s((typeof last.value === "string" ? JSON.parse(last.value) : last.value).at), at(12).toISOString());
    assert.deepEqual(await alertKinds(q.daily), ["TOO_EASY"], "new alert from the daily run");
    assert.ok(await repo.findMany("SchoolSetting", { schoolId, key: NOTICE_KEY }).then((x) => x.length === 1));
    assert.equal(await repo.count("Notification", { userId: admin.userId, link: "/admin/item-quality?tab=alerts" }), 0, "not before a week");
    await runDaily(repo, schoolId, at(20));
    const n = await repo.findMany("Notification", { userId: admin.userId, link: "/admin/item-quality?tab=alerts" });
    assert.equal(n.length, 1);
    assert.match(s(n[0].body), /new question alert/);
  });
});

describe("reclassify: contracts", () => {
  test("the alert actions check the session in their own body", () => {
    const src = readFileSync("src/app/admin/item-quality/actions.ts", "utf8");
    for (const name of ["resolveAlertAction", "releaseHoldAction"]) {
      const body = src.slice(src.indexOf(`function ${name}`)).split(/\nexport /)[0];
      assert.match(body, /requireActor\(/, name);
    }
  });
});
