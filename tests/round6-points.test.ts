/**
 * Round 6 — ReadRise points, achievements, the scoreboard and the annual goal (Achieve3000's rules): points are worked
 * out from the runs (no coins, no table), only counted first tries earn score points, Unreliable / too-fast runs earn
 * nothing, polls pay once a day each, the 28 achievements, the school board (initials only, cached) and the class
 * switch that turns celebrations off.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import {
  ACHIEVEMENTS, ACHIEVEMENT_COUNT, POINTS, TEACHER_BADGES, TOP_SCORERS_KEY, achievementsFrom, badgesOffKey, capPolls, celebrationsOn,
  earnsActivityPoints, forgetStudentPoints, initials, pointsByStudent, studentCacheSize, pointsForRun, schoolScoreboard, scoreBonus, secondTryRight, streakReachedAt, studentPoints,
  studentPointsFrom, studentScoreboard, teacherBadgesOf, topOf, writingPoints, type AchievementFacts,
} from "../src/server/readrise/points";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z"); // Sunday 11:00 Riyadh
const at = (days: number, h = 0) => new Date(T0.getTime() + days * DAY + h * 3_600_000);
const ans8 = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), "A"]));
let seq = 0;
const run = (o: Record<string, unknown> = {}) => ({
  id: `r${++seq}`, studentId: "s1", articleId: `a${seq}`, band: "MID", step: "DONE", firstTry: true, stretch: false, score: 75, prePoll: 1, postPoll: 2,
  writingScore: null, answers: ans8, annotations: null, levelBefore: 800, levelAfter: 800, unreliable: false, readSeconds: 120,
  startedAt: at(0), completedAt: at(0), ...o,
});
const sum = (xs: { points: number }[]) => xs.reduce((a, e) => a + e.points, 0);

describe("round 6 — ReadRise points (pure)", () => {
  test("respond: 2 per first-try right, 1 per second-try right, score bonus 20 / 15 / 10", () => {
    assert.deepEqual([scoreBonus(100), scoreBonus(88), scoreBonus(87), scoreBonus(75), scoreBonus(74)], [20, 15, 10, 10, 0]);
    const e = pointsForRun(run({ score: 75, prePoll: null, postPoll: null, annotations: { secondTry: [7, 8] } }));
    assert.equal(sum(e.filter((x) => x.kind === "QUESTIONS")), 6 * 2 + 2 * 1);
    assert.equal(sum(e.filter((x) => x.kind === "SCORE_BONUS")), 10);
    // other stored shapes of the second try; never more than the questions missed
    assert.equal(secondTryRight({ secondTry: { "7": { correct: true }, "8": { correct: false } } }), 1);
    assert.equal(secondTryRight([{ start: 0, end: 3, color: "y" }, { secondTry: { right: [1, 2, 3] } }]), 3);
    assert.equal(sum(pointsForRun(run({ score: 100, prePoll: null, postPoll: null, annotations: { secondTry: [1, 2] } }))), 16 + 20);
  });

  test("only counted first tries earn score points; Unreliable and too-fast runs earn nothing at all", () => {
    assert.equal(sum(pointsForRun(run({ firstTry: false, prePoll: null, postPoll: null }))), 0, "a re-read: practice");
    // owner, round 6: a Stretch first try ALWAYS earns its question points + score bonus (never the level or the goal)
    assert.equal(sum(pointsForRun(run({ stretch: true, band: "MID", prePoll: null, postPoll: null }))), 6 * 2 + 10, "a Stretch first try earns points");
    assert.equal(sum(pointsForRun(run({ stretch: true, firstTry: false, prePoll: null, postPoll: null }))), 0, "a Stretch re-read: practice");
    assert.ok(sum(pointsForRun(run({ stretch: true, band: "S-M", answers: { 1: "A", 2: "A", 3: "A", 4: "A" }, score: 100, prePoll: null, postPoll: null }))) === 4 * 2 + 20, "a stretch set counts");
    assert.deepEqual(pointsForRun(run({ unreliable: true, writingScore: 4 })), []);
    assert.deepEqual(pointsForRun(run({ readSeconds: 20 })), []);
  });

  test("polls 5 each, once a day each; writing 5 / 10 / 20; teacher badges", () => {
    const evs = [run({ completedAt: at(0, 1) }), run({ completedAt: at(0, 2), startedAt: at(0, 2) }), run({ startedAt: at(1), completedAt: at(1) })].flatMap((r) => pointsForRun(r, { counted: false }));
    assert.equal(sum(capPolls(evs)), 4 * POINTS.poll, "2 days × (before + after)");
    assert.deepEqual([0, 1, 2, 3, 4, null].map(writingPoints), [0, 5, 5, 10, 20, 0]);
    assert.equal(TEACHER_BADGES.length, 10);
    assert.deepEqual(teacherBadgesOf({ teacherBadges: ["Word Wiz", { code: "questioner" }, "word-wiz", "unknown"] }).map((b) => b.code), ["word-wiz", "questioner"]);
    const w = pointsForRun(run({ prePoll: null, postPoll: null, firstTry: false, writingScore: 4, annotations: { teacherBadges: ["Word Wiz", "Text-to-Self Connector"] } }));
    assert.equal(sum(w), 20 + 20 + 10);
  });

  test("28 achievements; first 100% bonus; Activity Rookie on the third 100%; streak days", () => {
    assert.equal(ACHIEVEMENT_COUNT, 28);
    assert.equal(new Set(ACHIEVEMENTS.map((a) => a.code)).size, 28);
    for (const name of ["Activity Rookie", "Activity Wiz", "Guru of Understanding", "Sage", "Activity Pro", "Activity Expert", "Commentator", "Debater", "Opinionator", "School Daily Top Scorer", "School Weekly Top Scorer"])
      assert.ok(ACHIEVEMENTS.some((a) => a.name === name), name);
    assert.ok(!JSON.stringify(ACHIEVEMENTS).includes("Lexile"), "never 'Lexile' in the interface");
    assert.equal(streakReachedAt([at(0).getTime(), at(1).getTime(), at(3).getTime(), at(4).getTime(), at(5).getTime()], 3), Date.parse("2026-09-11T09:00:00Z"));
    const runs = [0, 1, 2, 3].map((d) => run({ articleId: `p${d}`, score: 100, startedAt: at(d), completedAt: at(d), writing: d === 0 ? "my answer" : null }));
    const r = studentPointsFrom({ studentId: "s1", runs });
    assert.equal(r.events.filter((e) => e.kind === "FIRST_100").length, 1);
    const codes = r.achievements.map((a) => a.code);
    for (const c of ["activity-rookie", "commentator", "first-article", "first-writing", "streak-3"]) assert.ok(codes.includes(c), c);
    assert.ok(!codes.includes("activity-wiz"));
    assert.equal(r.achievements.find((a) => a.code === "activity-rookie")!.at, at(2).toISOString());
    const empty: AchievementFacts = { perfect: [], strong: [], pairs: [], articles: [], stretches: [], writings: [], words: [], goalWeeks: [], levelUps: [], activeDays: [], levelAt: null, annualAt: null, dailyTop: [], weeklyTop: [] };
    assert.deepEqual(achievementsFrom(empty), []);
  });

  test("writing achievements need a SENT writing (RRRun.writing) or a teacher's score — not just a finished step", () => {
    const noText = studentPointsFrom({ studentId: "s1", runs: [run({ step: "DONE", writing: null }), run({ step: "POSTPOLL", writing: "  " })] });
    assert.ok(!noText.achievements.some((a) => a.code === "first-writing"), "DONE / POSTPOLL without a writing is no writing");
    const sent = studentPointsFrom({ studentId: "s1", runs: [run({ writing: "my thoughts" })] });
    assert.ok(sent.achievements.some((a) => a.code === "first-writing"));
    const scored = studentPointsFrom({ studentId: "s1", runs: [run({ writingScore: 3 })] });
    assert.ok(scored.achievements.some((a) => a.code === "first-writing"), "a scored writing counts");
  });

  test("one points rule: the student's total, the board and the reader agree on a Stretch first try", () => {
    const main = run({ studentId: "z", articleId: "same", prePoll: null, postPoll: null, completedAt: at(0, 1), startedAt: at(0, 1) });
    const str = run({ studentId: "z", articleId: "same", stretch: true, prePoll: null, postPoll: null, completedAt: at(0, 2), startedAt: at(0, 2) });
    const total = sum(studentPointsFrom({ studentId: "z", runs: [main, str] }).events.filter((e) => e.kind === "QUESTIONS" || e.kind === "SCORE_BONUS"));
    assert.equal(total, 2 * (6 * 2 + 10));
    assert.equal(pointsByStudent([main, str], 0).get("z"), total);
    assert.equal(earnsActivityPoints(str), true);
    assert.equal(earnsActivityPoints({ ...str, unreliable: true }), false);
  });

  test("Level Achiever: +35 above the year's start check, or 1210; top scorer wins from the school record", () => {
    const yearStart = Date.parse("2026-08-30T00:00:00+03:00");
    const runs = [run({ levelBefore: 800, levelAfter: 850, completedAt: at(1), startedAt: at(1) })];
    const placements = [{ result: 800, period: "BOY", completedAt: at(-2) }];
    const a = studentPointsFrom({ studentId: "s1", runs, placements, yearStartMs: yearStart, topScorers: { day: { "2026-09-07": "s1", "2026-09-08": "s2" }, week: {} } });
    assert.ok(a.achievements.some((x) => x.code === "level-achiever"));
    assert.ok(a.achievements.some((x) => x.code === "daily-top-scorer"));
    assert.ok(!a.achievements.some((x) => x.code === "weekly-top-scorer"));
    const b = studentPointsFrom({ studentId: "s1", runs: [run({ levelAfter: 820 })], placements, yearStartMs: yearStart });
    assert.ok(!b.achievements.some((x) => x.code === "level-achiever"));
  });

  test("initials only for students; the board's top scorer", () => {
    assert.equal(initials("Ahmed Khaled Ali"), "A.A.");
    assert.equal(initials("sara"), "S.");
    assert.equal(initials("Demo Student 12"), "D.S.", "letters only");
    const m = pointsByStudent([run({ studentId: "x" }), run({ studentId: "y", score: 100 })], 0);
    assert.equal(topOf(m)![0], "y");
  });
});

describe("round 6 — ReadRise points (database)", () => {
  let repo: SqliteRepo; let sids: string[]; let schoolId: string; let classId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    const ms = await repo.findMany("ClassMembership", {});
    classId = String(ms[0].classId);
    sids = ms.filter((m) => m.classId === classId).map((m) => String(m.studentId)).slice(0, 2);
    schoolId = String((await repo.findUnique("Student", { id: sids[0] }))!.schoolId);
  });

  test("studentPoints from the runs; the school board (classes, top scorers with initials) and the celebration switch", async () => {
    const now = new Date();
    const mk = (studentId: string, score: number, h: number, extra: Record<string, unknown> = {}) => repo.create("RRRun", {
      studentId, schoolId, articleId: `art-${studentId}-${h}`, versionLevel: 800, band: "MID", step: "DONE", prePoll: 1, postPoll: 2, answers: ans8,
      score, levelBefore: 800, levelAfter: 800, firstTry: true, readSeconds: 120, startedAt: new Date(now.getTime() - h * 60_000), completedAt: new Date(now.getTime() - h * 60_000), ...extra,
    });
    await mk(sids[0], 100, 5); await mk(sids[0], 75, 4); await mk(sids[1], 50, 3); await mk(sids[1], 100, 2, { unreliable: true });
    const p = await studentPoints(repo, sids[0]);
    // run 1: 16 + 20 + polls 10, first 100% 10; run 2: 12 + 10 (polls already paid today); achievements: commentator 10, first-article 10, first-writing 10
    assert.equal(p.events.filter((e) => e.kind !== "ACHIEVEMENT").reduce((a, e) => a + e.points, 0), 16 + 20 + 10 + 10 + 12 + 10);
    assert.ok(p.achievements.some((a) => a.code === "commentator"));
    assert.equal(await repo.count("CoinLedger", { studentId: sids[0] }), 0, "points never pay coins");
    const board = await schoolScoreboard(repo, schoolId, now);
    assert.equal(board.classesWeek[0].classId, classId);
    // the board: per-run points only (no history bonuses): 16 + 20 + 10 + 12 + 10 = 68; the other student 4×2 + polls 10 = 18 (the Unreliable run: 0)
    assert.equal(board.classesWeek[0].points, 68 + 18);
    assert.match(board.dailyTop!.initials, /^\p{L}\.(\p{L}\.)?$/u);
    assert.equal(board.dailyTop!.points, 68);
    assert.equal(await schoolScoreboard(repo, schoolId, now), board, "cached for 60 s");
    assert.ok(await repo.findUnique("SchoolSetting", { schoolId, key: TOP_SCORERS_KEY }), "yesterday's / last week's winners recorded once");
    const sb = await studentScoreboard(repo, sids[0], { schoolId, now: new Date(now.getTime() + 1000) });
    assert.equal(sb.goal.done, 2); assert.equal(sb.goal.target, 40); assert.equal(sb.goal.avg, 88);
    assert.equal(sb.achievements.total, 28);
    assert.ok(sb.today > 0 && sb.celebrate && sb.achievements.fresh.length > 0);
    await repo.create("SchoolSetting", { schoolId, key: badgesOffKey(classId), value: "1" });
    assert.equal(await celebrationsOn(repo, sids[0]), false);
    const off = await studentScoreboard(repo, sids[0], { schoolId, now: new Date(now.getTime() + 2000) });
    assert.deepEqual(off.achievements.fresh, [], "no banners when the class turned celebrations off");
    assert.equal(off.today, sb.today, "points still count");
    // forgetStudentPoints clears EVERY cached key of the student (keys are studentId|yearStart)
    const ys = new Date(now.getTime() - 30 * DAY);
    const y1 = await studentScoreboard(repo, sids[0], { schoolId, yearStart: ys, now: new Date(now.getTime() + 3000) });
    const before = studentCacheSize(repo);
    assert.ok(before >= 1);
    await mk(sids[0], 100, 1);
    const stale = await studentScoreboard(repo, sids[0], { schoolId, yearStart: ys, now: new Date(now.getTime() + 4000) });
    assert.equal(stale.year, y1.year, "cached until forgotten");
    forgetStudentPoints(repo, sids[0]);
    assert.ok(studentCacheSize(repo) < before, "the yearStart keys are gone too");
    const fresh = await studentScoreboard(repo, sids[0], { schoolId, yearStart: ys, now: new Date(now.getTime() + 5000) });
    assert.ok(fresh.year > y1.year, "the new run counts after forgetting");
  });

  test("pages: the panel on the Articles tab, the rules page lists every rule", () => {
    const page = readFileSync("src/app/student/readrise/page.tsx", "utf8");
    assert.match(page, /<ScorePanel actor=\{actor\} t=\{t\} \/>/);
    assert.match(readFileSync("src/components/readrise/library.tsx", "utf8"), /\{panel\}/);
    const rules = readFileSync("src/app/student/readrise/scoreboard/page.tsx", "utf8");
    for (const x of ["ACHIEVEMENTS.map", "TEACHER_BADGES.map", "WRITING_POINTS.map", "POINTS.firstTryRight", "POINTS.secondTryRight", "POINTS.first100", "POINTS.poll", "ANNUAL_GOAL.activities", "AppShell"]) assert.ok(rules.includes(x), x);
    const panel = readFileSync("src/components/readrise/scoreboard.tsx", "utf8");
    for (const x of ["rr-points-today", "rr-points-year", "rr-annual-goal", "rr-achievements", "rr-daily-top", "rr-weekly-top", "a.fresh.length"]) assert.ok(panel.includes(x), x);
  });
});
