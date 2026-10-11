/**
 * 🎲 Games Part 2b: Word Pop (sorting), Lane Runner (action), Mystery Chest (luck) — solo and Live Challenge.
 * Rules (pure), bank-filled rounds at the student's level with each game's own fit, "Soon", Live Challenge scoring
 * of each game's device answers, chest luck on game points only, and the build rules (lazy, rAF that stops when
 * the tab is hidden, no heavy libraries, interface strings in English + Arabic). Games never change levels.
 */
import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { gameMeta, liveModes, readyGames } from "../src/games/registry";
import type { GameId, PlayQuestion } from "../src/games/types";
import { gameAvailability, pickQuestions, soloRound } from "../src/server/game/questions";
import { recordSoloResult } from "../src/server/game/results";
import { challengeSkills, joinChallenge, startChallenge } from "../src/server/game/live-challenge";
import { answer, hostAct, playerView, resetRooms, roomById } from "../src/server/game/rooms";
import { bubbleAt, fitsWordPop, layout, MAX_CHARS, popOutcome, popTargets, RISE_SPEED } from "../src/games/word-pop/rules";
import { APPROACH_SECONDS, dashSpeed, fitsLaneRunner, gateProgress, moveLane, nearestOpen, startLane } from "../src/games/lane-runner/rules";
import { applyChest, CHEST_PRIZES, chestResponse, dealChests, LIVE_CHEST, LIVE_CHESTS_ENABLED, openChest, readChestResponse, rivalTurn, SOLO_CHEST } from "../src/games/mystery-chest/chest";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const G2B: GameId[] = ["word-pop", "lane-runner", "mystery-chest"];

const opt = (label: string, text: string, correct = false) => ({ label, text, correct });
const Q = (over: Partial<PlayQuestion>): PlayQuestion => ({ id: "q", skillId: "k", type: "MULTIPLE_CHOICE", stem: "?", level: 4, passage: null, hint: null, explain: null, ...over });
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

