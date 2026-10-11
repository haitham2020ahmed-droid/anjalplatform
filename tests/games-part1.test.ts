/**
 * 🎲 Games Part 1: the game framework (registry, bank-filled questions at the student's level, "Soon", power-ups,
 * result rows, ratings), Quiz Race, and the Live Challenge (in-memory rooms: join, answer, live board, pause, hide
 * board, results by skill, Reteach, rejoin, access refusals, room expiry). Games never change mastery or levels.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { setStudentLevels } from "../src/server/curriculum-map/levels";
import { GAMES, gameMeta, liveModes, readyGames } from "../src/games/registry";
import { GAME_IDS, type PlayQuestion } from "../src/games/types";
import { fiftyFifty, freshPowers, hintFor, scoreLive, scoreSolo, SOLO } from "../src/games/kit/powerups";
import { canPlayGameSkill, gameAvailability, pickQuestions, soloRound } from "../src/server/game/questions";
import { gamesUsage, rateGame, recordSoloResult } from "../src/server/game/results";
import { challengeResults, challengeSkills, hostRoom, joinChallenge, listChallengeTemplates, playerRoom, reteachChallenge, saveChallengeTemplate, startChallenge } from "../src/server/game/live-challenge";
import { answer, flush, hostAct, hostView, livePower, playerView, resetRooms, roomById, ROOM_TTL_MS, settle, subscribe, sweepRooms, type Room } from "../src/server/game/rooms";
import { answerGame, createGame, hostAction, joinGame, openGamesFor } from "../src/server/game/live";
import { loadQuestionItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

const ROOT = join(__dirname, "..");

describe("🎲 Games Part 1", () => {
  let repo: SqliteRepo; let teacher: Actor; let otherTeacher: Actor; let classId: string; let otherClassId: string;
  let studs: Actor[] = []; let outsider: Actor; let skillId: string; let skill2: string;
  const studentActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
  /** counts of everything a game must never write */
  const engineCounts = async () => ({
    attempts: await repo.count("QuestionAttempt"), mastery: await repo.count("StudentSkillMastery"), evidence: await repo.count("SkillEvidence"),
    levels: await repo.count("StudentLevel"), levelStates: await repo.count("StudentLevelState"), sessions: await repo.count("PracticeSession"),
  });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.2" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    otherClassId = (await teacherRoster(repo, otherTeacher))[0].id;
    studs = await Promise.all(r[0].students.slice(0, 5).map((x) => studentActor(x.id)));
    const inClass = new Set(r[0].students.map((x) => x.id));
    const sameSchool = await repo.findMany("Student", { schoolId: teacher.schoolId! });
    outsider = await studentActor(String(sameSchool.find((x) => !inClass.has(String(x.id)))!.id));
    // two skills of the class's grade with plenty of multiple-choice / True-False questions
    const grade = r[0].grade;
    const skills = (await challengeSkills(repo, teacher, { grade })).filter((k) => k.fitting >= 6).sort((a, b) => b.fitting - a.fitting);
    assert.ok(skills.length >= 2, "the test bank has skills for Quiz Race");
    [skillId, skill2] = [skills[0].id, skills[1].id];
  });
  after(() => resetRooms());

  // ------------------------------------------------------------------ registry
  test("registry: 10 games with names, icons, one line, types and minimum questions; only Quiz Race is ready", () => {
    assert.deepEqual(GAMES.map((g) => g.id), [...GAME_IDS]);
    for (const g of GAMES) {
      assert.ok(g.name && g.icon && g.line && g.types.length && g.minQuestions >= 3, g.id);
      assert.ok(g.roundSeconds >= 120 && g.roundSeconds <= 180, `${g.id}: rounds of 2–3 minutes`);
      assert.equal(gameMeta(g.id), g);
    }
    // Part 2 makes more games ready / live: Quiz Race always is, and a live mode is always a ready game
    assert.ok(readyGames().some((g) => g.id === "quiz-race"));
    assert.ok(liveModes().some((g) => g.id === "quiz-race"));
    assert.ok(liveModes().every((g) => g.ready && g.live));
    assert.deepEqual(gameMeta("quiz-race")!.types, ["MULTIPLE_CHOICE", "TRUE_FALSE"]);
    const loaders = readFileSync(join(ROOT, "src/games/loaders.ts"), "utf8");
    for (const id of GAME_IDS) assert.match(loaders, new RegExp(`"${id}": \\(\\) => import\\("\\./${id}/game"\\)`), `${id} is lazy-loaded`);
    // no game engines or heavy libraries: games import only React and the kit
    for (const id of GAME_IDS) assert.doesNotMatch(readFileSync(join(ROOT, `src/games/${id}/game.tsx`), "utf8"), /from "(phaser|pixi|three|howler|canvas-confetti)/);
  });

  // ------------------------------------------------------------------ power-ups (points only)
  test("power-ups change game points only — never whether an answer is correct", () => {
    const base = scoreSolo(true, 1, 0, []);
    assert.equal(base.points, SOLO.base + SOLO.speed);
    assert.equal(scoreSolo(true, 1, 0, ["double"]).points, base.points * 2, "Double Points");
    assert.deepEqual(scoreSolo(true, 1, 0, ["double"]).spent, ["double"]);
    assert.equal(scoreSolo(false, 1, 3, []).points, SOLO.wrong, "a wrong answer loses points");
    const sh = scoreSolo(false, 1, 3, ["shield"]);
    assert.deepEqual([sh.points, sh.shielded, sh.spent], [0, true, ["shield"]], "Shield: no point loss on the next wrong answer");
    assert.deepEqual(scoreSolo(true, 0, 0, ["shield"]).spent, [], "Shield waits for a wrong answer");
    assert.equal(scoreLive(true, 0, 20000, 0, []).points, 1000);
    assert.equal(scoreLive(true, 10000, 20000, 0, ["time"]).points, scoreLive(true, 5000, 20000, 0, []).points, "Extra Time: counted 5 s faster");
    assert.equal(scoreLive(true, 0, 20000, 0, ["double"]).points, 2000);
    assert.equal(scoreLive(false, 0, 20000, 4, ["shield"]).streak, 4, "a Shield keeps the streak in a Live Challenge");
    const q: PlayQuestion = { id: "q", skillId: "k", type: "MULTIPLE_CHOICE", stem: "?", level: 4, passage: null, hint: null, explain: null, options: [{ label: "A", text: "cat", correct: true }, { label: "B", text: "dog", correct: false }, { label: "C", text: "cow", correct: false }, { label: "D", text: "pig", correct: false }] };
    const hide = fiftyFifty(q.options)!;
    assert.equal(hide.length, 2); assert.ok(!hide.includes("A"), "50/50 never removes the right answer");
    assert.equal(fiftyFifty([{ label: "true", correct: true }, { label: "false", correct: false }]), null, "nothing to remove on True/False");
    assert.equal(hintFor(q), "c…");
    assert.equal(hintFor({ ...q, type: "TRUE_FALSE", options: [{ label: "true", text: "True", correct: true }] }), null, "a True/False hint never gives the answer away");
    assert.deepEqual(Object.values(freshPowers()), [1, 1, 1, 1, 1]);
  });

  // ------------------------------------------------------------------ question provider
  test("questions are filled from the bank automatically, at the student's level, only fitting types; never stored", async () => {
    const meta = gameMeta("quiz-race")!;
    const qCount = await repo.count("Question");
    for (const level of ["BELOW", "ON", "ABOVE"] as const) {
      const qs = await pickQuestions(repo, teacher.schoolId!, skillId, meta, level, 6);
      assert.ok(qs.length > 0);
      assert.ok(qs.every((q) => q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE"), "Quiz Race: multiple choice and True/False only");
      assert.ok(qs.every((q) => q.options!.filter((o) => o.correct).length === 1));
      const ids = (await repo.findMany("Question", { id: { in: qs.map((q) => q.id) } }, { select: ["id", "difficultyLevel", "skillId"] }));
      assert.ok(ids.every((r) => String(r.skillId) === skillId), "the skill's own questions");
      // the student's level first (topped up from other levels only when the level runs short)
      const want = level === "BELOW" ? [1, 2, 3] : level === "ON" ? [4] : [5, 6, 7];
      const atLevel = (await repo.findMany("Question", { skillId, status: "PUBLISHED", deletedAt: null }, { select: ["id", "difficultyLevel", "typeId"] }));
      const types = new Map((await repo.findMany("QuestionType")).map((t) => [String(t.id), String(t.code)]));
      const available = atLevel.filter((r) => want.includes(Number(r.difficultyLevel)) && ["MULTIPLE_CHOICE", "TRUE_FALSE"].includes(types.get(String(r.typeId))!)).length;
      const got = ids.filter((r) => want.includes(Number(r.difficultyLevel))).length;
      assert.equal(got, Math.min(available, qs.length), `${level}: ${got} of ${qs.length} at the level (${available} available)`);
    }
    // a student at Below Level gets a Below round
    const kid = studs[0];
    await setStudentLevels(repo, teacher, classId, [{ studentId: kid.studentId!, level: "BELOW" }]);
    const round = await soloRound(repo, kid, "quiz-race", skillId);
    assert.equal(round.level, "BELOW");
    assert.ok(round.questions.length >= meta.minQuestions && round.questions.length <= meta.roundSize);
    const diffs = await repo.findMany("Question", { id: { in: round.questions.map((q) => q.id) } }, { select: ["difficultyLevel"] });
    const qt = new Map((await repo.findMany("QuestionType")).map((t) => [String(t.id), String(t.code)]));
    const belowAvail = (await repo.findMany("Question", { skillId, status: "PUBLISHED", deletedAt: null }, { select: ["difficultyLevel", "typeId"] })).filter((r) => Number(r.difficultyLevel) <= 3 && ["MULTIPLE_CHOICE", "TRUE_FALSE"].includes(qt.get(String(r.typeId))!)).length;
    assert.equal(diffs.filter((d) => Number(d.difficultyLevel) <= 3).length, Math.min(belowAvail, diffs.length), "Below Level questions first");
    assert.equal(await repo.count("Question"), qCount, "no copies are stored");
  });

  test('"Soon": a game that is not built, or a skill without enough fitting questions', async () => {
    const av = await gameAvailability(repo, teacher.schoolId!, skillId);
    assert.equal(av.length, 10);
    assert.equal(av.find((g) => g.id === "quiz-race")!.status, "PLAY");
    assert.ok(av.filter((g) => !gameMeta(g.id)!.ready).every((g) => g.status === "SOON"), "games not built yet are Soon");
    // a skill with no multiple-choice / True-False questions → Quiz Race is Soon too
    const types = await repo.findMany("QuestionType", { code: { in: ["MULTIPLE_CHOICE", "TRUE_FALSE"] } });
    const all = await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null }, { select: ["skillId", "typeId"] });
    const has = new Set(all.filter((q) => types.some((t) => t.id === q.typeId)).map((q) => String(q.skillId)));
    const without = [...new Set(all.map((q) => String(q.skillId)))].find((k) => !has.has(k));
    if (without) assert.equal((await gameAvailability(repo, teacher.schoolId!, without)).find((g) => g.id === "quiz-race")!.status, "SOON");
    const notBuilt = GAMES.find((g) => !g.ready);
    if (notBuilt) await assert.rejects(soloRound(repo, studs[1], notBuilt.id, skillId), /coming soon/);
  });

  test("solo access: My Work skills (any grade) or the student's grade; not other schools' skills; students only", async () => {
    assert.equal(await canPlayGameSkill(repo, studs[1], skillId), true);
    assert.equal(await canPlayGameSkill(repo, teacher, skillId), false);
    assert.equal(await canPlayGameSkill(repo, studs[1], "no-such-skill"), false);
    await assert.rejects(soloRound(repo, teacher, "quiz-race", skillId), ForbiddenError);
  });

  // ------------------------------------------------------------------ result rows + ratings
  test("a solo round leaves ONE result row (correct / incorrect); mastery, levels and attempts never change", async () => {
    const kid = studs[1];
    const before0 = await engineCounts();
    const round = await soloRound(repo, kid, "quiz-race", skillId);
    const id = await recordSoloResult(repo, kid, { roundId: round.roundId, correct: round.questions.length - 2, incorrect: 2, points: 1234 });
    const row = (await repo.findUnique("GamePlay", { id }))!;
    assert.deepEqual([row.studentId, row.skillId, row.gameId, row.mode, Number(row.correct), Number(row.incorrect), Number(row.points)], [kid.studentId, skillId, "quiz-race", "SOLO", round.questions.length - 2, 2, 1234]);
    assert.ok(row.createdAt);
    await assert.rejects(recordSoloResult(repo, kid, { roundId: round.roundId, correct: 9, incorrect: 0, points: 1 }), /ended/, "one row per round");
    await assert.rejects(recordSoloResult(repo, studs[2], { roundId: (await soloRound(repo, kid, "quiz-race", skillId)).roundId, correct: 1, incorrect: 0, points: 0 }), /ended/, "only the student who played");
    const r2 = await soloRound(repo, kid, "quiz-race", skillId);
    const id2 = await recordSoloResult(repo, kid, { roundId: r2.roundId, correct: 999, incorrect: 999, points: 5 });
    const row2 = (await repo.findUnique("GamePlay", { id: id2 }))!;
    assert.ok(Number(row2.correct) + Number(row2.incorrect) <= r2.questions.length, "counts are capped at the questions served");
    assert.deepEqual(await engineCounts(), before0, "games never touch attempts, mastery, evidence or levels");
  });

  test("ratings 1–5 (latest counts) and the most played / best rated report", async () => {
    await rateGame(repo, studs[1], "quiz-race", 4);
    await rateGame(repo, studs[1], "quiz-race", 5);
    await rateGame(repo, studs[2], "quiz-race", 3);
    await assert.rejects(rateGame(repo, studs[2], "quiz-race", 9), /1 to 5/);
    await assert.rejects(rateGame(repo, teacher, "quiz-race", 3), ForbiddenError);
    assert.equal(await repo.count("GameRating", { gameId: "quiz-race" }), 2);
    const rep = await gamesUsage(repo, teacher);
    assert.equal(rep.rows[0].gameId, "quiz-race", "most played first");
    assert.equal(rep.rows[0].avgStars, 4);
    assert.ok(rep.rows[0].plays >= 2 && rep.rows[0].solo >= 2);
    assert.equal(rep.rows.length, 10);
    const other = await gamesUsage(repo, otherTeacher);
    assert.equal(other.rows[0].plays, 0, "a teacher sees plays of their own classes' students only");
  });

  // ------------------------------------------------------------------ Live Challenge
  test("Live Challenge: access — own classes only, class students only (also by typed code), host only", async () => {
    await assert.rejects(startChallenge(repo, teacher, { classId: otherClassId, skillIds: [skillId] }), ForbiddenError, "another teacher's class");
    await assert.rejects(startChallenge(repo, studs[0], { classId, skillIds: [skillId] }), ForbiddenError);
    await assert.rejects(startChallenge(repo, teacher, { classId, skillIds: [skillId], mode: "no-such-game" as never }), /game mode/);
    const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId, skill2], count: 6, seconds: 20 });
    assert.match(g.code, /^\d{6}$/);
    await assert.rejects(joinChallenge(repo, outsider, g.code), ForbiddenError, "a student of another class cannot join");
    await assert.rejects(joinChallenge(repo, teacher, g.code), ForbiddenError);
    assert.throws(() => hostRoom(otherTeacher, g.id), ForbiddenError, "another teacher cannot run it");
    assert.throws(() => playerRoom(outsider, g.code), ForbiddenError, "the stream refuses students who did not join");
    assert.equal(await joinChallenge(repo, studs[0], "999999"), null, "no room: falls back to the older games");
    hostAct(roomById(g.id)!, "end");
  });

  test("Live Challenge: lobby, live board, pause, hide board, show answer / next, results by skill, Reteach, rejoin", async () => {
    const before0 = await engineCounts();
    const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId, skill2], count: 5, seconds: 20, levelMode: "SAME", title: "Friday challenge" });
    const room = roomById(g.id)!;
    assert.equal(room.slots.length, 5);
    assert.deepEqual(room.slots.map((s) => s.skillId), [skillId, skill2, skillId, skill2, skillId], "a fair mix across the skills");
    const hostMsgs: string[] = []; const kidMsgs: string[] = [];
    subscribe(room, { kind: "host", send: (j) => hostMsgs.push(j) });
    // the open challenge is on the students' home page
    assert.ok((await openGamesFor(repo, studs[0])).some((x) => x.code === g.code));
    for (const k of studs) await joinChallenge(repo, k, g.code);
    await joinChallenge(repo, studs[0], g.code);   // twice is harmless
    const lobby = hostView(room);
    assert.equal(lobby.joined, 5); assert.ok(lobby.expected >= 5, "“5 of N joined”");
    assert.ok(lobby.names.every((n) => !n.includes(" ") || /\s\w\.$/.test(n)), "first names only");
    const unsub = subscribe(room, { kind: "player", studentId: studs[0].studentId!, send: (j) => kidMsgs.push(j) });
    assert.equal(JSON.parse(kidMsgs[0]).status, "LOBBY", "a new connection gets the state at once");

    const t0 = Date.now();
    hostAct(room, "start", t0);
    const pv = playerView(room, studs[0].studentId!, t0);
    assert.equal(pv.status, "QUESTION");
    assert.ok(pv.question!.options!.length >= 2 && !("correct" in pv.question!.options![0]), "devices never get the answer key");
    const key = (ix: number, wrong = false) => { const ri = room.slots[ix].byLevel.ON; return wrong ? ri.view.options!.find((o) => o.label !== ri.right)!.label : ri.right!; };
    // power-ups on a live device
    const armed = livePower(room, studs[0].studentId!, "double", t0);
    assert.deepEqual(armed.armed, ["double"]);
    assert.throws(() => livePower(room, studs[0].studentId!, "double", t0), /used/);
    const a0 = answer(room, studs[0].studentId!, 0, key(0), t0 + 1000);
    assert.equal(a0.correct, true); assert.equal(a0.doubled, true);
    assert.throws(() => answer(room, studs[0].studentId!, 0, key(0), t0 + 1200), /already answered/);
    answer(room, studs[1].studentId!, 0, key(0, true), t0 + 2000);
    answer(room, studs[2].studentId!, 0, key(0), t0 + 9000);
    // pause stops the clock; answers wait
    hostAct(room, "pause", t0 + 10_000);
    assert.throws(() => answer(room, studs[3].studentId!, 0, key(0), t0 + 11_000), /paused/);
    settle(room, t0 + 60_000);
    assert.equal(room.status, "QUESTION", "no time runs out while paused");
    hostAct(room, "resume", t0 + 60_000);
    const hv = hostView(room, t0 + 60_100);
    assert.ok(hv.leftMs! > 9000 && hv.leftMs! <= 10_000, "the clock goes on where it stopped");
    assert.equal(hv.answered, 3);
    assert.equal(hv.board[0].name, room.players.get(studs[0].studentId!)!.name);
    assert.equal(hv.board[0].medal, "gold"); assert.equal(hv.board[1].medal, "silver"); assert.equal(hv.board[2].medal, "bronze");
    assert.ok(hv.board.length <= 8);
    hostAct(room, "toggle-board"); assert.equal(hostView(room).boardHidden, true, "Hide board");
    hostAct(room, "toggle-board"); assert.equal(hostView(room).boardHidden, false);
    // the remaining two answer → everyone answered → the answer shows by itself
    answer(room, studs[3].studentId!, 0, key(0), t0 + 61_000);
    answer(room, studs[4].studentId!, 0, key(0, true), t0 + 61_500);
    assert.equal(room.status, "REVEAL");
    const reveal = playerView(room, studs[1].studentId!);
    assert.equal(reveal.right, key(0)); assert.equal(reveal.mine!.correct, false);
    assert.ok(reveal.rank >= 1 && reveal.rank <= 5, "own points and rank after each question");
    flush(room);
    assert.ok(hostMsgs.length >= 2, "the host screen got pushed updates");
    assert.ok(hostMsgs.every((m) => m.length < 6000), "small JSON updates");

    // Q2: a dropped connection rejoins the same player with points kept
    hostAct(room, "next", t0 + 70_000);
    unsub();
    const pointsBefore = room.players.get(studs[0].studentId!)!.points;
    const back = await joinChallenge(repo, studs[0], g.code);
    assert.equal(back, room);
    const again: string[] = [];
    subscribe(room, { kind: "player", studentId: studs[0].studentId!, send: (j) => again.push(j) });
    const snap = JSON.parse(again[0]);
    assert.deepEqual([snap.status, snap.index, snap.points], ["QUESTION", 1, pointsBefore], "rejoined: same game, same points");
    // a cheer when someone jumps up the board
    for (const k of studs.slice(1)) answer(room, k.studentId!, 1, key(1), t0 + 70_500);
    const ch = hostView(room, t0 + 70_600).cheers;
    assert.ok(ch.length >= 1 && ch[0].to < ch[0].from && ch[0].from - ch[0].to >= 2, "a cheer: “… jumped from 4th to 2nd!”");
    answer(room, studs[0].studentId!, 1, key(1, true), t0 + 75_000);
    // Q3: time runs out (nobody answers) → not correct for that skill
    hostAct(room, "next", t0 + 80_000);
    settle(room, t0 + 80_000 + 21_600);
    assert.equal(room.status, "REVEAL", "time up: the answer shows by itself");
    hostAct(room, "next", t0 + 110_000);
    answer(room, studs[4].studentId!, 3, key(3), t0 + 110_300);
    const moved = hostView(room, t0 + 110_400).board;
    assert.ok(moved[0].name === room.players.get(studs[4].studentId!)!.name && moved[0].move >= 3, "up arrows: the last player jumped to 1st");
    assert.ok(moved.some((b) => b.move < 0), "down arrows for the players passed");
    hostAct(room, "reveal", t0 + 111_000);
    hostAct(room, "next", t0 + 112_000);
    hostAct(room, "next", t0 + 113_000);   // Show answer / Next on the last question → results
    assert.equal(room.status, "FINISHED");
    for (let i = 0; i < 50 && !room.savedId; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(room.savedId, g.id, "the summary is saved at the end");

    // saved in Reports: the live-game tables + one GamePlay row per student per skill
    const lg = (await repo.findUnique("LiveGame", { id: g.id }))!;
    assert.deepEqual([lg.status, lg.mode, lg.classId], ["FINISHED", "quiz-race", classId]);
    assert.equal(await repo.count("LiveGamePlayer", { gameId: g.id }), 5);
    assert.ok(await repo.count("LiveGameAnswer", { gameId: g.id }) >= 10);
    const plays = await repo.findMany("GamePlay", { liveGameId: g.id });
    assert.equal(plays.filter((p) => p.studentId === studs[0].studentId && p.skillId === skillId).map((p) => [Number(p.correct), Number(p.incorrect)]).flat().join(), "1,2");
    assert.equal(plays.length, 10, "5 students × 2 skills");
    assert.ok(plays.every((p) => p.mode === "LIVE" && Number(p.points) === 0), "points never go into the result rows");
    const res = await challengeResults(repo, teacher, g.id);
    assert.equal(res.summary.results.top.length, 3);
    assert.equal(res.summary.results.skills.length, 2);
    for (const k of res.summary.results.skills) assert.equal(k.low, k.pct !== null && k.pct < 70, "below 70% is marked");
    const s0 = res.summary.results.students.find((x) => x.studentId === studs[0].studentId)!;
    assert.deepEqual([s0.bySkill[skillId].correct, s0.bySkill[skillId].total], [1, 3], "Q1 right, Q3 timed out, Q5 not answered");
    await assert.rejects(challengeResults(repo, otherTeacher, g.id), ForbiddenError, "other teachers cannot open the results");

    // Reteach: every skill under 70% → that student's My Work (the Assessments path)
    await assert.rejects(reteachChallenge(repo, otherTeacher, g.id), ForbiddenError);
    const rt = await reteachChallenge(repo, teacher, g.id);
    assert.ok(rt.assigned >= 1 && rt.students >= 1);
    const low = res.summary.results.students.filter((st) => (st.bySkill[skillId]?.pct ?? 100) < 70).map((st) => st.studentId);
    for (const sid of low) {
      const as = await repo.findMany("AssignmentStudent", { studentId: sid });
      const a = await repo.findMany("Assignment", { id: { in: as.map((x) => x.assignmentId) }, skillId });
      assert.ok(a.some((x) => String(x.note ?? "").startsWith("Reteach: Friday challenge")), "in My Work with a Reteach note");
    }
    const saved = (await repo.findUnique("LiveGame", { id: g.id }))!.summary;
    assert.ok((typeof saved === "string" ? JSON.parse(saved) : saved).reteachAt, "Reteach is remembered");
    assert.deepEqual(await engineCounts(), before0, "Live Challenge answers never touch attempts, mastery, evidence or levels");
  });

  test("each student's level: one question version per level", async () => {
    await setStudentLevels(repo, teacher, classId, [{ studentId: studs[3].studentId!, level: "ABOVE" }, { studentId: studs[4].studentId!, level: "BELOW" }]);
    const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId], count: 3, seconds: 15, levelMode: "LEVEL" });
    const room = roomById(g.id)!;
    for (const k of studs) await joinChallenge(repo, k, g.code);
    hostAct(room, "start");
    const above = playerView(room, studs[3].studentId!).question!, below = playerView(room, studs[4].studentId!).question!;
    const it = async (stem: string) => (await repo.findMany("Question", { stem, skillId }, { select: ["difficultyLevel"] }))[0];
    const [qa, qb] = [await it(above.stem), await it(below.stem)];
    assert.ok(Number(qa?.difficultyLevel) >= Number(qb?.difficultyLevel), "the Above student's question is not easier than the Below student's");
    // answering their own version is scored against their own version
    const ri = room.slots[0].byLevel.ABOVE;
    assert.equal(answer(room, studs[3].studentId!, 0, ri.right!).correct, true);
    hostAct(room, "end");
  });

  test("templates: Save as template, list, own only", async () => {
    const id = await saveChallengeTemplate(repo, teacher, { title: "Grammar warm-up", spec: { skillIds: [skillId, skill2], mode: "quiz-race", count: 12, seconds: 15, levelMode: "LEVEL" } });
    const list = await listChallengeTemplates(repo, teacher);
    assert.deepEqual([list[0].id, list[0].spec.count, list[0].spec.levelMode, list[0].spec.skillIds.length], [id, 12, "LEVEL", 2]);
    assert.equal((await listChallengeTemplates(repo, otherTeacher)).length, 0);
    await assert.rejects(saveChallengeTemplate(repo, otherTeacher, { id, title: "x", spec: { skillIds: [skillId] } }), ForbiddenError);
  });

  test("rooms close after 60 minutes (a started game's summary is saved first)", async () => {
    const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId], count: 3 });
    const room: Room = roomById(g.id)!;
    await joinChallenge(repo, studs[0], g.code);
    hostAct(room, "start");
    const closed = sweepRooms(room.createdAt + ROOM_TTL_MS + 1);
    assert.ok(closed >= 1);
    assert.equal(roomById(g.id), null, "the room is gone from memory");
    await assert.rejects(joinChallenge(repo, studs[0], g.code).then((r) => { if (!r) throw new Error("No game"); }), /No game/);
    for (let i = 0; i < 50 && !(await repo.findUnique("LiveGame", { id: g.id })); i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(await repo.findUnique("LiveGame", { id: g.id }), "the summary was saved");
  });

  test("the older live games still run, but their answers no longer feed mastery (games never change levels)", async () => {
    const before0 = await engineCounts();
    const g = await createGame(repo, teacher, { title: "Old style", skillIds: [skillId], classId, count: 3, seconds: 20 });
    await joinGame(repo, studs[0], g.code);
    await hostAction(repo, teacher, g.id, "start");
    const row = (await repo.findUnique("LiveGame", { id: g.id }))!;
    const qid = (typeof row.questionIds === "string" ? JSON.parse(row.questionIds) : row.questionIds)[0];
    const it = (await loadQuestionItems(repo, [qid]))[0];
    const right = it.type === "TRUE_FALSE" ? String(it.answer) : it.options!.find((o) => o.correct)!.label;
    const r = await answerGame(repo, studs[0], g.id, 0, right, new Date(Date.now() + 8000));
    assert.equal(r.correct, true);
    assert.deepEqual(await engineCounts(), before0);
    const src = readFileSync(join(ROOT, "src/server/game/live.ts"), "utf8");
    assert.doesNotMatch(src, /recordEngineAttempt|safeFeed/, "no engine call left in the live game");
    for (const f of ["src/server/game/rooms.ts", "src/server/game/live-challenge.ts", "src/server/game/questions.ts", "src/server/game/results.ts"]) {
      assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /recordEngineAttempt|safeFeed|updateMastery|recordLevel|startPractice|submitAnswer/, `${f} never calls the adaptive engine`);
    }
  });
});
