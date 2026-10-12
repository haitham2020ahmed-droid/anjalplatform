/**
 * 🧩 Games integration: avatars + favorite badge emblems on the Live Board / lobby / devices, coins and badges from
 * games (solo "game", Live Challenge "live" + "live.win", the 25-a-day cap, effort counts), the live hooks (Mystery
 * Chest "take points from a classmate", Team Tug teams, Rocket Race field, ProjectorView), the games report (most
 * played, best rated, by class) and the acceptance checks (access, typed URL, rejoin, 60-minute rooms, a class of
 * 30, games never change levels, no new student-home tiles).
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
import { soloRound } from "../src/server/game/questions";
import { gamesUsage, rateGame, recordSoloPlay } from "../src/server/game/results";
import { challengeResults, challengeSkills, hostRoom, joinChallenge, playerRoom, rewardChallenge, startChallenge } from "../src/server/game/live-challenge";
import {
  answer, chestDeal, createRoom, flush, hostAct, hostView, joinRoom, openChest, playerView, resetRooms, roomById, ROOM_TTL_MS, splitTeams, subscribe, sweepRooms, type Room,
} from "../src/server/game/rooms";
import { classGamesReport } from "../src/server/reports/games-report";
import { GAME_DAILY_CAP, COINS } from "../src/server/motivation/coins";
import { studentBadges } from "../src/server/student/badges";
import { LIVE_FEATURES, liveFeatures, CHEST, TEAMS } from "../src/games/live-features";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";
import { topUpGameBank } from "./helpers/game-bank";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const waitFor = async (fn: () => Promise<boolean> | boolean, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

describe("🧩 Games integration", () => {
  let repo: SqliteRepo; let teacher: Actor; let otherTeacher: Actor; let classId: string; let otherClassId: string;
  let studs: Actor[] = []; let outsider: Actor; let skillId: string; let skill2: string;
  const studentActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
  const engineCounts = async () => ({
    attempts: await repo.count("QuestionAttempt"), mastery: await repo.count("StudentSkillMastery"), evidence: await repo.count("SkillEvidence"),
    levels: await repo.count("StudentLevel"), levelStates: await repo.count("StudentLevelState"), sessions: await repo.count("PracticeSession"),
  });
  const ledger = (studentId: string, reason: string, refId?: string) => repo.findMany("CoinLedger", { studentId, reason, ...(refId ? { refId } : {}) });
  /** a room in any mode (modes 2–10 become live in Part 2; the hooks are tested on the room itself) */
  const roomFrom = (base: Room, mode: Room["mode"], levels = new Map<string, "BELOW" | "ON" | "ABOVE">()): Room =>
    createRoom({ id: `t${mode}${Math.random().toString(36).slice(2, 10)}`, code: String(100000 + Math.floor(Math.random() * 899999)), schoolId: base.schoolId, classId: base.classId, className: base.className, hostUserId: base.hostUserId, title: mode, mode, seconds: 20, levelMode: "SAME", slots: base.slots, expected: 30, levels });
  const key = (room: Room, ix: number, wrong = false) => { const ri = room.slots[ix].byLevel.ON; return wrong ? ri.view.options!.find((o) => o.label !== ri.right)!.label : ri.right!; };

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.2" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    otherClassId = (await teacherRoster(repo, otherTeacher))[0].id;
    studs = await Promise.all(r[0].students.slice(0, 5).map((x) => studentActor(x.id)));
    const inClass = new Set(r[0].students.map((x) => x.id));
    outsider = await studentActor(String((await repo.findMany("Student", { schoolId: teacher.schoolId! })).find((x) => !inClass.has(String(x.id)))!.id));
    const skills = (await challengeSkills(repo, teacher, { grade: r[0].grade })).filter((k) => k.fitting >= 6).sort((a, b) => b.fitting - a.fitting);
    [skillId, skill2] = [skills[0].id, skills[1].id];
    // games need a full round of fitting questions (MIN_QUESTIONS_PER_GAME); the test bank has 6 per skill
    for (const k of [skillId, skill2]) await topUpGameBank(repo, k);
    // test data only: one student picked a favorite badge and an avatar
    await repo.upsert("StudentReward", { studentId: studs[0].studentId! }, { studentId: studs[0].studentId!, favoriteBadge: "quiz-whiz", avatar: JSON.stringify({ base: "robot", color: "teal", hat: "cap", glasses: null }) }, { favoriteBadge: "quiz-whiz" });
  });
  after(() => resetRooms());

  // ------------------------------------------------------------------ coins from solo play
  test("solo play: coins for a finished round (effort counts), refId = the play id, daily game cap of 25", async () => {
    const kid = studs[3];
    const r1 = await soloRound(repo, kid, "quiz-race", skillId);
    const p1 = await recordSoloPlay(repo, kid, { roundId: r1.roundId, correct: 0, incorrect: 3, points: 0 });
    assert.equal(p1.coins, COINS.game, "all wrong still earns the small game coins");
    assert.equal((await ledger(kid.studentId!, "game", p1.id)).length, 1, "refId = the play id");
    const r0 = await soloRound(repo, kid, "quiz-race", skillId);
    assert.equal((await recordSoloPlay(repo, kid, { roundId: r0.roundId, correct: 0, incorrect: 0, points: 0 })).coins, 0, "no answers → no coins");
    let total = p1.coins;
    for (let i = 0; i < 12; i++) { const r = await soloRound(repo, kid, "quiz-race", skillId); total += (await recordSoloPlay(repo, kid, { roundId: r.roundId, correct: 2, incorrect: 1, points: 10 })).coins; }
    assert.equal(total, GAME_DAILY_CAP, "games pay at most 25 coins a day");
    assert.ok((await ledger(kid.studentId!, "game")).length >= 13, "over the cap the event is still recorded (0 coins)");
    assert.match(read("src/app/api/play/route.ts"), /recordSoloPlay\(repo, actor/);
    assert.match(read("src/games/kit/runner.tsx"), /coins for playing/);
  });

  // ------------------------------------------------------------------ Live Challenge: emblems, rewards, Reports
  test("Live Challenge: avatars + favorite badges in the lobby, on the board and devices; coins + badges once at the end", async () => {
    const before0 = await engineCounts();
    const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId, skill2], count: 3, seconds: 20 });
    const room = roomById(g.id)!;
    for (const k of studs) await joinChallenge(repo, k, g.code);
    const lobby = hostView(room);
    assert.equal(lobby.lobby.length, 5);
    assert.ok(lobby.lobby.every((x) => x.avatar && x.avatar.base), "every joined student has an avatar (default when none chosen)");
    const me0 = lobby.lobby.find((x) => x.name === room.players.get(studs[0].studentId!)!.name)!;
    assert.deepEqual([me0.avatar!.base, me0.badge], ["robot", "quiz-whiz"], "the student's own avatar and favorite badge");
    assert.equal(playerView(room, studs[0].studentId!).me.badge, "quiz-whiz", "the device shows it too");
    const t0 = Date.now();
    hostAct(room, "start", t0);
    // studs[4] joins but never answers (no participation coins); the others play
    for (const ix of [0, 1, 2]) {
      answer(room, studs[0].studentId!, ix, key(room, ix), t0 + ix * 30_000 + 500);
      for (const k of studs.slice(1, 4)) answer(room, k.studentId!, ix, key(room, ix, true), t0 + ix * 30_000 + 4000);
      hostAct(room, ix === 2 ? "end" : "next", t0 + ix * 30_000 + 25_000);
    }
    const hv = hostView(room);
    assert.equal(hv.status, "FINISHED");
    assert.equal(hv.results!.top[0].badge, "quiz-whiz", "podium with the emblem");
    assert.ok(hv.results!.top.every((x) => x.avatar));
    assert.ok(await waitFor(() => !!room.savedId), "summary saved");
    assert.ok(await waitFor(async () => (await ledger(studs[0].studentId!, "live.win", g.id)).length === 1), "the winner gets live.win once");
    for (const k of studs.slice(0, 4)) assert.ok(await waitFor(async () => (await ledger(k.studentId!, "live", g.id)).length === 1), "participation coins for everyone who answered (effort counts)");
    assert.equal((await ledger(studs[4].studentId!, "live", g.id)).length, 0, "joined without answering: no coins");
    assert.equal((await ledger(studs[1].studentId!, "live.win", g.id)).length, 0);
    assert.ok(await waitFor(() => room.players.get(studs[0].studentId!)!.coins !== null));
    assert.ok(playerView(room, studs[0].studentId!).coins! > 0, "the device shows the coins at the end");
    // idempotent: running the rewards again pays nothing
    await rewardChallenge(repo, room);
    assert.equal((await repo.findMany("CoinLedger", { refId: g.id })).length, 5, "4 × live + 1 × live.win");
    assert.ok((await studentBadges(repo, studs[0].studentId!)).find((b) => b.code === "game-champion")!.earned, "Game Champion badge");
    // Live Challenge results are in Reports (live games report + the saved results)
    const rep = await classGamesReport(repo, teacher, classId);
    assert.ok(rep.games.some((x) => x.id === g.id), "the Live Challenge shows in the class's Live games report");
    assert.equal((await challengeResults(repo, teacher, g.id)).summary.results.students.length, 5);
    assert.deepEqual(await engineCounts(), before0, "coins, badges and live play never touch attempts, mastery or levels");
  });

  // ------------------------------------------------------------------ hook (a): Mystery Chest
  test("Mystery Chest: a right answer opens 1 of 3 chests; taking points from the leader never goes below 0; on the board", async () => {
    const base = roomById((await startChallenge(repo, teacher, { classId, skillIds: [skillId], count: 3 })).id)!;
    const room = roomFrom(base, "mystery-chest");
    assert.deepEqual(room.features, { chest: true });
    const [a, b, c, d] = studs.map((k, i) => joinRoom(room, { studentId: k.studentId!, displayName: `Kid${i} Test`, level: "ON" })).slice(0, 4);
    const t0 = Date.now();
    hostAct(room, "start", t0);
    // each question's three chests: one of each prize, the same for everyone
    assert.deepEqual([...chestDeal(room, 0)].sort(), ["bonus", "double", "steal"]);
    assert.equal(chestDeal(room, 0), chestDeal(room, 0), "dealt once");
    room.chestDeals.set(0, ["steal", "double", "bonus"]);
    answer(room, a.studentId, 0, key(room, 0), t0 + 1000);
    assert.equal(playerView(room, a.studentId, t0 + 1000).chest!.available, true);
    answer(room, b.studentId, 0, key(room, 0, true), t0 + 1050);
    assert.throws(() => openChest(room, b.studentId, 0, 1, undefined, t0 + 1100), /right answer/, "no chest without a right answer");
    const first = openChest(room, a.studentId, 0, 0, undefined, t0 + 1200);
    assert.equal(first.prize, "bonus", "a steal with nobody to take from is a bonus");
    assert.throws(() => openChest(room, a.studentId, 0, 1, undefined, t0 + 1300), /already/);
    // the Mystery Chest pad sends { choice, chest }: a right answer opens the chest at once
    const cBefore = c.points;
    const withChest = answer(room, c.studentId, 0, { choice: key(room, 0), chest: 1 }, t0 + 3000);
    assert.equal(withChest.correct, true);
    assert.equal(withChest.chest!.prize, "double");
    assert.equal(c.points, cBefore + withChest.points + Math.max(CHEST.doubleMin, withChest.points));
    const wrong = answer(room, d.studentId, 0, { choice: key(room, 0, true), chest: 0 }, t0 + 3500);
    assert.deepEqual([wrong.correct, wrong.chest], [false, null], "a wrong answer opens nothing");
    hostAct(room, "next", t0 + 10_000);
    // Q2: b answers right and takes points from the classmate in the lead (never below 0)
    room.chestDeals.set(1, ["bonus", "steal", "double"]);
    a.points = 120; c.points = 90; d.points = 0;   // a leads with a small balance: the steal stops at 0
    answer(room, b.studentId, 1, key(room, 1), t0 + 11_000);
    const before = { b: b.points, correctA: a.correct, correctB: b.correct };
    const st = openChest(room, b.studentId, 1, 1, undefined, t0 + 11_100);
    assert.deepEqual([st.prize, st.from, st.points], ["steal", a.name, 120], "from the leader, only what they have");
    assert.equal(a.points, 0, "never below 0"); assert.equal(b.points, before.b + 120);
    assert.deepEqual([a.correct, b.correct], [before.correctA, before.correctB], "chests change game points only, never correct / incorrect");
    const hv = hostView(room, t0 + 11_200);
    assert.equal(hv.events[0].kind, "steal"); assert.equal(hv.events[0].other, a.name);
    assert.deepEqual(playerView(room, a.studentId, t0 + 11_200).hits[0], { name: b.name, points: 120 }, "the classmate's device says who took the points");
    assert.equal(JSON.stringify(hv).includes(a.studentId), false, "no student ids go to the projector");
    assert.match(read("src/app/api/live/[key]/route.ts"), /action === "chest"[\s\S]*openChest\(room, actor\.studentId!/);
    // Quiz Race rooms ignore chest picks (a plain answer is still required)
    assert.throws(() => answer(base, a.studentId, 0, { choice: "A", chest: 0 }), /Join the game first|answers|closed/);
    hostAct(room, "end"); hostAct(base, "end");
  });

  // ------------------------------------------------------------------ hook (b): Team Tug
  test("Team Tug: balanced auto-split by level, late joiners to the smaller team, team points on board / projector / devices, team win", async () => {
    const base = roomById((await startChallenge(repo, teacher, { classId, skillIds: [skillId], count: 3 })).id)!;
    const levels = new Map<string, "BELOW" | "ON" | "ABOVE">();
    const ids = Array.from({ length: 7 }, (_, i) => `team-kid-${i}`);
    ["ABOVE", "ABOVE", "ABOVE", "ABOVE", "BELOW", "BELOW", "ON"].forEach((l, i) => levels.set(ids[i], l as "ABOVE"));
    const room = roomFrom(base, "team-tug", levels);
    for (const id of ids.slice(0, 6)) joinRoom(room, { studentId: id, displayName: id, level: levels.get(id)! });
    hostAct(room, "start");
    const team = (t: number) => [...room.players.values()].filter((p) => p.team === t);
    assert.deepEqual([team(0).length, team(1).length], [3, 3]);
    for (const t of [0, 1]) assert.equal(team(t).filter((p) => levels.get(p.studentId) === "ABOVE").length, 2, "Above Level students are split evenly");
    joinRoom(room, { studentId: ids[6], displayName: ids[6], level: "ON" });
    assert.equal(team(0).length + team(1).length, 7);
    assert.ok(Math.abs(team(0).length - team(1).length) === 1, "a late joiner goes to a team, sizes stay balanced");
    splitTeams(room);   // re-split is stable in size
    assert.ok(Math.abs(team(0).length - team(1).length) <= 1);
    for (const p of team(0)) answer(room, p.studentId, 0, key(room, 0));
    for (const p of team(1)) answer(room, p.studentId, 0, key(room, 0, true));
    const hv = hostView(room);
    assert.ok(hv.teams![0].points > 0 && hv.teams![1].points === 0);
    assert.ok(hv.rope! < 0, "the rope moves toward team 0");
    assert.equal(hv.field!.length, 7, "the projector gets every player");
    assert.ok(hv.board.every((r) => r.team === 0 || r.team === 1));
    const pv = playerView(room, team(1)[0].studentId);
    assert.equal(pv.team, 1); assert.equal(pv.teams!.length, 2);
    hostAct(room, "end");
    const res = hostView(room).results!;
    assert.equal(res.teams!.winner, 0, "team results");
    hostAct(base, "end");
  });

  test("team rewards: every member of the winning team gets live.win (real students)", async () => {
    const base = roomById((await startChallenge(repo, teacher, { classId, skillIds: [skillId], count: 3 })).id)!;
    const room = roomFrom(base, "team-tug");
    for (const k of studs.slice(0, 4)) joinRoom(room, { studentId: k.studentId!, displayName: "Kid", level: "ON" });
    hostAct(room, "start");
    const win = [...room.players.values()].filter((p) => p.team === 0), lose = [...room.players.values()].filter((p) => p.team === 1);
    for (const p of win) answer(room, p.studentId, 0, key(room, 0));
    for (const p of lose) answer(room, p.studentId, 0, key(room, 0, true));
    hostAct(room, "end");
    const r = await rewardChallenge(repo, room);
    assert.deepEqual(new Set(r.winners), new Set(win.map((p) => p.studentId)));
    for (const p of lose) assert.equal((await ledger(p.studentId, "live.win", room.id)).length, 0);
    for (const p of [...win, ...lose]) assert.equal((await ledger(p.studentId, "live", room.id)).length, 1, "everyone who played: participation");
    hostAct(base, "end");
  });

  // ------------------------------------------------------------------ hooks (c) + (d): Rocket Race, ProjectorView
  test("Rocket Race projector field + ProjectorView hook with kit fallbacks; a class of 30 stays small and fast", async () => {
    assert.deepEqual(liveFeatures("rocket-race"), { field: true });
    assert.deepEqual(liveFeatures("quiz-race"), {}, "Quiz Race keeps the default board");
    assert.ok(LIVE_FEATURES["team-tug"]!.teams && LIVE_FEATURES["mystery-chest"]!.chest);
    const base = roomById((await startChallenge(repo, teacher, { classId, skillIds: [skillId, skill2], count: 10 })).id)!;
    const room = roomFrom(base, "rocket-race");
    const av = { base: "fox", color: "teal", hat: "crown", glasses: "round" };
    for (let i = 0; i < 30; i++) joinRoom(room, { studentId: `load-${i}`, displayName: `Student${i} Load`, level: "ON", avatar: av, badge: i % 3 ? "quiz-whiz" : null });
    const sent: number[] = [];
    subscribe(room, { kind: "host", send: (j) => sent.push(j.length) });
    for (let i = 0; i < 30; i++) subscribe(room, { kind: "player", studentId: `load-${i}`, send: (j) => sent.push(j.length) });
    const t0 = Date.now();
    const cpu = process.cpuUsage();
    hostAct(room, "start", t0);
    for (let q = 0; q < room.slots.length; q++) {
      for (let i = 0; i < 30; i++) answer(room, `load-${i}`, q, key(room, q, i % 4 === 0), t0 + q * 30_000 + 200 + i * 50);
      flush(room, t0 + q * 30_000 + 2000);
      if (q + 1 < room.slots.length) hostAct(room, "next", t0 + q * 30_000 + 25_000);
    }
    const used = process.cpuUsage(cpu);
    const hv = hostView(room);
    assert.equal(hv.field!.length, 30, "rockets: every player on the projector");
    assert.ok(hv.field!.every((r, i, a) => i === 0 || a[i - 1].points >= r.points), "best first");
    const hostJson = JSON.stringify(hv).length;
    assert.ok(hostJson < 9000, `host update stays small (${hostJson} B)`);
    // one question bank: the pooled questions (every grade) include somewhat longer passages; a push carries one passage
    assert.ok(Math.max(...sent) < 10_000, `every push is small (${Math.max(...sent)} B)`);
    assert.ok((used.user + used.system) / 1000 < 2000, `300 answers in ${(used.user + used.system) / 1000} ms CPU`);
    hostAct(room, "end"); hostAct(base, "end");
    // the projector hook: a game's own ProjectorView, else the kit view by feature, else the default board
    const host = read("src/components/game/live-host.tsx");
    assert.match(host, /m\.ProjectorView/); assert.match(host, /kitProjectorFor\(v\.features/);
    assert.match(host, /<Projector state=\{pstate\} feed=\{feed\} t=\{t\} \/>/, "both the state and the flat feed (racers with team A / B)");
    assert.match(read("src/games/loaders.ts"), /ProjectorView\?: FC<ProjectorViewProps>; LiveChest\?: FC<LiveChestProps>/);
    assert.match(read("src/games/kit/projector.tsx"), /export function RocketsView[\s\S]*export function TugView/);
    assert.match(read("src/components/game/live-player.tsx"), /m\.LiveChest/);
  });

  // ------------------------------------------------------------------ games report
  test("games report: most played, best rated, by class (teachers: own classes; admin: the whole school)", async () => {
    await rateGame(repo, studs[1], "quiz-race", 5);
    await rateGame(repo, studs[2], "quiz-race", 4);
    const r = await gamesUsage(repo, teacher);
    assert.equal(r.rows[0].gameId, "quiz-race");
    assert.ok(r.rows[0].live >= 1 && r.rows[0].solo >= 1, "solo plays and Live Challenges both count");
    assert.equal(r.rows[0].avgStars, 4.5);
    const mine = r.byClass.find((c) => c.classId === classId)!;
    assert.ok(mine.plays >= 1 && mine.players >= 1 && mine.topGame === "quiz-race" && mine.avgStars === 4.5);
    assert.ok(!r.byClass.some((c) => c.classId === otherClassId), "a teacher sees own classes only");
    const one = await gamesUsage(repo, teacher, 30, new Date(), { classId });
    assert.equal(one.classId, classId);
    await assert.rejects(gamesUsage(repo, teacher, 30, new Date(), { classId: otherClassId }), ForbiddenError);
    const admin = await resolveActor(repo, (await repo.findMany("User", { schoolId: teacher.schoolId!, role: "SCHOOL_ADMIN" }))[0]);
    const a = await gamesUsage(repo, admin);
    assert.equal(a.scope, "SCHOOL");
    assert.ok(a.byClass.some((c) => c.classId === otherClassId), "the admin sees every class");
    assert.match(read("src/components/teacher/report-catalog.ts"), /\/teacher\/reports\/games-usage/, "in the Reports hub (its catalogue)");
    // the Admin Home tiles come from the one admin tool list; admins open the Games Report from the Reports hub tile
    assert.match(read("src/app/admin/page.tsx"), /ADMIN_TOOLS/, "the admin page shows the admin tool list");
    assert.match(read("src/components/admin-tools.ts"), /href: "\/teacher\/reports"[^\n]*home: true/, "and the Reports hub is a tile on the admin page");
    assert.match(read("src/app/teacher/reports/games-usage/page.tsx"), /By class[\s\S]*games-by-class/);
  });

  // ------------------------------------------------------------------ acceptance checks
  test("access: a teacher cannot start for another's class; a student of another class cannot join (code or typed URL)", async () => {
    await assert.rejects(startChallenge(repo, teacher, { classId: otherClassId, skillIds: [skillId] }), ForbiddenError);
    await assert.rejects(startChallenge(repo, otherTeacher, { classId, skillIds: [skillId] }), ForbiddenError);
    const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId], count: 3 });
    await assert.rejects(joinChallenge(repo, outsider, g.code), ForbiddenError);
    await assert.rejects(joinChallenge(repo, outsider, ` ${g.code.slice(0, 3)}-${g.code.slice(3)} `), ForbiddenError, "the typed URL /play/<code> goes through the same check");
    assert.match(read("src/app/play/[code]/page.tsx"), /joinChallenge\(repo, actor, code\)/);
    assert.throws(() => playerRoom(outsider, g.code), ForbiddenError, "the live API refuses students who did not join");
    assert.throws(() => hostRoom(otherTeacher, g.id), ForbiddenError);
    hostAct(roomById(g.id)!, "end");
  });

  test("rejoin keeps the player, points and emblem; rooms close after 60 minutes, not before", async () => {
    const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId], count: 3 });
    const room = roomById(g.id)!;
    await joinChallenge(repo, studs[0], g.code);
    hostAct(room, "start");
    answer(room, studs[0].studentId!, 0, key(room, 0));
    const pts = room.players.get(studs[0].studentId!)!.points;
    assert.equal(await joinChallenge(repo, studs[0], g.code), room);
    assert.equal(room.players.size, 1);
    const pv = playerView(room, studs[0].studentId!);
    assert.deepEqual([pv.points, pv.me.badge], [pts, "quiz-whiz"]);
    sweepRooms(room.createdAt + ROOM_TTL_MS - 1000);
    assert.ok(roomById(g.id), "still open at 59 minutes");
    assert.ok(sweepRooms(room.createdAt + ROOM_TTL_MS + 1) >= 1);
    assert.equal(roomById(g.id), null, "closed after 60 minutes");
  });

  test("levels never change: a Below student stays Below after solo play, Live Challenge and rewards", async () => {
    const kid = studs[2];
    await setStudentLevels(repo, teacher, classId, [{ studentId: kid.studentId!, level: "BELOW" }]);
    const before0 = await engineCounts();
    const lvl = async () => JSON.stringify(await repo.findMany("StudentLevel", { studentId: kid.studentId! }));
    const l0 = await lvl();
    const r = await soloRound(repo, kid, "quiz-race", skillId);
    await recordSoloPlay(repo, kid, { roundId: r.roundId, correct: r.questions.length, incorrect: 0, points: 9999 });
    assert.equal((await soloRound(repo, kid, "quiz-race", skillId)).level, "BELOW");
    assert.equal(await lvl(), l0);
    assert.deepEqual(await engineCounts(), before0);
    for (const f of ["src/server/game/rooms.ts", "src/server/game/live-challenge.ts", "src/server/game/results.ts", "src/games/live-features.ts"]) {
      assert.doesNotMatch(read(f), /recordEngineAttempt|updateMastery|recordLevel|startPractice|submitAnswer|setStudentLevels/, `${f} never calls the adaptive engine`);
    }
  });

  test("student home: no new tiles — only Join Live and the Question of the Day card were added", () => {
    const page = read("src/app/student/page.tsx");
    assert.equal((page.match(/<BigTile /g) ?? []).length, 9);   // 3 reading · MAP, Curriculum, RTI, NAFS · My Tests, My Reports (My Plans → MAP)
    assert.match(page, /<JoinLive/); assert.match(page, /<QotdCard/);
    assert.doesNotMatch(page, /RocketsView|TugView|ChestPicker|games-usage|LiveHost/);
  });

  test("interface text in English and Arabic (games integration section after games part 1)", () => {
    const en = read("src/i18n/en.ts"), arSrc = read("src/i18n/ar.ts");
    assert.ok(en.indexOf("// ---- games integration") > en.indexOf("// ---- games (part 1)") && en.indexOf("// ---- games integration") < en.indexOf("// ---- wave-1 pages"));
    assert.ok(arSrc.indexOf("// ---- games integration") > arSrc.indexOf("// ---- games (part 1)"));
    for (const s of ["Pick a chest", "+{n} coins for playing", "{name} took {n} points from {other}!", "Race to the Moon", "By class"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(s), s);
      assert.ok(/[؀-ۿ]/.test(ar[s as keyof typeof ar]), s);
    }
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length);
    // team names are shared with solo Team Tug (translated in the Team Tug game's own strings)
    assert.deepEqual(TEAMS.map((x) => [x.letter, x.name]), [["A", "Red Team"], ["B", "Blue Team"]], "same ids and names as solo Team Tug");
  });
});