describe("🎲 Games Part 2b — rules", () => {
  test("registry: Word Pop, Lane Runner and Mystery Chest are ready in Play and in Live Challenge", () => {
    for (const id of G2B) {
      const m = gameMeta(id)!;
      assert.ok(m.ready && m.live, id);
      assert.ok(readyGames().some((g) => g.id === id) && liveModes().some((g) => g.id === id), id);
      assert.ok(m.roundSeconds >= 120 && m.roundSeconds <= 180, `${id}: 2–3 minute rounds`);
      assert.ok(m.minQuestions >= 3 && m.roundSize >= m.minQuestions);
    }
    assert.deepEqual(gameMeta("word-pop")!.types, ["MULTI_SELECT", "TRUE_FALSE", "MULTIPLE_CHOICE"]);
    assert.equal(gameMeta("word-pop")!.fits, fitsWordPop);
    assert.deepEqual(gameMeta("lane-runner")!.types, ["MULTIPLE_CHOICE", "TRUE_FALSE"]);
    assert.equal(gameMeta("lane-runner")!.fits, fitsLaneRunner);
    assert.deepEqual(gameMeta("mystery-chest")!.types, ["MULTIPLE_CHOICE", "TRUE_FALSE"]);
  });

  test("Word Pop: which items fit a bubble, and popping only the right words", () => {
    const tf = Q({ type: "TRUE_FALSE", answer: false, options: [opt("true", "True"), opt("false", "False", true)] });
    const sort = Q({ type: "MULTI_SELECT", stem: "Which words are verbs?", options: [opt("A", "run", true), opt("B", "blue"), opt("C", "jump", true), opt("D", "table"), opt("E", "swim", true)] });
    const mc = Q({ options: [opt("A", "quickly", true), opt("B", "quick"), opt("C", "quicker")] });
    assert.ok(fitsWordPop(tf) && fitsWordPop(sort) && fitsWordPop(mc));
    assert.ok(!fitsWordPop(Q({ options: [opt("A", "The boy ran to the store after school", true), opt("B", "no")] })), "long sentences do not fit a bubble");
    assert.ok(!fitsWordPop(Q({ options: [opt("A", "x".repeat(MAX_CHARS + 1), true), opt("B", "y")] })));
    assert.ok(!fitsWordPop(Q({ type: "MULTI_SELECT", options: [opt("A", "a", true), opt("B", "b", true)] })), "a sorting item needs a wrong word too");
    assert.ok(!fitsWordPop(Q({ options: Array.from({ length: 7 }, (_, i) => opt(String(i), `w${i}`, i === 0)) })), "at most 6 bubbles");
    assert.deepEqual(popTargets(sort), ["A", "C", "E"]);
    assert.equal(popOutcome(sort, [], "A"), "more");
    assert.equal(popOutcome(sort, ["A"], "A"), "none", "a popped bubble is gone");
    assert.equal(popOutcome(sort, ["A", "C"], "E"), "right", "the last right word ends the question as correct");
    assert.equal(popOutcome(sort, ["A"], "B"), "wrong", "popping a wrong word ends it as not correct (the bank's rule)");
    assert.equal(popOutcome(mc, [], "A"), "right");
    assert.equal(popOutcome(tf, [], "true"), "wrong");
    assert.equal(popOutcome(tf, [], "false"), "right");
  });

  test("Word Pop: bubbles never overlap, stay ≥ 44 px, and loop from the bottom", () => {
    for (const arena of [{ width: 358, height: 352 }, { width: 700, height: 416 }, { width: 300, height: 300 }]) {
      for (let n = 2; n <= 6; n++) {
        const { size } = layout(n, arena);
        assert.ok(size >= 76, "big touch targets");
        for (let t = 0; t < 30; t += 0.37) {
          const ps = Array.from({ length: n }, (_, i) => bubbleAt(i, n, arena, t, RISE_SPEED.ABOVE));
          for (const p of ps) { assert.ok(p.x >= -1 && p.x + p.size <= arena.width + 1, `inside the arena (n=${n} w=${arena.width})`); assert.ok(p.y > -p.size - 1 && p.y <= arena.height + 1); }
          for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
            const dx = ps[a].x - ps[b].x, dy = ps[a].y - ps[b].y;
            assert.ok(Math.abs(dx) >= size - 1 || Math.abs(dy) >= size - 1, `bubbles ${a} and ${b} overlap at t=${t.toFixed(2)} (n=${n}, w=${arena.width})`);
          }
        }
      }
    }
    assert.ok(RISE_SPEED.BELOW < RISE_SPEED.ON && RISE_SPEED.ON < RISE_SPEED.ABOVE, "slower bubbles for Below Level");
  });

  test("Lane Runner: 2–4 short choices, lane switching around closed lanes, dash bonus", () => {
    assert.ok(fitsLaneRunner(Q({ options: [opt("A", "cat", true), opt("B", "dog"), opt("C", "cow"), opt("D", "pig")] })));
    assert.ok(fitsLaneRunner(Q({ type: "TRUE_FALSE", answer: true, options: [opt("true", "True", true), opt("false", "False")] })));
    assert.ok(!fitsLaneRunner(Q({ options: Array.from({ length: 5 }, (_, i) => opt(String(i), `w${i}`, i === 0)) })), "at most 4 lanes");
    assert.ok(!fitsLaneRunner(Q({ options: [opt("A", "x".repeat(60), true), opt("B", "y")] })), "a gate sign holds a short choice");
    assert.deepEqual([startLane(2), startLane(3), startLane(4)], [0, 1, 1]);
    assert.equal(moveLane(1, 1, 4), 2);
    assert.equal(moveLane(3, 1, 4), 3, "stays at the edge");
    assert.equal(moveLane(0, 1, 4, [1, 2]), 3, "jumps over lanes closed by 50/50");
    assert.equal(moveLane(3, -1, 4, [0, 1, 2]), 3);
    assert.equal(nearestOpen(1, 4, [1, 2]), 0);
    assert.equal(nearestOpen(2, 4, [1, 2]), 3);
    assert.equal(gateProgress(5.5, 11), 0.5);
    assert.equal(gateProgress(99, 11), 1);
    assert.equal(dashSpeed(0.25), 0.75, "dashing early answers faster");
    assert.ok(APPROACH_SECONDS.BELOW > APPROACH_SECONDS.ON && APPROACH_SECONDS.ON > APPROACH_SECONDS.ABOVE, "more time to switch for Below Level");
  });

  test("Mystery Chest: one of each prize, luck changes game points only, never below 0", () => {
    for (const r of [seq(0), seq(0.99), seq(0.5, 0.1)]) assert.deepEqual([...dealChests(r)].sort(), [...CHEST_PRIZES].sort());
    assert.deepEqual(openChest("bonus", 140, [], SOLO_CHEST), { prize: "bonus", gain: SOLO_CHEST.bonus, taken: 0, from: null, fellBack: false });
    assert.equal(openChest("double", 140, [], SOLO_CHEST).gain, 140, "double points = the answer's points again");
    assert.deepEqual(openChest("steal", 140, [{ id: "rival", points: 25 }], SOLO_CHEST), { prize: "steal", gain: 25, taken: 25, from: "rival", fellBack: false }, "only what the rival has");
    assert.deepEqual(openChest("steal", 140, [{ id: "rival", points: 0 }], SOLO_CHEST), { prize: "bonus", gain: SOLO_CHEST.bonus, taken: 0, from: null, fellBack: true }, "nobody to take from → a bonus");
    // Live: from the leader in the room, never below 0, nobody else touched
    const room = new Map([["me", { points: 900 }], ["a", { points: 1200 }], ["b", { points: 100 }], ["c", { points: 0 }]]);
    const r = applyChest(room, "me", "steal", 800);
    assert.deepEqual([r.from, r.taken, room.get("me")!.points, room.get("a")!.points, room.get("b")!.points], ["a", LIVE_CHEST.steal, 900 + LIVE_CHEST.steal, 1200 - LIVE_CHEST.steal, 100]);
    const poor = new Map([["me", { points: 0 }], ["x", { points: 120 }]]);
    applyChest(poor, "me", "steal", 0);
    assert.deepEqual([poor.get("x")!.points, poor.get("me")!.points], [0, 120], "takes at most what the player has: never below 0");
    applyChest(room, "me", "double", 800);
    assert.equal(room.get("me")!.points, 900 + LIVE_CHEST.steal + 800);
    // the device's chest pick, and plain labels still work
    assert.deepEqual(readChestResponse(chestResponse("B", 7)), { choice: "B", chest: 2 });
    assert.deepEqual(readChestResponse("B"), { choice: "B", chest: null });
    // the computer rival: 0 or 90–200 a question, depending on the level
    for (const v of [0, 0.3, 0.6, 0.9]) { const p = rivalTurn("ON", seq(v)); assert.ok(p === 0 || (p >= 90 && p <= 150 + SOLO_CHEST.bonus)); }
    assert.equal(rivalTurn("BELOW", seq(0.6)), 0, "a Below Level rival misses more");
    assert.ok(rivalTurn("ABOVE", seq(0.6)) > 0);
    // the chest is opened AFTER the answer was marked: the game calls round.answer first, then a chest can open
    const src = read("src/games/mystery-chest/game.tsx");
    assert.ok(src.indexOf("round.answer(q, ok") < src.indexOf('setPhase("pick")'), "right/not right is decided before any chest");
    assert.doesNotMatch(src.slice(src.indexOf("const open = ")), /round\.answer\(/, "opening a chest never records an answer");
  });
});

