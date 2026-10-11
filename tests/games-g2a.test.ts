/**
 * 🎲 Games Part 2a: Match It (pairing), Word Builder (ordering), Word Guess (deduction) — which bank questions fit,
 * selection at the student's level, "Soon", the games' rules and power-up helpers, and the Live Challenge (devices
 * send what the bank's scoreResponse expects; the server scores it). Games never change levels or mastery.
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
import type { PlayQuestion } from "../src/games/types";
import { fiftyFifty, powerApplies } from "../src/games/kit/powerups";
import { gameAvailability, pickQuestions, soloRound } from "../src/server/game/questions";
import { challengeSkills, joinChallenge, startChallenge } from "../src/server/game/live-challenge";
import { answer, hostAct, playerView, resetRooms, roomById } from "../src/server/game/rooms";
import { scoreResponse } from "../src/imports/questions/validate";
import * as M from "../src/games/match-it/logic";
import * as B from "../src/games/word-builder/logic";
import * as G from "../src/games/word-guess/logic";
import { demoDatabase, seededRandom } from "./helpers/db";

const ROOT = join(__dirname, "..");
const base = { id: "q", skillId: "k", stem: "?", level: 4, passage: null, hint: null, explain: null } as const;

describe("🎲 Games Part 2a — Match It, Word Builder, Word Guess", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let studs: Actor[] = []; let skillId: string; let emptySkill: string;
  const studentActor = async (studentId: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
  const engineCounts = async () => ({
    attempts: await repo.count("QuestionAttempt"), mastery: await repo.count("StudentSkillMastery"), evidence: await repo.count("SkillEvidence"),
    levels: await repo.count("StudentLevel"), levelStates: await repo.count("StudentLevelState"), sessions: await repo.count("PracticeSession"),
  });
  let n = 0;
  /** a published bank question for the test skill (in-memory test database only) */
  const addQ = async (skill: string, code: string, stem: string, level: number, value: unknown, extra: { elements?: string[]; options?: { text: string; correct: boolean }[] } = {}) => {
    const type = (await repo.findMany("QuestionType", { code }))[0];
    const q = await repo.create("Question", { skillId: skill, typeId: type.id, stem, content: extra.elements ? { elements: extra.elements } : {}, difficultyLevel: level, irtB: 0, status: "PUBLISHED", externalRef: `g2a-${++n}` });
    if (value !== undefined) await repo.create("QuestionAnswer", { questionId: q.id, value });
    for (const [i, o] of (extra.options ?? []).entries()) await repo.create("QuestionOption", { questionId: q.id, label: "ABCD"[i], text: o.text, isCorrect: o.correct, order: i });
    return String(q.id);
  };

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    studs = await Promise.all(r[0].students.slice(0, 3).map((x) => studentActor(x.id)));
    const skills = await challengeSkills(repo, teacher, { grade: r[0].grade });
    // a skill of the class's grade gets fitting questions for the three games (levels 2, 4, 4, 6)
    skillId = skills[0].id;
    const lv = [2, 4, 4, 6];
    const matchSets = [
      [["re-", "again"], ["un-", "not"], ["pre-", "before"], ["mis-", "wrongly"]],
      [["huge", "very big"], ["tiny", "very small"], ["swift", "fast"]],
      [["aud", "hear"], ["vis", "see"], ["port", "carry"], ["struct", "build"]],
      [["glad", "happy"], ["weary", "tired"], ["furious", "very angry"], ["timid", "shy"], ["brave", "not afraid"]],
      // games need a full round of fitting questions (MIN_QUESTIONS_PER_GAME / the round)
      [["dis-", "opposite of"], ["re-", "again"], ["over-", "too much"]],
      [["ancient", "very old"], ["damp", "a little wet"], ["fragile", "easy to break"], ["gloomy", "dark and sad"]],
    ];
    for (const [i, set] of matchSets.entries()) await addQ(skillId, "MATCHING", `Match each word to its meaning (${i}).`, lv[i % 4], set.map(([left, right]) => ({ left, right })));
    const orders = [
      ["The", "cat", "sat", "on", "the", "mat."], ["My", "brother", "plays", "football", "after", "school."],
      ["We", "will", "visit", "the", "museum", "tomorrow."], ["Although", "it", "rained,", "the", "match", "continued."],
      ["She", "reads", "a", "book", "every", "night."], ["The", "birds", "flew", "over", "the", "lake."],
      ["Our", "class", "planted", "a", "small", "tree."], ["Because", "he", "was", "tired,", "he", "slept", "early."],
    ];
    for (const [i, seq] of orders.entries()) await addQ(skillId, "WORD_ORDER", `Put the words in order to make a sentence (${i}).`, lv[i % 4], seq, { elements: seq });
    const words = [["The opposite of hot is ____.", "cold"], ["A baby cat is called a ____.", "kitten"], ["Change to plural: one shelf, two ____.", "shelves"], ["Very, very big: ____.", "enormous"], ["The opposite of up is ____.", "down"], ["A young dog is called a ____.", "puppy"], ["The day after Monday is ____.", "tuesday"]];
    for (const [i, [stem, w]] of words.entries()) await addQ(skillId, "FILL_BLANK", stem, lv[i % 4], w);
    // questions that do NOT fit: a 2-pair board, a 2-piece order, several accepted answers, the word in the clue
    await addQ(skillId, "MATCHING", "Too small a board.", 4, [{ left: "a", right: "b" }, { left: "c", right: "d" }]);
    await addQ(skillId, "WORD_ORDER", "Too few pieces.", 4, ["Hello", "there."], { elements: ["Hello", "there."] });
    await addQ(skillId, "FILL_BLANK", "The crowd ____ when the team scored.", 4, "cheered");
    await repo.create("QuestionAnswer", { questionId: (await repo.findMany("Question", { externalRef: `g2a-${n}` }))[0].id, value: "clapped" });
    await addQ(skillId, "MULTIPLE_CHOICE", "Sam was glad, or happy. What does glad mean?", 4, undefined, { options: [{ text: "tired", correct: false }, { text: "happy", correct: true }, { text: "angry", correct: false }] });
    await addQ(skillId, "MULTIPLE_CHOICE", "Which word is a synonym for enormous?", 4, undefined, { options: [{ text: "huge", correct: true }, { text: "tiny", correct: false }, { text: "old", correct: false }, { text: "loud", correct: false }] });
    emptySkill = skills[skills.length - 1].id;
  });
  after(() => resetRooms());

  // ------------------------------------------------------------------ registry
  test("registry: Match It, Word Builder and Word Guess are ready (solo) and Live Challenge modes, lazy-loaded", () => {
    for (const id of ["match-it", "word-builder", "word-guess"]) {
      const g = gameMeta(id)!;
      assert.ok(g.ready && g.live, id);
      assert.ok(readyGames().some((x) => x.id === id) && liveModes().some((x) => x.id === id));
      assert.ok(typeof g.fits === "function", `${id} has its own fit check`);
      assert.ok(g.minQuestions >= 3 && g.roundSeconds >= 120 && g.roundSeconds <= 180);
      const src = readFileSync(join(ROOT, `src/games/${id}/game.tsx`), "utf8");
      assert.match(src, /export default function/); assert.match(src, /export function LivePad/);
      assert.match(src, /<PowerBar /, "power-ups from the kit");
      assert.doesNotMatch(src, /\bfrom "(?!react"|@\/i18n\/client"|\.\.\/|\.\/)/, "no other libraries");
      assert.doesNotMatch(src, /<img|\.png|\.jpg|\.gif/, "code-drawn graphics only");
      assert.doesNotMatch(src, /setLevel|recordEngineAttempt|mastery/i, "games never touch levels or mastery");
    }
    assert.deepEqual(gameMeta("match-it")!.types, ["MATCHING"]);
    assert.deepEqual(gameMeta("word-builder")!.types, ["WORD_ORDER", "SENTENCE_ORDER"]);
    assert.deepEqual(gameMeta("word-guess")!.types, ["FILL_BLANK", "MULTIPLE_CHOICE"]);
  });

  // ------------------------------------------------------------------ Match It rules
  test("Match It: fits 3–6 distinct pairs; a board is right only when every pair is right (as the bank scores it)", () => {
    const pairs = [{ left: "re-", right: "again" }, { left: "un-", right: "not" }, { left: "pre-", right: "before" }, { left: "mis-", right: "wrongly" }];
    const q: PlayQuestion = { ...base, type: "MATCHING", pairs };
    assert.equal(M.fitsMatch(q), true);
    assert.equal(M.fitsMatch({ ...q, pairs: pairs.slice(0, 2) }), false, "2 pairs is too small");
    assert.equal(M.fitsMatch({ ...q, pairs: [...pairs, ...pairs.map((p) => ({ left: p.left + "x", right: p.right + "y" }))] }), false, "8 pairs is too many");
    assert.equal(M.fitsMatch({ ...q, pairs: [...pairs.slice(0, 3), { left: "dis-", right: "Again " }] }), false, "two alike cards");
    assert.equal(M.fitsMatch({ ...q, type: "MULTIPLE_CHOICE" }), false);
    const rights = M.scrambleRights(pairs, seededRandom(3));
    assert.deepEqual([...rights].sort(), pairs.map((p) => p.right).sort());
    assert.notDeepEqual(rights, pairs.map((p) => p.right), "never in the answer order");
    // pairing: a right card belongs to one left card only
    let c = M.link({}, "re-", "not");
    c = M.link(c, "un-", "not");
    assert.deepEqual(c, { "un-": "not" });
    c = M.unlink(M.link(c, "re-", "again"), "re-");
    assert.deepEqual(c, { "un-": "not" });
    const all = Object.fromEntries(pairs.map((p) => [p.left, p.right]));
    assert.deepEqual(M.checkBoard(pairs, all), { correct: true, wrong: [] });
    const swapped = { ...all, "re-": "not", "un-": "again" };
    assert.deepEqual(M.checkBoard(pairs, swapped), { correct: false, wrong: ["re-", "un-"] });
    // the bank agrees (MATCHING scores a fraction; only a whole board counts as right in games)
    const item = { type: "MATCHING", pairs } as never;
    assert.equal(scoreResponse(item, M.matchResponse(pairs.map((p) => p.left), rights, all)), 1);
    assert.ok(scoreResponse(item, M.matchResponse(pairs.map((p) => p.left), rights, swapped)) < 1);
    assert.equal(M.matchResponse(["re-", "un-"], ["again", "not"], { "re-": "again" }), null, "every card must be paired before sending");
    // Hint (1 pair) / 50/50 (2 pairs) lock right pairs in, moving cards that were in the way
    const help = M.helpPairs(pairs, swapped, [], 2);
    assert.deepEqual(help, ["re-", "un-"]);
    assert.deepEqual(M.checkBoard(pairs, M.lockIn(pairs, swapped, help)).correct, true);
    assert.deepEqual(M.helpPairs(pairs, all, [], 1), [], "nothing to help with on a right board");
    assert.ok(M.boardSpeed(0) === 1 && M.boardSpeed(60_000) === 0);
  });

  // ------------------------------------------------------------------ Word Builder rules
  test("Word Builder: fits 3–8 pieces; the exact order is right; tiles move, lock and are sent as string[]", () => {
    const seq = ["The", "cat", "sat", "on", "the", "mat."];
    const q: PlayQuestion = { ...base, type: "WORD_ORDER", sequence: seq };
    assert.equal(B.fitsOrder(q), true);
    assert.equal(B.fitsOrder({ ...q, type: "SENTENCE_ORDER" }), true);
    assert.equal(B.fitsOrder({ ...q, sequence: ["Hi", "there."] }), false);
    assert.equal(B.fitsOrder({ ...q, sequence: [...seq, "a", "b", "c"] }), false, "9 pieces is too many");
    assert.equal(B.fitsOrder({ ...q, sequence: ["a", "", "b"] }), false);
    const tiles = B.scramble(seq, seededRandom(7));
    assert.notDeepEqual(tiles.map((x) => x.text), seq, "never in the answer order");
    assert.equal(B.checkOrder(seq, seq), true);
    assert.equal(B.checkOrder(seq, ["the", "cat", "sat", "on", "The", "mat."]), false);
    assert.equal(B.checkOrder(seq, seq.slice(0, 5)), false);
    assert.deepEqual(B.moveInLine([1, 2, 3, 4], 4, 0), [4, 1, 2, 3]);
    assert.deepEqual(B.moveInLine([1, 2, 3, 4], 1, 4), [2, 3, 4, 1]);
    assert.deepEqual(B.moveInLine([1, 2], 9, 1), [1, 9, 2], "a tile from the pile goes into the line");
    // Hint / 50/50: the first pieces in the right order, locked; the player's other pieces stay after them
    const wrongLine = tiles.map((x) => x.id);
    const h = B.lockNext(seq, tiles, wrongLine, 0, 2);
    assert.equal(h.locked, 2);
    assert.deepEqual(h.line.slice(0, 2).map((id) => tiles.find((x) => x.id === id)!.text), ["The", "cat"]);
    assert.equal(h.line.length, seq.length);
    const h2 = B.lockNext(seq, tiles, [], 2, 1);
    assert.deepEqual(h2.line.map((id) => tiles.find((x) => x.id === id)!.text), ["The", "cat", "sat"]);
    // live: the device sends the texts in the built order; equal words ("The"/"the" differ, duplicates are fine)
    const els = ["sat", "the", "The", "mat.", "cat", "on"];
    const t2 = els.map((text, id) => ({ id, text }));
    const right = seq.map((w) => t2.find((x) => x.text === w)!.id);
    const resp = B.orderResponse(els, t2, right)!;
    assert.deepEqual(resp, seq);
    assert.equal(scoreResponse({ type: "WORD_ORDER", sequence: seq } as never, resp), 1);
    assert.equal(scoreResponse({ type: "WORD_ORDER", sequence: seq } as never, B.orderResponse(els, t2, [...right].reverse())), 0);
    assert.equal(B.orderResponse(els, t2, right.slice(1)), null, "all pieces before sending");
    assert.equal(B.isSentencePieces(["The kite tears in the fig tree.", "b", "c"]), true);
    assert.equal(B.isSentencePieces(seq), false);
  });

  // ------------------------------------------------------------------ Word Guess rules
  test("Word Guess: one-word vocabulary targets, colour clues (repeated letters), 50/50 letters, solo and live scoring", () => {
    const fb = (answers: string[], stem = "A baby cat is a ____."): PlayQuestion => ({ ...base, type: "FILL_BLANK", stem, answers });
    assert.equal(G.targetOf(fb(["kitten"])), "KITTEN");
    assert.equal(G.targetOf(fb(["Kitten", "kitten "])), "KITTEN", "the same answer twice is one word");
    assert.equal(G.targetOf(fb(["cheered", "clapped"])), null, "several accepted answers: no single word to deduce");
    assert.equal(G.targetOf(fb(["at"])), null, "too short");
    assert.equal(G.targetOf(fb(["accommodate"])), null, "too long");
    assert.equal(G.targetOf(fb(["ice cream"])), null, "one word only");
    assert.equal(G.targetOf(fb(["hop"], "Say hop again: ____")), null, "the clue must not show the word");
    const mc = (opts: [string, boolean][], stem = "Which word is a synonym for enormous?"): PlayQuestion => ({ ...base, type: "MULTIPLE_CHOICE", stem, options: opts.map(([text, correct], i) => ({ label: "ABCD"[i], text, correct })) });
    assert.equal(G.targetOf(mc([["huge", true], ["tiny", false], ["old", false]])), "HUGE");
    assert.equal(G.targetOf(mc([["very big", true], ["tiny", false]])), null);
    assert.equal(G.targetOf(mc([["happy", true], ["sad", false]], "Sam was glad, or happy. What does glad mean?")), null);
    assert.equal(G.targetOf({ ...base, type: "TRUE_FALSE" }), null);
    // colours: right place, in the word elsewhere, not in the word — a repeated letter only as often as the word has it
    assert.deepEqual(G.scoreGuess("HUGE", "HUGE"), ["hit", "hit", "hit", "hit"]);
    assert.deepEqual(G.scoreGuess("EGUH", "HUGE"), ["near", "near", "near", "near"]);
    assert.deepEqual(G.scoreGuess("LLAMA", "HELLO"), ["near", "near", "miss", "miss", "miss"]);
    assert.deepEqual(G.scoreGuess("TITTER", "KITTEN"), ["miss", "hit", "hit", "hit", "hit", "miss"], "a third T is grey: KITTEN has two");
    assert.deepEqual(G.scoreGuess("TTTTTT", "KITTEN"), ["miss", "miss", "hit", "hit", "miss", "miss"]);
    const keys = G.keyStates(["EGUH", "HUGS"], "HUGE");
    assert.deepEqual([keys.H, keys.U, keys.G, keys.E, keys.S], ["hit", "hit", "hit", "near", "miss"], "the keyboard keeps the best colour");
    assert.equal(G.validGuess("cats", "HUGE"), true);
    assert.equal(G.validGuess("cat", "HUGE"), false);
    assert.equal(G.validGuess("ca7s", "HUGE"), false);
    assert.equal(G.guessSpeed(1), 1); assert.equal(G.guessSpeed(G.MAX_GUESSES), 0);
    const gone = G.removeLetters("HUGE", { S: "miss" }, seededRandom(1));
    assert.ok(gone.length >= 10 && !gone.some((c) => "HUGES".includes(c)), "50/50 greys out letters that are not in the word");
    assert.equal(G.revealCount("HUGE"), 1); assert.equal(G.revealCount("ENORMOUS"), 2);
    // live: ONE guess, scored by the bank (typed word for fill-in-the-blank, the card's label for multiple choice)
    const fbItem = { type: "FILL_BLANK", answers: ["kitten"] } as never;
    assert.equal(scoreResponse(fbItem, G.liveGuessResponse(undefined, " Kitten ")), 1);
    assert.equal(scoreResponse(fbItem, G.liveGuessResponse(undefined, "kittens")), 0);
    assert.equal(G.liveGuessResponse(undefined, "  "), null);
    const opts = [{ label: "A", text: "huge" }, { label: "B", text: "tiny" }];
    assert.equal(G.liveGuessResponse(opts, "HUGE"), "A");
    assert.equal(G.liveGuessResponse(opts, "big"), null, "only one of the word cards");
    assert.equal(scoreResponse({ type: "MULTIPLE_CHOICE", options: [{ label: "A", text: "huge", correct: true }, { label: "B", text: "tiny", correct: false }] } as never, "A"), 1);
  });

  test("power-ups: the stand-in options let 50/50 and Hint apply to boards, tiles and words; never the answer", () => {
    const q: PlayQuestion = { ...base, type: "MATCHING", pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }, { left: "c", right: "3" }] };
    assert.equal(powerApplies("fifty", q), false, "the kit alone cannot use 50/50 on a board");
    const stand = { ...q, options: q.pairs!.map((p, i) => ({ label: p.left, text: p.right, correct: i === 0 })) };
    assert.equal(powerApplies("fifty", stand), true);
    assert.equal(fiftyFifty(stand.options, seededRandom(2))!.length, 2);
    assert.equal(powerApplies("hint", q), true);
    for (const id of ["double", "time", "shield"] as const) assert.equal(powerApplies(id, q), true);
  });

  // ------------------------------------------------------------------ bank selection + Soon
  test("questions are filled from the bank at the student's level, only the ones that fit each game; hidden otherwise", async () => {
    const qCount = await repo.count("Question");
    const av = await gameAvailability(repo, teacher.schoolId!, skillId);
    for (const id of ["match-it", "word-builder", "word-guess"]) assert.equal(av.find((g) => g.id === id)!.status, "PLAY", id);
    const levels = new Map((await repo.findMany("Question", { skillId }, { select: ["id", "difficultyLevel"] })).map((r) => [String(r.id), Number(r.difficultyLevel)]));
    for (const [id, check] of [["match-it", M.fitsMatch], ["word-builder", B.fitsOrder], ["word-guess", G.fitsGuess]] as const) {
      const meta = gameMeta(id)!;
      const all = await pickQuestions(repo, teacher.schoolId!, skillId, meta, "ON", 50);
      assert.ok(all.length >= meta.minQuestions, id);
      assert.ok(all.every((q) => meta.types.includes(q.type) && (check as (q: PlayQuestion) => boolean)(q)), `${id}: only fitting questions`);
      assert.ok(all.every((q) => q.skillId === skillId || levels.has(q.id)), "the skill's own questions");
      // the student's level first: On Level questions come before the others
      const ls = all.map((q) => levels.get(q.id)!);
      const firstOther = ls.findIndex((l) => l !== 4);
      assert.ok(firstOther === -1 || ls.slice(firstOther).every((l) => l !== 4), `${id}: On Level first (${ls.join(",")})`);
      const below = await pickQuestions(repo, teacher.schoolId!, skillId, meta, "BELOW", 1);
      assert.ok(levels.get(below[0].id)! <= 3, `${id}: a Below Level student starts with a Below question`);
    }
    // the ones that do not fit are never served
    const wg = await pickQuestions(repo, teacher.schoolId!, skillId, gameMeta("word-guess")!, "ON", 50);
    assert.ok(wg.some((q) => q.type === "MULTIPLE_CHOICE" && G.targetOf(q) === "HUGE"), "a one-word multiple-choice answer fits");
    assert.ok(!wg.some((q) => /glad|crowd/.test(q.stem)), "several answers / the word in the clue: not served");
    assert.ok(!(await pickQuestions(repo, teacher.schoolId!, skillId, gameMeta("match-it")!, "ON", 50)).some((q) => q.pairs!.length < 3));
    // hidden: a skill without enough fitting questions
    for (const g of await gameAvailability(repo, teacher.schoolId!, emptySkill)) {
      if (["match-it", "word-builder", "word-guess"].includes(g.id)) assert.equal(g.status, g.fitting >= gameMeta(g.id)!.minQuestions ? "PLAY" : "SOON", g.id);
    }
    assert.equal(await repo.count("Question"), qCount, "nothing is copied or stored");
  });

  test("solo rounds: a student plays each game on the skill at their level; games never change levels or mastery", async () => {
    const before0 = await engineCounts();
    await setStudentLevels(repo, teacher, classId, [{ studentId: studs[0].studentId!, level: "ABOVE" }]);
    for (const id of ["match-it", "word-builder", "word-guess"]) {
      const r = await soloRound(repo, studs[0], id, skillId);
      const meta = gameMeta(id)!;
      assert.equal(r.level, "ABOVE");
      assert.ok(r.questions.length >= meta.minQuestions && r.questions.length <= meta.roundSize, id);
      assert.ok(r.questions.every((q) => meta.fits!(q)));
      const d = await repo.findUnique("Question", { id: r.questions[0].id });
      assert.ok(Number(d!.difficultyLevel) >= 5, `${id}: an Above Level student starts with an Above question`);
      assert.equal(r.roundSeconds, meta.roundSeconds);
    }
    for (const g of await gameAvailability(repo, teacher.schoolId!, emptySkill)) {
      if (["match-it", "word-builder", "word-guess"].includes(g.id) && g.status === "SOON") await assert.rejects(soloRound(repo, studs[0], g.id, emptySkill), /coming soon/, `${g.id}: Soon for this skill`);
    }
    const after0 = await engineCounts();
    assert.deepEqual({ ...after0, levels: 0, levelStates: 0 }, { ...before0, levels: 0, levelStates: 0 }, "no attempts, mastery, evidence or sessions from games");
  });

  // ------------------------------------------------------------------ Live Challenge
  test("Live Challenge: Match It, Word Builder and Word Guess — devices get no key; the server scores pad responses", async () => {
    const before0 = await engineCounts();
    for (const mode of ["match-it", "word-builder", "word-guess"] as const) {
      const g = await startChallenge(repo, teacher, { classId, skillIds: [skillId], mode, count: 3, seconds: 30, levelMode: "SAME" });
      const room = roomById(g.id)!;
      for (const k of studs) await joinChallenge(repo, k, g.code);
      const t0 = Date.now();
      hostAct(room, "start", t0);
      const total = room.slots.length;
      assert.ok(total >= 3, `${mode}: enough questions for a room`);
      for (let ix = 0; ix < total; ix++) {
        const t1 = t0 + ix * 10_000;
        const ri = room.slots[ix].byLevel.ON;
        const pv = playerView(room, studs[0].studentId!, t1).question!;
        const json = JSON.stringify(pv);
        let right: unknown, wrong: unknown;
        if (mode === "match-it") {
          assert.ok(pv.left && pv.right && !pv.options, "a board: left cards and shuffled right cards");
          const key = Object.fromEntries(ri.item.pairs!.map((p) => [p.left, p.right]));
          assert.ok(!json.includes(JSON.stringify(ri.item.pairs)), "no answer key on the device");
          right = M.matchResponse(pv.left!, pv.right!, key);
          const l = pv.left!; wrong = M.matchResponse(l, pv.right!, { ...key, [l[0]]: key[l[1]], [l[1]]: key[l[0]] });
        } else if (mode === "word-builder") {
          assert.ok(pv.elements && pv.elements.length === ri.item.sequence!.length && !("sequence" in pv));
          const tiles = pv.elements!.map((text, id) => ({ id, text }));
          const used = new Set<number>();
          const line = ri.item.sequence!.map((w) => { const id = tiles.find((x) => x.text === w && !used.has(x.id))!.id; used.add(id); return id; });
          right = B.orderResponse(pv.elements!, tiles, line);
          wrong = B.orderResponse(pv.elements!, tiles, [...line.slice(1), line[0]]);
        } else {
          assert.ok(!("answers" in pv), "no accepted answers on the device");
          const target = G.targetOf({ type: ri.item.type as never, stem: ri.item.stem, answers: ri.item.answers, options: ri.item.options?.map((o) => ({ ...o, correct: !!o.correct })) })!;
          assert.ok(target, "a Word Guess room only has one-word targets");
          right = G.liveGuessResponse(pv.options, target);
          wrong = pv.options ? pv.options.find((o) => o.label !== right)!.label : "zzzz";
        }
        const a = answer(room, studs[0].studentId!, ix, right, t1 + 1000);
        const b = answer(room, studs[1].studentId!, ix, wrong, t1 + 1500);
        assert.equal(a.correct, true, `${mode} Q${ix + 1}: the right response is correct`);
        assert.ok(a.points >= 500);
        assert.equal(b.correct, false, `${mode} Q${ix + 1}: a wrong response is not`);
        assert.equal(b.points, 0);
        hostAct(room, "reveal", t1 + 2000);
        hostAct(room, "next", t1 + 3000);
      }
      assert.equal(room.status, "FINISHED");
      const p0 = room.players.get(studs[0].studentId!)!, p1 = room.players.get(studs[1].studentId!)!;
      assert.deepEqual([p0.correct, p0.incorrect, p1.correct, p1.incorrect], [total, 0, 0, total]);
      for (let i = 0; i < 50 && !room.savedId; i++) await new Promise((r) => setTimeout(r, 20));
      assert.equal((await repo.findUnique("LiveGame", { id: g.id }))!.mode, mode, "saved in Reports with its game mode");
    }
    assert.deepEqual(await engineCounts(), before0, "Live Challenge games never change levels or mastery");
  });
});
