/**
 * 🎲 Games with too few fitting questions are hidden (never "coming later"): the registry's minimum (a full round),
 * the whole-bank check, the Play button only when a game qualifies, and Live Challenge modes for the chosen skills.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { challengeSkills } from "../src/server/game/live-challenge";
import { GAMES, MIN_QUESTIONS_PER_GAME, gameMeta, gamesWithEnough, minQuestionsFor, showPlayButton } from "../src/games/registry";
import { bankCounts, fittingByGame, liveModesFor, playButtons } from "../src/server/game/visibility";
import { modesToShow, playableIds } from "../src/components/game/game-list";
import { demoDatabase } from "./helpers/db";
import { isolatedShortSkill, topUpGameBank } from "./helpers/game-bank";

const ROOT = join(__dirname, "..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const all = (n: number) => Object.fromEntries(GAMES.map((g) => [g.id, n]));

describe("🎲 games: hidden without enough questions", () => {
  test("the registry's minimum is a full round: MIN_QUESTIONS_PER_GAME, or the whole round when it is shorter", () => {
    assert.equal(MIN_QUESTIONS_PER_GAME, 8);
    for (const g of GAMES) {
      assert.equal(g.minQuestions, Math.max(Math.min(MIN_QUESTIONS_PER_GAME, g.roundSize), g.minQuestions), g.id);
      assert.ok(g.minQuestions >= Math.min(MIN_QUESTIONS_PER_GAME, g.roundSize), g.id);
      assert.equal(minQuestionsFor(g), g.minQuestions, "idempotent");
    }
    assert.equal(gameMeta("quiz-race")!.minQuestions, 8);
    assert.equal(gameMeta("match-it")!.minQuestions, Math.min(8, gameMeta("match-it")!.roundSize));
  });

  test("a game is hidden below its minimum, shown at it; a game the whole bank cannot fill never shows", () => {
    const qr = gameMeta("quiz-race")!;
    assert.ok(!gamesWithEnough({ "quiz-race": qr.minQuestions - 1 }).some((g) => g.id === "quiz-race"), "one short: hidden");
    assert.ok(gamesWithEnough({ "quiz-race": qr.minQuestions }).some((g) => g.id === "quiz-race"), "enough: shown");
    assert.deepEqual(gamesWithEnough({}).map((g) => g.id), [], "no counts: nothing");
    assert.equal(gamesWithEnough(all(100)).length, GAMES.filter((g) => g.ready).length);
    // whole-bank check: the bank has no matching questions → Match It never appears, whatever the skill says
    const bank = { ...all(100), "match-it": 0 };
    assert.ok(!gamesWithEnough(all(100), { bank }).some((g) => g.id === "match-it"));
    assert.ok(!gamesWithEnough(all(100), { live: true, bank }).some((g) => g.id === "match-it"), "nor as a Live Challenge mode");
    // the Live Challenge list keeps only live modes with enough questions
    assert.ok(gamesWithEnough(all(100), { live: true }).every((g) => g.live));
  });

  test("the Play button is hidden when no game qualifies", () => {
    assert.equal(showPlayButton({}), false);
    assert.equal(showPlayButton(all(MIN_QUESTIONS_PER_GAME - 1 - 2)), false, "every game short");
    assert.equal(showPlayButton(all(MIN_QUESTIONS_PER_GAME)), true);
    assert.equal(showPlayButton(all(100), all(0)), false, "an empty bank: no Play anywhere");
    // the menu lists only playable games; the Live Challenge only allowed modes
    assert.deepEqual([...playableIds([{ id: "quiz-race", status: "PLAY" }, { id: "match-it", status: "NO" }])], ["quiz-race"]);
    assert.deepEqual(modesToShow(null), []);
    assert.deepEqual(modesToShow(["team-tug", "quiz-race"]).map((g) => g.id), ["quiz-race", "team-tug"], "menu order");
  });

  test('no "Soon" label or state is left in the games and the game components', () => {
    const src = [...files(join(ROOT, "src/games")), ...files(join(ROOT, "src/components/game")), ...files(join(ROOT, "src/app/student/play"))].filter((f) => /\.(ts|tsx)$/.test(f));
    assert.ok(src.length > 20);
    for (const f of src) assert.doesNotMatch(readFileSync(f, "utf8"), /\bsoon\b/i, f.slice(ROOT.length));
  });

  describe("server: cheap counts", () => {
    let repo: SqliteRepo; let teacher: Actor; let student: Actor; let full: string; let short: string; let other: string;
    before(async () => {
      ({ repo } = await demoDatabase());
      await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
      teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
      const r = await teacherRoster(repo, teacher);
      student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: r[0].students[0].id }))!.userId }))!);
      const skills = (await challengeSkills(repo, teacher, { grade: r[0].grade })).sort((a, b) => b.fitting - a.fitting);
      full = skills[0].id;
      short = await isolatedShortSkill(repo, skills[1].id, 6);
      await topUpGameBank(repo, full, ["MULTIPLE_CHOICE", "TRUE_FALSE"], 10);
      other = (await challengeSkills(repo, teacher, {})).find((k) => k.grade !== r[0].grade)!.id;
    });

    test("fitting counts per game: one grouped count shared by games of the same question types", async () => {
      const [a, b] = await fittingByGame(repo, teacher.schoolId!, [[full], [short]]);
      assert.ok(a["quiz-race"]! >= 10 && b["quiz-race"]! < 8, `${a["quiz-race"]} / ${b["quiz-race"]}`);
      for (const id of ["lane-runner", "castle-guard", "rocket-race", "team-tug", "mystery-chest"]) assert.equal(a[id], a["quiz-race"], id);
      const [both] = await fittingByGame(repo, teacher.schoolId!, [[full, short]]);
      assert.equal(both["quiz-race"], a["quiz-race"]! + b["quiz-race"]!, "chosen skills add up");
      assert.equal((await fittingByGame(repo, teacher.schoolId!, [["no-such-skill"]]))[0]["quiz-race"], 0);
      assert.ok((await bankCounts(repo, teacher.schoolId!))["quiz-race"]! >= a["quiz-race"]!);
    });

    test("My Work: Play shows only for the student's skills where a game qualifies", async () => {
      const p = await playButtons(repo, student, [full, short, other, "no-such-skill"]);
      assert.equal(p[full], true, "enough multiple-choice questions");
      assert.equal(p["no-such-skill"], false);
      assert.equal(p[other], false, "not the student's skill");
      // a short skill shows Play only if a game really fits (Word Guess checks each question)
      const [c] = await fittingByGame(repo, teacher.schoolId!, [[short]]);
      if (!gamesWithEnough(c).length) assert.equal(p[short], false, "no game qualifies: no Play button");
      assert.deepEqual(await playButtons(repo, teacher, [full]), { [full]: false }, "students only");
    });

    test("Live Challenge: only modes with enough fitting questions for the chosen skills", async () => {
      const withFull = await liveModesFor(repo, teacher, [full]);
      assert.ok(withFull.includes("quiz-race"));
      const withShort = await liveModesFor(repo, teacher, [short]);
      assert.ok(!withShort.includes("quiz-race"), "6 questions: not enough for Quiz Race");
      assert.ok(withShort.every((id) => gameMeta(id)!.live));
      assert.deepEqual(await liveModesFor(repo, student, [full]), [], "teachers and admins only");
      assert.ok((await liveModesFor(repo, teacher, [])).includes("quiz-race"), "no skill yet: what the whole bank can fill");
    });
  });
});