describe("🎲 Games Part 2b — bank, Play and Live Challenge", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let studs: Actor[] = [];
  const skills: Partial<Record<GameId, string>> = {};
  const studentActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
  const engineCounts = async () => ({
    attempts: await repo.count("QuestionAttempt"), mastery: await repo.count("StudentSkillMastery"), evidence: await repo.count("SkillEvidence"),
    levels: await repo.count("StudentLevel"), levelStates: await repo.count("StudentLevelState"), sessions: await repo.count("PracticeSession"),
  });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    studs = await Promise.all(r[0].students.slice(0, 4).map((x) => studentActor(x.id)));
    for (const id of G2B) {
      const list = (await challengeSkills(repo, teacher, { grade: r[0].grade, mode: id })).sort((a, b) => b.fitting - a.fitting);
      for (const k of list.slice(0, 40)) {
        if ((await gameAvailability(repo, teacher.schoolId!, k.id)).find((g) => g.id === id)!.status === "PLAY") { skills[id] = k.id; break; }
      }
    }
  });
  after(() => resetRooms());

  test("each game is filled from the skill's bank questions, only items that fit it; Soon without enough", async () => {
    for (const id of G2B) {
      const meta = gameMeta(id)!;
      const skillId = skills[id];
      assert.ok(skillId, `the test bank has a skill for ${id}`);
      const qs = await pickQuestions(repo, teacher.schoolId!, skillId!, meta, "ON", meta.roundSize);
      assert.ok(qs.length >= meta.minQuestions, id);
      assert.ok(qs.every((q) => meta.types.includes(q.type) && (!meta.fits || meta.fits(q)) && q.skillId === skillId), `${id}: fitting items of the skill only`);
      const av = await gameAvailability(repo, teacher.schoolId!, skillId!);
      assert.equal(av.find((g) => g.id === id)!.status, "PLAY");
    }
    // a skill whose items do not fit in bubbles (or that has too few) shows "Soon" for Word Pop
    const all = await challengeSkills(repo, teacher, {});
    let soon = 0;
    for (const k of all.slice(0, 60)) { const a = (await gameAvailability(repo, teacher.schoolId!, k.id)).find((g) => g.id === "word-pop")!; if (a.status === "SOON") { soon++; assert.ok(a.fitting < gameMeta("word-pop")!.minQuestions); } }
    assert.ok(soon > 0, "skills without enough fitting items show Soon");
  });

  test("solo rounds at the student's level; result rows keep correct / incorrect only; levels never change", async () => {
    const before0 = await engineCounts();
    const kid = studs[0];
    for (const id of G2B) {
      const round = await soloRound(repo, kid, id, skills[id]!);
      assert.equal(round.gameId, id);
      assert.ok(round.roundSeconds >= 120 && round.roundSeconds <= 180);
      assert.ok(round.questions.every((q) => gameMeta(id)!.fits?.(q) ?? true));
      const rowId = await recordSoloResult(repo, kid, { roundId: round.roundId, correct: 3, incorrect: 2, points: 777 });
      const row = (await repo.findUnique("GamePlay", { id: rowId }))!;
      assert.deepEqual([row.gameId, row.mode, Number(row.correct), Number(row.incorrect)], [id, "SOLO", 3, 2]);
    }
    assert.deepEqual(await engineCounts(), before0, "games never touch attempts, mastery, evidence or levels");
  });

  test("Live Challenge: each mode runs; devices' answers (bubble, lane, chest tiles) are scored by the bank", async () => {
    const before0 = await engineCounts();
    for (const id of G2B) {
      const g = await startChallenge(repo, teacher, { classId, skillIds: [skills[id]!], mode: id, count: 5, seconds: 20, levelMode: "SAME" });
      const room = roomById(g.id)!;
      assert.equal(room.mode, id);
      for (const k of studs) await joinChallenge(repo, k, g.code);
      const t0 = Date.now();
      hostAct(room, "start", t0);
      for (let ix = 0; ix < room.slots.length; ix++) {
        if (ix) hostAct(room, "next", t0 + ix * 30_000);
        const ri = room.slots[ix].byLevel.ON;
        const view = playerView(room, studs[0].studentId!, t0 + ix * 30_000).question!;
        assert.ok(view.options && !("correct" in view.options[0]), "no answer key on the device");
        if (id === "lane-runner") assert.ok(view.options!.length >= 2 && view.options!.length <= 4, "one lane per choice");
        // what each game's pad sends: a sorting item sends the popped words, the others one label
        const right = ri.item.type === "MULTI_SELECT" ? ri.item.options!.filter((o) => o.correct).map((o) => o.label) : ri.item.type === "TRUE_FALSE" ? String(ri.item.answer) : ri.right!;
        const wrong = ri.item.type === "MULTI_SELECT" ? [ri.item.options!.find((o) => !o.correct)!.label] : ri.item.type === "TRUE_FALSE" ? String(!ri.item.answer) : ri.view.options!.find((o) => o.label !== ri.right)!.label;
        const at = t0 + ix * 30_000 + 1000;
        assert.equal(answer(room, studs[0].studentId!, ix, right, at).correct, true, `${id} q${ix} right`);
        assert.equal(answer(room, studs[1].studentId!, ix, wrong, at).correct, false, `${id} q${ix} wrong`);
      }
      hostAct(room, "end", t0 + 200_000);
      const me = room.players.get(studs[0].studentId!)!;
      assert.equal(me.correct, room.slots.length);
      assert.ok(room.players.get(studs[1].studentId!)!.points === 0 && me.points > 0);
    }
    for (let i = 0; i < 100; i++) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(await engineCounts(), before0, "Live Challenge games never touch attempts, mastery, evidence or levels");
  });
});

