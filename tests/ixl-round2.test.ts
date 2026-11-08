/**
 * IXL round 2 (Nov 2026): 🔎 Questions Log · ❓ the real missed questions (Mistakes report) + Show on screen ·
 * 🟢 the class right now · 🎚️ where students are stuck inside a skill · 📐 CCSS standards · 🤝 Group Jam.
 * Everything read only except Group Jam (an in-memory Live Challenge room); no schema change.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Row } from "../src/server/seeding/repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { loadQuestionItems } from "../src/server/practice/items";
import { skillKeysFor } from "../src/server/skills/status";
import { loggedSkills, questionsLog } from "../src/server/analytics/questions-log";
import { classMissedQuestions, questionForScreen } from "../src/server/insights/missed-questions";
import { liveClass, liveStatus, riyadhMidnight } from "../src/server/analytics/live-class";
import { bandOf, bandScores, stuckBand } from "../src/server/skills/difficulty";
import { skillDifficulty } from "../src/server/skills/difficulty-report";
import { standardBand, standardsReport } from "../src/server/reports/standards-report";
import { challengeSkills, rewardChallenge, startChallenge, joinChallenge } from "../src/server/game/live-challenge";
import { answer, hostAct, hostView, livePower, playerView, resetRooms, roomById, settle } from "../src/server/game/rooms";
import { HUB_LINKS } from "../src/components/teacher/report-catalog";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";
import { topUpGameBank } from "./helpers/game-bank";

const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);
const MIN = 60_000;

describe("IXL round 2", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let classId: string; let ids: string[]; let schoolId: string;
  let skillA: string; let skillB: string; let qA: string[]; let qB: string[];
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
  const session = (sid: string, skillId: string, at: string, extra: Row = {}) => repo.create("PracticeSession", { studentId: sid, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(at), ...extra });
  const attempt = (ses: Row, sid: string, q: string, skillId: string, at: string, ok: boolean, extra: Row = {}) =>
    repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: q, skillId, response: {}, isCorrect: ok, responseMs: 30_000, difficultyB: 0, createdAt: new Date(at), ...extra });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await actorOf("test.teacher.1"); other = await actorOf("test.teacher.2");
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
    assert.ok(ids.length >= 6, "a class of 6+");
    schoolId = String(teacher.schoolId);
    // two skills of the class's grade with 3+ published multiple-choice questions
    const klass = (await repo.findUnique("Class", { id: classId }))!;
    const cur = await repo.findMany("Curriculum", { gradeId: klass.gradeId }, { select: ["id"] });
    const skills = await repo.findMany("Skill", { curriculumId: { in: cur.map((c) => c.id) }, deletedAt: null }, { select: ["id"] });
    const mc = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    const qs = await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null, typeId: mc.id }, { select: ["id", "skillId"] });
    const by = new Map<string, string[]>();
    for (const q of qs) by.set(String(q.skillId), [...(by.get(String(q.skillId)) ?? []), String(q.id)]);
    const keys = await skillKeysFor(repo, schoolId, [...by.keys()]);
    const good = [...by].filter(([, l]) => l.length >= 3);
    [skillA, qA] = good[0];
    const second = good.find(([k]) => keys.get(k) !== keys.get(skillA))!;
    [skillB, qB] = second;
    assert.ok(skillA && skillB && skillA !== skillB);
  });
  after(() => resetRooms());

  // ------------------------------------------------------------------ 🔎 Questions Log
  test("Questions Log: every answer with the student's answer and the right one, time, hint, guess, sessions, curve", async () => {
    const [it] = await loadQuestionItems(repo, [qA[0]]);
    const right = it.options!.find((o) => o.correct)!.label, wrong = it.options!.find((o) => !o.correct)!.label;
    const [it2] = await loadQuestionItems(repo, [qA[1]]);
    const right2 = it2.options!.find((o) => o.correct)!.label;
    const s0 = ids[0];
    const ses = await session(s0, skillA, "2026-10-04T14:37:00Z");
    const a1 = await attempt(ses, s0, qA[0], skillA, "2026-10-04T14:38:00Z", false, { response: { value: wrong }, usedHint: true });
    const a2 = await attempt(ses, s0, qA[1], skillA, "2026-10-04T14:50:00Z", true, { response: { value: right2 }, responseMs: 1500, rapidGuess: true });
    const a3 = await attempt(ses, s0, qA[0], skillA, "2026-10-04T15:02:00Z", true, { response: { value: right } });
    for (const [a, before, after] of [[a1, 20, 18], [a2, 18, 30], [a3, 30, 41]] as const) {
      await repo.create("AdaptiveDecisionLog", { studentId: s0, sessionId: ses.id, attemptId: a.id, questionId: a.questionId, skillId: skillA, previousTheta: 0, newTheta: 0, thetaSE: 1, masteryBefore: before, masteryAfter: after, reason: "t", reasonCode: "TARGET_SUCCESS_RATE", engineVersion: "t", createdAt: a.createdAt });
    }
    const log = await questionsLog(repo, teacher, { classId, studentId: s0, skill: skillA });
    assert.deepEqual([log.totals.answered, log.totals.correct, log.totals.hints, log.totals.guesses], [3, 2, 1, 1]);
    assert.equal(log.sessions.length, 1);
    const ss = log.sessions[0];
    assert.deepEqual([ss.day, ss.weekday, ss.startMin, ss.endMin, ss.atSchool, ss.correct, ss.answered], ["2026-10-04", 0, 17 * 60 + 37, 18 * 60 + 2, false, 2, 3]);
    assert.deepEqual(ss.answers.map((a) => a.n), [3, 2, 1], "newest first");
    const w = ss.answers.find((a) => a.n === 1)!;
    assert.equal(w.correct, false); assert.ok(w.yourAnswer.startsWith(`${wrong}.`), w.yourAnswer); assert.ok(w.correctAnswer.startsWith(`${right}.`), w.correctAnswer);
    assert.equal(w.hint, true); assert.equal(w.seconds, 30); assert.equal(w.score, 18);
    assert.equal(ss.answers.find((a) => a.n === 2)!.guess, true);
    assert.deepEqual(log.curve.map((c) => c.score), [18, 30, 41]);
    const missed = await questionsLog(repo, teacher, { classId, studentId: s0, skill: skillA, missedOnly: true });
    assert.deepEqual(missed.sessions[0].answers.map((a) => a.n), [1], "missed only");
    // the skill picker, and access
    assert.ok((await loggedSkills(repo, teacher, { classId, studentId: s0 })).some((k) => k.answered === 3));
    await assert.rejects(questionsLog(repo, other, { classId, studentId: s0, skill: skillA }), ForbiddenError, "another teacher's class");
    const outsider = (await repo.findMany("Student", { schoolId })).find((x) => !ids.includes(String(x.id)))!;
    await assert.rejects(questionsLog(repo, teacher, { classId, studentId: String(outsider.id), skill: skillA }), ForbiddenError, "a student of another class");
  });

  // ------------------------------------------------------------------ ❓ missed questions + Show on screen
  test("Mistakes: the question most students missed, the wrong answer most chose, by mistake code; guesses ignored", async () => {
    const [it] = await loadQuestionItems(repo, [qA[0]]);
    const wrong = it.options!.find((o) => !o.correct)!, right = it.options!.find((o) => o.correct)!;
    const now = new Date("2026-10-10T10:00:00Z");
    for (const [i, ok, extra] of [[1, false, { misconception: "TEST_CODE" }], [2, false, { misconception: "TEST_CODE" }], [3, true, {}], [4, false, { rapidGuess: true }]] as const) {
      const ses = await session(ids[i], skillA, "2026-10-08T07:00:00Z");
      await attempt(ses, ids[i], qA[0], skillA, "2026-10-08T07:05:00Z", ok, { response: { value: ok ? right.label : wrong.label }, ...extra });
    }
    const m = await classMissedQuestions(repo, teacher, classId, {}, now);
    const q = m.top.find((x) => x.questionId === qA[0])!;
    assert.ok(q, "the question is in the list");
    assert.deepEqual(q.missedBy.map((x) => x.id).sort(), [ids[0], ids[1], ids[2]].sort(), "students 0, 1, 2 — the fast guess (4) is not a mistake");
    assert.equal(q.tried, 4, "0, 1, 2 and 3 (the guess is left out)");
    assert.deepEqual(q.commonWrong, { text: `${wrong.label}. ${wrong.text}`, n: 3 });
    assert.ok(q.options!.some((o) => o.correct && o.label === right.label));
    assert.ok(["EASY", "MEDIUM", "HARD"].includes(q.band));
    assert.equal(m.byCode.TEST_CODE?.questionId, qA[0], "the class-wide mistake shows its question");
    await assert.rejects(classMissedQuestions(repo, other, classId, {}, now), ForbiddenError);
    const scr = await questionForScreen(repo, teacher, qA[0]);
    assert.ok(scr.options!.length >= 2 && scr.correctAnswer.startsWith(`${right.label}.`));
    await assert.rejects(questionForScreen(repo, teacher, "no-such-question"), ForbiddenError);
  });

  // ------------------------------------------------------------------ 🟢 the class right now
  test("the class right now: needs help, working, stopped, not on (pure rule)", () => {
    const now = Date.parse("2026-10-20T08:03:00Z");
    const a = (minAgo: number, correct: boolean, rapid = false) => ({ at: now - minAgo * MIN, correct, rapid });
    assert.equal(liveStatus([a(3, false), a(2, false), a(1, false)], 0, now).status, "HELP");
    assert.equal(liveStatus([a(3, false), a(2, false), a(1, true)], 0, now).status, "WORKING");
    assert.equal(liveStatus([a(8, true)], 0, now).status, "IDLE");
    assert.equal(liveStatus([a(40, true)], 0, now).status, "AWAY");
    assert.equal(liveStatus([], now - 30_000, now).status, "WORKING", "a question on the screen now");
    assert.equal(liveStatus([a(3, false, true), a(2, false, true), a(1, false, true)], 0, now).status, "WORKING", "fast guesses are not 'needs help'");
    assert.equal(liveStatus([a(5, true, true), a(4, true, true), a(3, true, true), a(2, true), a(1, true)], 0, now).guessing, true);
    assert.equal(riyadhMidnight(Date.parse("2026-10-20T22:30:00Z")), Date.parse("2026-10-20T21:00:00Z"), "after 1:30 AM in Riyadh the day already changed");
  });

  test("the class right now: one class, today's answers and the open sessions", async () => {
    const now = new Date("2026-10-20T08:03:00Z");
    const ses = async (i: number) => session(ids[i], skillB, "2026-10-20T07:50:00Z");
    const s5 = await ses(5);
    for (const m of [3, 2, 1]) await attempt(s5, ids[5], qB[0], skillB, new Date(now.getTime() - m * MIN).toISOString(), false);
    const s4 = await ses(4);
    await attempt(s4, ids[4], qB[0], skillB, new Date(now.getTime() - 8 * MIN).toISOString(), true);
    await session(ids[3], skillB, "2026-10-20T08:01:00Z", { currentQuestionId: qB[1], currentServedAt: new Date(now.getTime() - 30_000) });
    const v = await liveClass(repo, teacher, classId, now);
    const st = (i: number) => v.students.find((x) => x.id === ids[i])!;
    assert.equal(st(5).status, "HELP"); assert.equal(st(4).status, "IDLE"); assert.equal(st(3).status, "WORKING");
    assert.ok(st(3).skill, "the skill on the screen now");
    assert.equal(st(5).today.answered, 3); assert.equal(st(5).today.accuracy, 0);
    assert.equal(v.students[0].status, "HELP", "needs help first");
    assert.ok(v.counts.AWAY >= 1);
    await assert.rejects(liveClass(repo, other, classId, now), ForbiddenError);
  });

  // ------------------------------------------------------------------ 🎚️ stuck levels
  test("difficulty bands and where a student is stuck (pure)", () => {
    assert.deepEqual([-2, -0.4, -0.375, 0, 0.375, 0.4, 2].map(bandOf), ["EASY", "EASY", "MEDIUM", "MEDIUM", "MEDIUM", "HARD", "HARD"]);
    const ans = (b: number, n: number, right: number) => Array.from({ length: n }, (_, i) => ({ b, correct: i < right }));
    assert.equal(stuckBand(bandScores(ans(-1, 4, 1))), "EASY");
    assert.equal(stuckBand(bandScores([...ans(-1, 3, 3), ...ans(0, 4, 1)])), "MEDIUM");
    assert.equal(stuckBand(bandScores([...ans(-1, 3, 3), ...ans(0, 3, 3), ...ans(1, 3, 0)])), "HARD");
    assert.equal(stuckBand(bandScores(ans(1, 3, 3))), "WELL");
    assert.equal(stuckBand(bandScores(ans(0, 2, 0))), "TOO_FEW");
  });

  test("the skill page: students grouped by where they are stuck, with a sample question each", async () => {
    const plan: [number, number, number, number][] = [
      // student, b, answers, right
      [1, -1, 4, 0],
      [2, 0, 4, 1], [2, -1, 3, 3],
      [3, 1, 3, 0], [3, 0, 3, 3], [3, -1, 3, 3],
      [0, 1, 3, 3],
    ];
    for (const [i, b, n, right] of plan) {
      const ses = await session(ids[i], skillB, "2026-10-12T07:00:00Z");
      for (let k = 0; k < n; k++) await attempt(ses, ids[i], qB[k % qB.length], skillB, `2026-10-12T07:${String(10 + k).padStart(2, "0")}:00Z`, k < right, { difficultyB: b });
    }
    const d = await skillDifficulty(repo, teacher, skillB);
    const g = (w: string) => d.groups.find((x) => x.where === w)!.students.map((x) => x.id);
    assert.ok(g("EASY").includes(ids[1])); assert.ok(g("MEDIUM").includes(ids[2])); assert.ok(g("HARD").includes(ids[3])); assert.ok(g("WELL").includes(ids[0]));
    assert.ok(d.groups.find((x) => x.where === "EASY")!.sample, "a question they miss");
    assert.ok(d.questions.EASY + d.questions.MEDIUM + d.questions.HARD >= qB.length);
  });

  // ------------------------------------------------------------------ 📐 standards
  test("standards: a student's band from the star scores (a ⭐ counts 100)", () => {
    const v = (status: string, score: number) => ({ key: "k", status, level: 1, answered: 10, correct: 5, score, skillId: null, startedAt: null, masteredAt: null, reviewDueAt: null, needsSupport: false, selfCheck: null, updatedAt: null }) as never;
    assert.deepEqual(standardBand([undefined, v("NOT_STARTED", 0)]), { band: "NONE", avg: null, started: 0 });
    assert.equal(standardBand([v("MASTERED", 90), v("IN_PROGRESS", 50)]).band, "NEAR", "(100 + 50) / 2 = 75");
    assert.equal(standardBand([v("IN_PROGRESS", 85)]).band, "MET");
    assert.equal(standardBand([v("NEEDS_REVIEW", 40)]).band, "BELOW");
  });

  test("standards report: the class on each CCSS standard of the grade, one standard opened", async () => {
    const links = await repo.findMany("SkillStandard", { skillId: skillA });
    const std = (await repo.findMany("Standard", { id: { in: links.map((l) => l.standardId) }, framework: "CCSS_ELA" }))[0];
    assert.ok(std, "the test skill has a CCSS standard");
    const key = (await skillKeysFor(repo, schoolId, [skillA])).get(skillA)!;
    await repo.create("SkillStatus", { studentId: ids[1], skillKey: key, level: 1, status: "MASTERED", skillId: skillA, answered: 30, correct: 28, score: 100, startedAt: new Date(), masteredAt: new Date() });
    await repo.create("SkillStatus", { studentId: ids[2], skillKey: key, level: 1, status: "IN_PROGRESS", skillId: skillA, answered: 10, correct: 4, score: 40, startedAt: new Date() });
    const r = await standardsReport(repo, teacher, classId, String(std.id));
    const row = r.rows.find((x) => x.id === String(std.id))!;
    assert.ok(row.counts.MET >= 1 && row.counts.BELOW >= 1);
    assert.equal(row.counts.MET + row.counts.NEAR + row.counts.BELOW + row.counts.NONE, ids.length, "every student counted once");
    assert.ok(row.pctMet !== null && row.pctMet <= 50);
    assert.equal(r.open?.id, String(std.id));
    assert.equal(r.open!.byStudent[0].band, "BELOW", "who needs it first");
    assert.ok(r.open!.skills.some((k) => k.mastered >= 1));
    assert.deepEqual(r.rows.map((x) => x.code), [...r.rows.map((x) => x.code)].sort((a, b) => a.localeCompare(b, "en", { numeric: true })), "natural order");
    await assert.rejects(standardsReport(repo, other, classId), ForbiddenError);
  });

  // ------------------------------------------------------------------ 🤝 Group Jam
  test("Group Jam: same question for all, teacher-paced, no timer, no points, no auto reveal, unanswered not counted, no rewards", async () => {
    const grade = (await teacherRoster(repo, teacher))[0].grade;
    const skills = (await challengeSkills(repo, teacher, { grade })).filter((k) => k.fitting >= 6).sort((a, b) => b.fitting - a.fitting);
    const sk = skills[0].id;
    await topUpGameBank(repo, sk);
    const g = await startChallenge(repo, teacher, { classId, skillIds: [sk], count: 5, seconds: 10, jam: true, mode: "rocket-race" as never, levelMode: "LEVEL" });
    const room = roomById(g.id)!;
    assert.equal(room.jam, true); assert.equal(room.mode, "quiz-race"); assert.equal(room.levelMode, "SAME"); assert.deepEqual(room.features, {}); assert.equal(room.boardHidden, true);
    assert.match(room.title, /^Group Jam · /);
    const kids = await Promise.all(ids.slice(0, 3).map(studentActor));
    for (const k of kids) await joinChallenge(repo, k, g.code);
    const t0 = Date.now();
    hostAct(room, "start", t0);
    assert.equal(hostView(room, t0).leftMs, null, "no timer");
    assert.equal(playerView(room, kids[0].studentId!, t0).jam, true);
    const ri = room.slots[0].byLevel.ON, wrong = ri.view.options!.find((o) => o.label !== ri.right)!.label;
    assert.throws(() => livePower(room, kids[0].studentId!, "fifty", t0 + 500), /power-ups/);
    const r0 = answer(room, kids[0].studentId!, 0, ri.right!, t0 + 1000);
    assert.deepEqual([r0.correct, r0.points], [true, 0], "no points");
    answer(room, kids[1].studentId!, 0, wrong, t0 + 2000);
    // kid 2 does not answer; even much later the question stays open (no timer)
    settle(room, t0 + 10 * MIN);
    assert.equal(room.status, "QUESTION", "no time up");
    hostAct(room, "toggle-board", t0 + 10 * MIN);
    assert.equal(room.boardHidden, true, "no board in Group Jam");
    hostAct(room, "reveal", t0 + 10 * MIN);
    const hv = hostView(room, t0 + 10 * MIN);
    assert.equal(hv.jam, true);
    assert.deepEqual(hv.question!.picks, { [ri.right!]: 1, [wrong]: 1 }, "how the class answered, no names");
    const k2 = room.players.get(kids[2].studentId!)!;
    assert.deepEqual([k2.correct, k2.incorrect], [0, 0], "a student who did not answer is not counted wrong");
    // everyone answers the next one: still no automatic reveal
    hostAct(room, "next", t0 + 11 * MIN);
    const r1 = room.slots[1].byLevel.ON;
    for (const k of kids) answer(room, k.studentId!, 1, r1.right!, t0 + 11 * MIN + 1000);
    assert.equal(room.status, "QUESTION", "the teacher shows the answer when the class is ready");
    hostAct(room, "end", t0 + 12 * MIN);
    assert.equal(playerView(room, kids[0].studentId!, t0 + 12 * MIN).podium.length, 0, "no podium");
    assert.equal(hostView(room, t0 + 12 * MIN).results!.top.length, 0);
    assert.deepEqual(await rewardChallenge(repo, room), { played: 0, winners: [] }, "no coins or badges");
    // the summary is saved for the results page (persist runs in the background)
    for (let i = 0; i < 50 && !(await repo.findUnique("LiveGame", { id: room.id })); i++) await new Promise((r) => setTimeout(r, 20));
    const saved = await repo.findUnique("LiveGame", { id: room.id });
    assert.ok(saved, "saved");
    const summary = typeof saved!.summary === "string" ? JSON.parse(saved!.summary) : saved!.summary;
    assert.equal(summary.jam, true);
  });

  // ------------------------------------------------------------------ hub + words
  test("the hub has the two new class reports (real pages, in Arabic); every new word is translated", () => {
    for (const k of ["live-class", "standards"]) {
      const l = HUB_LINKS.find((x) => x.key === k)!;
      assert.ok(l && l.category === "My class", k);
      assert.ok(hasAr(l.title) && hasAr(l.hint), k);
      assert.ok(existsSync(join(process.cwd(), `src/app${l.href("c1").split("?")[0]}/page.tsx`)), k);
    }
    for (const p of ["questions-log", "question-show", "live-class", "standards"]) assert.ok(existsSync(join(process.cwd(), `src/app/teacher/reports/${p}/page.tsx`)), p);
    for (const w of ["Questions log", "Show on screen", "The class right now", "Standards (CCSS)", "Group Jam", "How the class answered", "Questions most students missed", "Where the students are stuck in this skill", "Needs help now", "Mastery after each answer", "Easy", "Medium", "Hard"]) assert.ok(hasAr(w), w);
  });
});
