/**
 * 🎲 Games Part 2c: Castle Guard, Rocket Race, Team Tug — solo (computer opponents at the student's level) and
 * Live Challenge (rockets by points, two teams balanced by level). Games never change mastery or levels.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { setStudentLevels } from "../src/server/curriculum-map/levels";
import { gameMeta, liveModes, readyGames } from "../src/games/registry";
import type { PlayLevel } from "../src/games/types";
import { gameAvailability, soloRound } from "../src/server/game/questions";
import { recordSoloResult } from "../src/server/game/results";
import { challengeSkills, joinChallenge, startChallenge } from "../src/server/game/live-challenge";
import { answer, hostAct, hostView, playerView, resetRooms, roomById } from "../src/server/game/rooms";
import { scoreSolo } from "../src/games/kit/powerups";
import { opponentSteps, PACE, rng, rocketGoal, secsPerStep, simulateRocket, simulateTug, smoothAt, stepsAt, TUG_WIN, TYPICAL, winRate } from "../src/games/rocket-race/pace";
import { moonPoints, rocketLanes } from "../src/games/rocket-race/live";
import { splitTeams, teamForLateJoiner, tugState } from "../src/games/team-tug/teams";
import { afterWave, build, canBuild, coinsFor, newCastle, resolveWave, START_COINS, START_HEARTS, waveAfter, waveCount, waveSize } from "../src/games/castle-guard/rules";
import { demoDatabase } from "./helpers/db";
import { topUpGameBank } from "./helpers/game-bank";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const IDS = ["castle-guard", "rocket-race", "team-tug"] as const;
const LEVELS: PlayLevel[] = ["BELOW", "ON", "ABOVE"];

describe("🎲 Games Part 2c — Castle Guard, Rocket Race, Team Tug", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let studs: Actor[] = []; let skillId: string;
  const engineCounts = async () => ({
    attempts: await repo.count("QuestionAttempt"), mastery: await repo.count("StudentSkillMastery"), evidence: await repo.count("SkillEvidence"),
    levels: await repo.count("StudentLevel"), levelStates: await repo.count("StudentLevelState"), sessions: await repo.count("PracticeSession"),
  });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    studs = await Promise.all(r[0].students.slice(0, 6).map(async (x) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: x.id }))!.userId }))!)));
    const skills = (await challengeSkills(repo, teacher, { grade: r[0].grade })).filter((k) => k.fitting >= 6).sort((a, b) => b.fitting - a.fitting);
    assert.ok(skills.length, "the test bank has a skill with multiple choice / True-False questions");
    skillId = skills[0].id;
    // games need a full round of fitting questions (MIN_QUESTIONS_PER_GAME); the test bank has 6 per skill
    await topUpGameBank(repo, skillId);
  });
  after(() => resetRooms());

  // ------------------------------------------------------------------ registry + files
  test("the three games are ready (solo) and Live Challenge modes, with 2–3 minute rounds and their own folders", () => {
    for (const id of IDS) {
      const m = gameMeta(id)!;
      assert.equal(m.ready, true, id); assert.equal(m.live, true, id);
      assert.deepEqual(m.types, ["MULTIPLE_CHOICE", "TRUE_FALSE"]);
      assert.ok(m.roundSeconds >= 120 && m.roundSeconds <= 180);
      assert.ok(readyGames().some((g) => g.id === id) && liveModes().some((g) => g.id === id));
      const src = read(`src/games/${id}/game.tsx`);
      assert.match(src, /^"use client";/);
      assert.match(src, /export default function/);
      assert.doesNotMatch(src, /SoonPanel/, "the placeholder is gone");
      assert.doesNotMatch(src, /<img|\.png|\.jpg|from "(phaser|pixi|three|howler|canvas-confetti|framer-motion)/, "code-drawn SVG/CSS, no engines");
      assert.doesNotMatch(src, /recordEngineAttempt|submitAnswer|mastery|awardCoins/i, "games never touch the engine or the coin wallet");
    }
    // requestAnimationFrame for motion; computer opponents use the student's level
    assert.match(read("src/games/rocket-race/game.tsx"), /requestAnimationFrame/);
    assert.match(read("src/games/team-tug/game.tsx"), /requestAnimationFrame/);
    assert.match(read("src/games/castle-guard/game.tsx"), /requestAnimationFrame/);
    assert.match(read("src/games/rocket-race/game.tsx"), /opponentSteps\(level/);
    assert.match(read("src/games/team-tug/game.tsx"), /opponentSteps\(level/);
    assert.match(read("src/games/team-tug/game.tsx"), /export function LivePad/);
    assert.match(read("src/games/team-tug/game.tsx"), /export function ProjectorView/);
    assert.match(read("src/games/rocket-race/game.tsx"), /export function ProjectorView/);
  });

  test("interface strings are in en.ts with an Arabic version (section `games g2c`)", () => {
    const en = read("src/i18n/en.ts"), ar = read("src/i18n/ar.ts");
    assert.match(en, /\/\/ ---- games g2c/); assert.match(ar, /\/\/ ---- games g2c/);
    assert.ok(en.indexOf("// ---- games g2c") > en.indexOf("// ---- games (part 1)"));
    const strs = new Set<string>();
    for (const f of ["castle-guard/game.tsx", "rocket-race/game.tsx", "rocket-race/ask.tsx", "team-tug/game.tsx", "castle-guard/rules.ts", "team-tug/teams.ts"]) {
      const src = read(`src/games/${f}`);
      for (const m of src.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) strs.add(m[1]);
      for (const m of src.matchAll(/\b(?:name|line): "([^"]+)"/g)) strs.add(m[1]);
    }
    assert.ok(strs.size > 40);
    for (const s of strs) {
      assert.ok(en.includes(JSON.stringify(s)), `en.ts: ${s}`);
      assert.ok(new RegExp(`${JSON.stringify(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: "[^"]*[\\u0600-\\u06FF]`).test(ar), `ar.ts: ${s}`);
    }
  });

  // ------------------------------------------------------------------ computer opponents
  test("computer opponents: Below slower, Above faster; a typical student wins about 50–60%", () => {
    assert.ok(secsPerStep(PACE.BELOW) > secsPerStep(PACE.ON) && secsPerStep(PACE.ON) > secsPerStep(PACE.ABOVE), "pace follows the level");
    // the same seed: an Above opponent reaches 8 steps sooner than an On one, and On sooner than Below
    const at = (l: PlayLevel) => { let sum = 0; for (let s = 1; s <= 200; s++) sum += opponentSteps(l, rng(s), 8)[7]; return sum / 200; };
    assert.ok(at("BELOW") > at("ON") && at("ON") > at("ABOVE"), `${at("BELOW")} > ${at("ON")} > ${at("ABOVE")}`);
    for (const l of LEVELS) {
      const rocket = winRate(simulateRocket, l), tug = winRate(simulateTug, l);
      assert.ok(rocket >= 0.5 && rocket <= 0.6, `Rocket Race ${l}: ${rocket}`);
      assert.ok(tug >= 0.5 && tug <= 0.6, `Team Tug ${l}: ${tug}`);
      // a student who answers everything right, fast, always wins; one who never answers right never does
      const r = rng(3);
      assert.equal(simulateRocket(l, r, 12, { secs: 4, acc: 1 }), "win");
      assert.equal(simulateTug(l, r, 12, { secs: 4, acc: 1 }), "win");
      assert.notEqual(simulateRocket(l, r, 12, { secs: 9, acc: 0 }), "win");
      assert.notEqual(simulateTug(l, r, 12, { secs: 9, acc: 0 }), "win");
    }
    // a below-level opponent would be too easy for an above-level student, and the reverse too hard
    const vsBelow = winRate((_l, rnd) => simulateRocket("BELOW", rnd, 12, TYPICAL.ABOVE), "ON");
    const vsAbove = winRate((_l, rnd) => simulateRocket("ABOVE", rnd, 12, TYPICAL.BELOW), "ON");
    assert.ok(vsBelow > 0.75 && vsAbove < 0.35, `${vsBelow} / ${vsAbove}`);
    // race clock helpers
    const times = [1000, 2500, 4000];
    assert.deepEqual([stepsAt(times, 0), stepsAt(times, 1000), stepsAt(times, 3000), stepsAt(times, 9e9)], [0, 1, 2, 3]);
    assert.ok(smoothAt(times, 2200) > 1 && smoothAt(times, 2200) < 2);
    assert.equal(rocketGoal(12), 7); assert.equal(rocketGoal(5), 4);
    assert.equal(TUG_WIN, 4);
  });

  test("scoring: game points come from the shared round rules; opponents never change correct / incorrect", () => {
    // the games call round.answer(q, ok, {speed}) → scoreSolo; right = 100–150 (+streak), wrong = −20 (Shield 0)
    assert.equal(scoreSolo(true, 1, 0, []).points, 150);
    assert.equal(scoreSolo(true, 0, 3, []).points, 130);
    assert.equal(scoreSolo(false, 1, 3, []).points, -20);
    assert.equal(scoreSolo(false, 1, 3, ["shield"]).points, 0);
    for (const id of ["rocket-race/ask.tsx"]) assert.match(read(`src/games/${id}`), /round\.answer\(q, ok, \{ speed \}\)/);
  });

  test("Castle Guard: castle coins from right answers build defences; waves; coins are game coins only", () => {
    assert.equal(coinsFor(true, 0), 3); assert.equal(coinsFor(true, 2), 4); assert.equal(coinsFor(false, 5), 0);
    let c = newCastle();
    assert.deepEqual([c.coins, c.hearts], [START_COINS, START_HEARTS]);
    assert.equal(canBuild(c, "archer"), false, "not enough coins");
    assert.equal(canBuild(c, "repair"), false, "full hearts");
    c = build({ ...c, coins: 20 }, "archer")!; c = build(c, "cannon")!; c = build(c, "wall")!;
    assert.deepEqual([c.coins, c.def.archer, c.def.cannon, c.def.wall], [20 - 3 - 5 - 2, 1, 1, 1]);
    // 1 archer + 1 cannon stop 3, the wall blocks 1, the rest get through
    assert.deepEqual(resolveWave(c.def, 6), { blobs: 6, stopped: 3, blocked: 1, through: 2 });
    assert.deepEqual(resolveWave(c.def, 2), { blobs: 2, stopped: 2, blocked: 0, through: 0 });
    c = afterWave(c, resolveWave(c.def, 6));
    assert.equal(c.hearts, START_HEARTS - 2);
    assert.ok(canBuild(c, "repair")); assert.equal(build(c, "repair")!.hearts, START_HEARTS - 1);
    assert.equal(build({ ...c, coins: 99, def: { wall: 3, archer: 0, cannon: 0 } }, "wall"), null, "max 3 walls");
    assert.equal(afterWave({ ...c, hearts: 1 }, { blobs: 9, stopped: 0, blocked: 0, through: 9 }).hearts, 0);
    assert.deepEqual([waveSize(1), waveSize(4)], [2, 5]);
    assert.equal(waveCount(12), 4); assert.equal(waveCount(10), 4);
    assert.deepEqual([1, 2, 3, 6, 10].map((n) => waveAfter(n, 10)), [false, false, true, true, true]);
    assert.doesNotMatch(read("src/games/castle-guard/game.tsx") + read("src/games/castle-guard/rules.ts"), /fetch\(|\/api\/|motivation/, "castle coins never reach the coin wallet");
  });

  // ------------------------------------------------------------------ solo: questions at the student's level, Soon
  test("solo: bank questions at the student's level; one result row; Soon without enough questions", async () => {
    const av = await gameAvailability(repo, teacher.schoolId!, skillId);
    for (const id of IDS) assert.equal(av.find((g) => g.id === id)!.status, "PLAY", id);
    const kid = studs[0];
    await setStudentLevels(repo, teacher, classId, [{ studentId: kid.studentId!, level: "ABOVE" }]);
    const before0 = await engineCounts();   // (the teacher's level change above is not a game)
    for (const id of IDS) {
      const round = await soloRound(repo, kid, id, skillId);
      assert.equal(round.level, "ABOVE", "computer opponents get the student's level");
      assert.ok(round.questions.length >= gameMeta(id)!.minQuestions && round.questions.length <= gameMeta(id)!.roundSize);
      assert.ok(round.questions.every((q) => (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") && q.options!.filter((o) => o.correct).length === 1));
      const rowId = await recordSoloResult(repo, kid, { roundId: round.roundId, correct: 4, incorrect: 2, points: 700 });
      const row = (await repo.findUnique("GamePlay", { id: rowId }))!;
      assert.deepEqual([row.gameId, Number(row.correct), Number(row.incorrect)], [id, 4, 2]);
    }
    // a skill without multiple choice / True-False questions: Soon for all three
    const types = await repo.findMany("QuestionType", { code: { in: ["MULTIPLE_CHOICE", "TRUE_FALSE"] } });
    const all = await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null }, { select: ["skillId", "typeId"] });
    const has = new Set(all.filter((q) => types.some((t) => t.id === q.typeId)).map((q) => String(q.skillId)));
    const without = [...new Set(all.map((q) => String(q.skillId)))].find((k) => !has.has(k));
    if (without) {
      const av2 = await gameAvailability(repo, teacher.schoolId!, without);
      for (const id of IDS) assert.equal(av2.find((g) => g.id === id)!.status, "SOON", `${id} Soon`);
    }
    assert.deepEqual(await engineCounts(), before0, "games never touch attempts, mastery, evidence or levels");
  });

  // ------------------------------------------------------------------ Live Challenge
  test("Live Rocket Race: every player's rocket placed by live points", async () => {
    const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId], mode: "rocket-race", count: 5, seconds: 20 });
    const room = roomById(g.id)!;
    assert.equal(room.mode, "rocket-race");
    for (const k of studs.slice(0, 5)) await joinChallenge(repo, k, g.code);
    const t0 = Date.now();
    hostAct(room, "start", t0);
    const key = (ix: number, ok: boolean) => { const ri = room.slots[ix].byLevel.ON; return ok ? ri.right! : ri.view.options!.find((o) => o.label !== ri.right)!.label; };
    studs.slice(0, 5).forEach((k, i) => answer(room, k.studentId!, 0, key(0, i < 3), t0 + 1000 + i * 1500));
    const v = hostView(room, t0 + 9000);
    const lanes = rocketLanes(v);
    assert.equal(lanes.length, 5);
    assert.deepEqual(lanes.map((l) => l.points), [...lanes.map((l) => l.points)].sort((a, b) => b - a), "rank order");
    assert.ok(lanes[0].frac > lanes[1].frac && lanes[1].frac > lanes[2].frac, "faster right answers fly further");
    assert.deepEqual(lanes.slice(3).map((l) => l.frac), [0, 0], "wrong answers do not move");
    assert.ok(lanes.every((l) => l.frac >= 0 && l.frac <= 1));
    assert.equal(moonPoints(5), 3500);
    assert.equal(rocketLanes({ total: 1, board: [{ name: "A", points: 99999, rank: 1 }] })[0].atMoon, true);
    // with every player sent (racers), more than the board's 8 show
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `P${i}`, points: i * 100 }));
    assert.equal(rocketLanes({ total: 10, board: [], racers: many }).length, 25);
    // the student's device: the normal live view (no answer key)
    const pv = playerView(room, studs[0].studentId!, t0 + 9000);
    assert.equal(pv.mode, "rocket-race");
  });

  test("Live Team Tug: two teams balanced by level; the rope follows team average points", async () => {
    const lv: PlayLevel[] = ["ABOVE", "ABOVE", "ON", "ON", "ON", "BELOW", "BELOW", "ABOVE", "ON", "BELOW"];
    const players = lv.map((level, i) => ({ id: `s${String(i).padStart(2, "0")}`, level }));
    const teams = splitTeams(players);
    const count = (t: "A" | "B", l?: PlayLevel) => players.filter((p) => teams.get(p.id) === t && (!l || p.level === l)).length;
    assert.equal(count("A"), 5); assert.equal(count("B"), 5);
    for (const l of LEVELS) assert.ok(Math.abs(count("A", l) - count("B", l)) <= 1, `${l} balanced`);
    assert.deepEqual([...splitTeams([...players].reverse())].sort(), [...teams].sort(), "stable whatever the order");
    assert.equal(teamForLateJoiner([{ team: "A", level: "ON" }, { team: "A", level: "ON" }, { team: "B", level: "ON" }], "ABOVE"), "B");
    assert.equal(teamForLateJoiner([{ team: "A", level: "ON" }, { team: "B", level: "BELOW" }], "BELOW"), "A");
    // the rope: averages, so a team with one player more has no advantage
    const st = tugState([{ team: "A", points: 900 }, { team: "A", points: 900 }, { team: "A", points: 900 }, { team: "B", points: 1000 }, { team: "B", points: 1000 }]);
    assert.deepEqual([st.teams.A.avg, st.teams.B.avg, st.leader], [900, 1000, "B"]);
    assert.ok(st.pos > 0 && st.pos < 1);
    assert.equal(tugState([]).pos, 0);
    assert.equal(tugState([{ team: "A", points: 500 }, { team: "B", points: 0 }]).pos, -1);

    // a real room: students' levels split the class; live scoring moves the rope
    const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId], mode: "team-tug", count: 5, seconds: 20, levelMode: "LEVEL" });
    const room = roomById(g.id)!;
    for (const k of studs.slice(0, 6)) await joinChallenge(repo, k, g.code);
    const split = splitTeams([...room.players.values()].map((p) => ({ id: p.studentId, level: p.level })));
    const t0 = Date.now();
    hostAct(room, "start", t0);
    // team A answers right, team B wrong
    for (const p of room.players.values()) {
      const ri = room.slots[0].byLevel[p.level];
      const ok = split.get(p.studentId) === "A";
      answer(room, p.studentId, 0, ok ? ri.right! : ri.view.options!.find((o) => o.label !== ri.right)!.label, t0 + 2000);
    }
    const rows = [...room.players.values()].map((p) => ({ team: split.get(p.studentId)!, points: p.points }));
    const rope = tugState(rows);
    assert.equal(rope.leader, "A"); assert.equal(rope.pos, -1, "all of Red right, all of Blue wrong");
    assert.ok(hostView(room).board.length >= 6);
  });
});