describe("🎲 Games Part 2b — build rules", () => {
  test("lazy-loaded, code-drawn, rAF that stops when the tab is hidden, no heavy libraries, no Math.random", () => {
    const loaders = read("src/games/loaders.ts");
    for (const id of G2B) {
      assert.match(loaders, new RegExp(`"${id}": \\(\\) => import\\("\\./${id}/game"\\)`));
      const src = read(`src/games/${id}/game.tsx`);
      assert.match(src, /^"use client";/);
      assert.match(src, /export default function \w+\(\{ questions, round/);
      assert.match(src, /export function LivePad\(/, `${id} brings its own Live device`);
      assert.doesNotMatch(src, /from "(phaser|pixi|three|howler|canvas-confetti|framer-motion|gsap|lottie)/);
      assert.doesNotMatch(src, /<img|\.png|\.jpg|\.gif|Math\.random\(/, "code-drawn art, crypto randomness");
      assert.doesNotMatch(src, /SoonPanel/, "the placeholder is gone");
      assert.doesNotMatch(src, /Kahoot|Blooket|Subway|Temple Run|Pok[eé]mon|Mario|Minecraft|Roblox|Gimkit/i, "original names only");
      assert.match(src, /round\.answer\(/);
      assert.match(src, /<PowerBar /, "power-ups from the kit");
      assert.doesNotMatch(src, /engine|mastery|recordEngineAttempt/i);
    }
    for (const id of ["word-pop", "lane-runner"]) {
      assert.match(read(`src/games/${id}/game.tsx`), /useFrame\(/, `${id} animates with requestAnimationFrame`);
      const frame = read(`src/games/${id}/frame.ts`);
      assert.match(frame, /requestAnimationFrame/); assert.match(frame, /visibilitychange/); assert.match(frame, /document\.hidden/);
    }
    // every meta stays tiny and server-safe (no React)
    for (const id of G2B) assert.doesNotMatch(read(`src/games/${id}/meta.ts`), /react|"use client"/i);
    for (const f of ["src/games/word-pop/rules.ts", "src/games/lane-runner/rules.ts", "src/games/mystery-chest/chest.ts"]) assert.doesNotMatch(read(f), /from "react"/);
    assert.equal(LIVE_CHESTS_ENABLED, true, "the room can open chests (games integration), so the Live device offers them");
    assert.match(read("src/server/game/rooms.ts"), /readChestPick/, "the room reads the chest picked with the answer");
  });

  test("interface text in English and Arabic (section after games part 1); game content stays English LTR", () => {
    const en = read("src/i18n/en.ts"), arSrc = read("src/i18n/ar.ts");
    assert.ok(en.indexOf("// ---- games g2b") > en.indexOf("// ---- games (part 1)"));
    assert.ok(arSrc.indexOf("// ---- games g2b") > arSrc.indexOf("// ---- games (part 1)"));
    const known = new Set<string>(UI_STRINGS);
    assert.equal(known.size, UI_STRINGS.length, "no duplicate interface strings");
    for (const id of G2B) {
      const src = read(`src/games/${id}/game.tsx`);
      for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
        assert.ok(known.has(m[1]), `${id}: “${m[1]}” is in en.ts`);
        assert.match(ar[m[1] as keyof typeof ar], /[؀-ۿ]/, `${id}: “${m[1]}” has Arabic`);
      }
      // question text, choices and hints are English, left to right
      assert.match(src, /dir="ltr" lang="en"[^>]*>\{q\.stem\}/);
    }
  });
});
